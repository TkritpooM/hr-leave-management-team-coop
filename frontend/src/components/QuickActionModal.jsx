import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import moment from "moment";
import {
  FiX,
  FiInfo,
  FiCalendar,
  FiClock,
  FiUser,
  FiCheckCircle,
  FiXCircle,
  FiFileText,
  FiLoader,
  FiPaperclip,
  FiArrowRight,
} from "react-icons/fi";
import axiosClient, { baseURL } from "../api/axiosClient";
import { alertSuccess, alertError, alertConfirm } from "../utils/sweetAlert";
import "./QuickActionModal.css";
import { useTranslation } from "react-i18next";

// ✅ รองรับทั้ง prop เก่า (requestData) และ prop ใหม่ (data)
const QuickActionModal = ({
  isOpen,
  onClose,
  requestData,
  data,
  onActionSuccess,
  title,
  t: propT,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t: tHook, i18n } = useTranslation();
  const t = propT || tHook;

  // ✅ rootURL จาก baseURL แล้วตัด /api ออก
  const rootURL = useMemo(
    () =>
      String(baseURL || "")
        .replace(/\/+$/, "")
        .replace(/\/api$/i, ""),
    []
  );

  // ✅ moment locale ตามภาษา
  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en")
      .toLowerCase()
      .trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const payload = requestData || data;
  if (!isOpen || !payload) return null;

  // ✅ helper: translate message from backend (key or plain text) + meta
  const translateApiMessage = (msgKeyOrText, rawMeta) => {
    if (!msgKeyOrText) return "";
    const meta = rawMeta || {};
    return t(msgKeyOrText, { ...meta, defaultValue: msgKeyOrText });
  };

  // ✅ helper: หา ID จากหลายชื่อ field (กันพัง)
  const pickId = (p) =>
    p?.requestId ??
    p?.leaveRequestId ??
    p?.profileRequestId ??
    p?.notificationId ??
    p?.relatedRequestId ??
    p?.relatedProfileRequestId ??
    p?.relatedRequest?.requestId ??
    p?.profileUpdateRequest?.requestId ??
    p?.id ??
    p?.request_id ??
    p?.leave_request_id ??
    p?.profile_request_id ??
    p?.data?.requestId ??
    p?.data?.leaveRequestId ??
    p?.data?.id ??
    p?.meta?.requestId ??
    p?.meta?.leaveRequestId ??
    null;

  // ✅ helper: เดา type ถ้าไม่ได้ส่งมา
  const inferType = (p) => {
    const raw = String(p?.type || "").toUpperCase();
    if (raw === "PROFILE" || raw === "LEAVE") return raw;

    // ถ้ามี oldName/newName หรือแนว profile
    if (p?.oldName || p?.newName) return "PROFILE";
    // ถ้ามี leaveType / startDate / endDate
    if (p?.leaveType || p?.startDate || p?.endDate) return "LEAVE";

    // เผื่อเป็น notification ประเภทอื่น → read-only
    return "GENERAL";
  };

  const type = inferType(payload);
  const status = payload?.status || "Pending";

  const approvalId = pickId(payload);

  const isPending =
    String(status).toLowerCase() === "pending" ||
    String(status).toLowerCase() === "waiting";

  const isApproved = String(status).toLowerCase() === "approved";
  const isRejected = String(status).toLowerCase() === "rejected";

  // fields (leave)
  const employeeName = payload?.employeeName || payload?.employee?.name || "-";
  const leaveType = payload?.leaveType || payload?.leave?.type || "-";
  const startDate = payload?.startDate;
  const endDate = payload?.endDate;
  const reason = payload?.reason;

  // fields (profile)
  const oldName = payload?.oldName;
  const newName = payload?.newName;

  const approvedByHR = payload?.approvedByHR;

  const attachmentUrl = payload?.attachmentUrl || payload?.attachment || payload?.file;

  const isReadOnly =
    payload?.isReadOnly ||
    type === "GENERAL" ||
    !isPending; // ไม่ pending ก็ไม่ให้กด

  const renderPeriod = () => {
    const s = startDate ? moment(startDate) : null;
    const e = endDate ? moment(endDate) : null;
    if (!s || !s.isValid()) return "-";

    // Helper แปลงค่า Duration เป็นข้อความ (เช็คค่า Half ตาม Schema)
    const getDurationText = (dur) => {
      if (dur === "HalfMorning")
        return ` (${t("pages.hrAttendancePage.halfMorning", "Morning")})`;
      if (dur === "HalfAfternoon")
        return ` (${t("pages.hrAttendancePage.halfAfternoon", "Afternoon")})`;
      return ""; // Full
    };

    // 1) Same Day
    if (!e || !e.isValid() || s.isSame(e, "day")) {
      const durLabel = getDurationText(payload?.startDuration);
      return `${s.format("DD MMM YYYY")}${durLabel}`;
    }

    // 2) Multi-day
    const startLabel = `${s.format("DD MMM")}${getDurationText(payload?.startDuration)}`;
    const endLabel = `${e.format("DD MMM YYYY")}${getDurationText(payload?.endDuration)}`;
    return `${startLabel} - ${endLabel}`;
  };

  // ✅ ยิง endpoint ตามประเภท
  const submitAction = async (action) => {
    if (!approvalId) {
      return alertError(
        t("common.error", "Error"),
        t("components.quickActionModal.missingRequestId", "Missing request id.")
      );
    }

    const isApprove = action === "approve";
    const confirmTitle = isApprove
      ? t("components.quickActionModal.confirmApproveTitle", "Approve Request")
      : t("components.quickActionModal.confirmRejectTitle", "Reject Request");

    const confirmText =
      type === "PROFILE"
        ? isApprove
          ? t(
            "components.quickActionModal.confirmApproveProfileText",
            "Approve this profile update request?"
          )
          : t(
            "components.quickActionModal.confirmRejectProfileText",
            "Reject this profile update request?"
          )
        : isApprove
          ? t(
            "components.quickActionModal.confirmApproveText",
            "Are you sure you want to approve this leave request?"
          )
          : t(
            "components.quickActionModal.confirmRejectText",
            "Are you sure you want to reject this leave request?"
          );

    const confirmBtn = isApprove
      ? t("common.approve", "Approve")
      : t("common.reject", "Reject");

    const ok = await alertConfirm(confirmTitle, confirmText, confirmBtn);
    if (!ok) return;

    setIsSubmitting(true);
    try {
      let res;

      if (type === "PROFILE") {
        // ✅ backend: PUT /api/auth/admin/profile-approval/:requestId
        res = await axiosClient.put(`/auth/admin/profile-approval/${approvalId}`, {
          action,
        });
      } else {
        // ✅ leave: PUT /api/leave/admin/approval/:requestId
        res = await axiosClient.put(`/leave/admin/approval/${approvalId}`, {
          action,
        });
      }

      const msgKeyOrText = res.data?.message;
      const meta = res.data?.meta || res.data?.data || {};

      if (res.data?.success) {
        await alertSuccess(
          t("common.success", "Success"),
          msgKeyOrText
            ? translateApiMessage(msgKeyOrText, meta)
            : t("components.quickActionModal.actionSuccess", "Action completed successfully.")
        );
        onClose?.();
        onActionSuccess?.();
      } else {
        alertError(
          t("common.error", "Error"),
          msgKeyOrText
            ? translateApiMessage(msgKeyOrText, meta)
            : t("components.quickActionModal.actionFailed", "Failed to process request.")
        );
      }
    } catch (err) {
      const msgKeyOrText = err?.response?.data?.message;
      const meta = err?.response?.data?.meta || err?.response?.data?.data || {};
      alertError(
        t("common.error", "Error"),
        msgKeyOrText
          ? translateApiMessage(msgKeyOrText, meta)
          : t("components.quickActionModal.actionFailed", "Failed to process request.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle =
    title ||
    (type === "PROFILE"
      ? t("components.quickActionModal.profileTitle", "Profile Update Detail")
      : type === "LEAVE"
        ? t("components.quickActionModal.leaveTitle", "Leave Request Detail")
        : t("pages.workerNotifications.modal.title", "Notification"));

  const attachmentHref =
    attachmentUrl &&
    (type === "PROFILE"
      ? `${rootURL}/uploads/profiles/${attachmentUrl}`
      : `${rootURL}/uploads/${attachmentUrl}`);

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="qa-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="qa-modal-header">
          <div className="qa-title">
            <div className="qa-icon-header">
              <FiInfo />
            </div>
            <span>{headerTitle}</span>
          </div>
          <button
            className="qa-close-btn"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
          >
            <FiX />
          </button>
        </div>

        {/* Body */}
        <div className="qa-modal-body">
          <div className="qa-status-wrapper">
            <span
              className={`qa-badge ${isApproved ? "status-approved" : isRejected ? "status-rejected" : "status-pending"
                }`}
            >
              {isApproved ? <FiCheckCircle /> : isRejected ? <FiXCircle /> : <FiClock />}
              {t(`common.status.${String(status).toLowerCase()}`, String(status))}
            </span>
          </div>

          <div className="qa-info-list">
            {type === "PROFILE" ? (
              <>
                <div className="qa-info-row">
                  <FiUser className="qa-row-icon" />
                  <span className="qa-label">
                    {t("components.quickActionModal.currentName", "Current Name")}
                  </span>
                  <span className="qa-value">{oldName || "-"}</span>
                </div>
                <div className="qa-info-row">
                  <FiArrowRight className="qa-row-icon" />
                  <span className="qa-label">
                    {t("components.quickActionModal.newName", "New Name")}
                  </span>
                  <span className="qa-value" style={{ fontWeight: 800 }}>
                    {newName || "-"}
                  </span>
                </div>
              </>
            ) : type === "LEAVE" ? (
              <>
                <div className="qa-info-row">
                  <FiUser className="qa-row-icon" />
                  <span className="qa-label">
                    {t("components.quickActionModal.employee", "Employee")}
                  </span>
                  <span className="qa-value">{employeeName}</span>
                </div>

                <div className="qa-info-row">
                  <FiFileText className="qa-row-icon" />
                  <span className="qa-label">
                    {t("components.quickActionModal.type", "Type")}
                  </span>
                  <span className="qa-value">{leaveType}</span>
                </div>

                <div className="qa-info-row">
                  <FiCalendar className="qa-row-icon" />
                  <span className="qa-label">
                    {t("components.quickActionModal.period", "Period")}
                  </span>
                  <span className="qa-value">{renderPeriod()}</span>
                </div>
              </>
            ) : null}

            {approvedByHR && (
              <div className="qa-info-row">
                {isApproved ? (
                  <FiCheckCircle className="qa-row-icon" />
                ) : (
                  <FiXCircle className="qa-row-icon" />
                )}
                <span className="qa-label">
                  {isApproved
                    ? t("components.quickActionModal.approved", "Approved")
                    : t("components.quickActionModal.rejected", "Rejected")}
                </span>
                <span className="qa-value">
                  {`${approvedByHR.firstName || ""} ${approvedByHR.lastName || ""}`.trim()}
                </span>
              </div>
            )}
          </div>

          {attachmentUrl && (
            <a
              href={attachmentHref}
              target="_blank"
              rel="noreferrer"
              className="qa-attachment-link"
            >
              <FiPaperclip />
              <span className="qa-attachment-text">
                {t("components.quickActionModal.viewDoc", "View Supporting Document")}
              </span>
            </a>
          )}

          <div className="qa-reason-box">
            <label className="qa-reason-label">
              {t("components.quickActionModal.reason", "Reason / Note")}
            </label>
            <p className="qa-reason-text">
              {reason || t("components.quickActionModal.noReason", "No reason provided.")}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="qa-modal-footer">
          {isPending && !isReadOnly && (type === "LEAVE" || type === "PROFILE") ? (
            <div className="minimal-actions">
              <button
                className="m-btn m-btn-reject"
                onClick={() => submitAction("reject")}
                disabled={isSubmitting}
              >
                {isSubmitting ? <FiLoader className="spin" /> : <FiXCircle />}{" "}
                {t("common.reject", "Reject")}
              </button>
              <button
                className="m-btn m-btn-approve"
                onClick={() => submitAction("approve")}
                disabled={isSubmitting}
              >
                {isSubmitting ? <FiLoader className="spin" /> : <FiCheckCircle />}{" "}
                {t("common.approve", "Approve")}
              </button>
            </div>
          ) : (
            <button className="m-btn m-btn-close" onClick={onClose}>
              {t("components.quickActionModal.close", "Close")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default QuickActionModal;
