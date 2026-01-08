import React, { useEffect, useMemo, useState } from "react";
import {
  FiBell,
  FiTrash2,
  FiCheckCircle,
  FiRefreshCw,
  FiAlertCircle,
  FiCheck,
  FiInfo,
} from "react-icons/fi";
import "./WorkerNotifications.css";
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import QuickActionModal from "../components/QuickActionModal";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import moment from "moment";
import "moment/locale/th";
import axiosClient from "../api/axiosClient";

const LAST_SEEN_KEY = "hr_unread_notifications_last_seen";
const SIDEBAR_UNREAD_KEY = "hr_unread_notifications";

export default function HRNotifications() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en")
      .toLowerCase()
      .trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // ✅ ให้ sidebar unread = 0 (logic เดิม)
  const setSidebarUnreadZero = () => {
    try {
      localStorage.setItem(SIDEBAR_UNREAD_KEY, "0");
      window.dispatchEvent(new Event("hr_unread_notifications_updated"));
    } catch (_) {}
  };

  const safeTs = (ts) => {
    if (!ts) return 0;
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  // ✅ สำคัญสุด: แปลง Notification → payload ที่มี requestId จริง สำหรับ QuickActionModal
  const normalizeForModal = (n) => {
    const notiType = String(n?.notificationType || n?.type || "").toLowerCase();

    // ---- PROFILE ----
    const profileId =
      n?.relatedProfileRequestId ||
      n?.profileUpdateRequest?.requestId ||
      n?.profileUpdateRequestId ||
      n?.profile_request_id;

    if (profileId || notiType.includes("profile")) {
      const req =
        n?.profileUpdateRequest ||
        n?.employee?.profileUpdateRequests?.find(
          (r) => Number(r.requestId) === Number(profileId)
        );

      const oldNameFromReq = req
        ? `${req.oldFirstName || ""} ${req.oldLastName || ""}`.trim()
        : null;

      const newNameFromReq = req
        ? `${req.newFirstName || ""} ${req.newLastName || ""}`.trim()
        : null;

      return {
        type: "PROFILE",
        requestId: req?.requestId ?? profileId,
        profileRequestId: req?.requestId ?? profileId,
        status: req?.status ?? n?.status ?? "Pending",
        oldName: oldNameFromReq ?? n?.oldName ?? "-",
        newName: newNameFromReq ?? n?.newName ?? "-",
        reason: req?.reason ?? n?.reason,
        attachmentUrl: req?.attachmentUrl ?? n?.attachmentUrl,
        approvedByHR: req?.approvedByHR ?? n?.approvedByHR,

        // keep original info
        notificationId: n?.notificationId,
        message: n?.message,
        createdAt: n?.createdAt,
      };
    }

    // ---- LEAVE ----
    const leaveId =
      n?.relatedRequestId ||
      n?.relatedRequest?.requestId ||
      n?.leaveRequestId ||
      n?.leave_request_id;

    if (
      leaveId ||
      notiType.includes("leave") ||
      notiType.includes("approval") ||
      notiType.includes("rejection")
    ) {
      const req = n?.relatedRequest;

      const empName =
        req?.employeeName ||
        (req?.employee
          ? `${req.employee.firstName || ""} ${req.employee.lastName || ""}`.trim()
          : n?.employeeName);

      return {
        type: "LEAVE",
        requestId: req?.requestId ?? leaveId,
        leaveRequestId: req?.requestId ?? leaveId,
        status: req?.status ?? n?.status ?? "Pending",
        employeeName: empName || "-",
        leaveType: req?.leaveType?.typeName ?? n?.leaveType ?? "-",
        startDate: req?.startDate ?? n?.startDate,
        endDate: req?.endDate ?? n?.endDate,
        reason: req?.reason ?? n?.reason,
        attachmentUrl: req?.attachmentUrl ?? n?.attachmentUrl,
        approvedByHR: req?.approvedByHR ?? n?.approvedByHR,

        notificationId: n?.notificationId,
        message: n?.message,
        createdAt: n?.createdAt,
      };
    }

    // ---- fallback (view only) ----
    return {
      type: "GENERAL",
      isReadOnly: true,
      message: n?.message,
      createdAt: n?.createdAt,
      notificationId: n?.notificationId,
      status: n?.status || "Info",
    };
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);

      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY) || "0");

      // ✅ Backend: GET /api/notifications/my
      const res = await axiosClient.get("/notifications/my");
      const fetched = res.data?.notifications || res.data || [];

      setNotifications(
        fetched.map((n) => {
          const ts = n.createdAt || n.timestamp;
          return {
            ...n,
            _ts: ts,
            _isNewSinceLastSeen: safeTs(ts) > lastSeen,
          };
        })
      );

      // ✅ เปิดหน้ามาแล้ว ถือว่า seen
      setSidebarUnreadZero();
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.hrNotifications.alert.loadFailed", "Failed to load notifications.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearAll = async () => {
    const ok = await alertConfirm(
      t("pages.hrNotifications.alert.clearAllTitle", "Clear all notifications?"),
      t(
        "pages.hrNotifications.alert.clearAllText",
        "This will remove all notifications. This action cannot be undone."
      ),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      // ✅ Backend route: DELETE /api/notifications/clear-all
      await axiosClient.delete("/notifications/clear-all");
      await alertSuccess(
        t("common.success", "Success"),
        t("pages.hrNotifications.alert.cleared", "Cleared all notifications.")
      );
      setNotifications([]);
      setSidebarUnreadZero();
      setPage(1);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.hrNotifications.alert.clearFailed", "Failed to clear notifications.")
      );
    }
  };

  const handleMarkAllRead = async () => {
    try {
      // ✅ Backend route: PUT /api/notifications/mark-all-read
      await axiosClient.put("/notifications/mark-all-read");
      await alertSuccess(
        t("common.success", "Success"),
        t("pages.hrNotifications.alert.markedRead", "Marked all as read.")
      );
      fetchNotifications();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.hrNotifications.alert.markReadFailed", "Failed to mark all as read.")
      );
    }
  };

  const openQuick = (n) => {
    // ✅ สำคัญ: ส่ง payload ที่มี requestId จริงเข้า modal
    setSelected(normalizeForModal(n));
    setQuickOpen(true);
  };

  const closeQuick = () => {
    setQuickOpen(false);
    setSelected(null);
  };

  const pagedNotifications = useMemo(() => {
    const start = (page - 1) * pageSize;
    return notifications.slice(start, start + pageSize);
  }, [notifications, page, pageSize]);

  const renderTypeIcon = (typeOrNotiType) => {
    const key = String(typeOrNotiType || "").toLowerCase();
    if (key.includes("late")) return <FiAlertCircle />;
    if (key.includes("profile")) return <FiInfo />;
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection"))
      return <FiInfo />;
    return <FiBell />;
  };

  const renderTypeLabel = (typeOrNotiType) => {
    const key = String(typeOrNotiType || "").toLowerCase();
    if (key.includes("late"))
      return t("pages.hrNotifications.type.lateWarning", "Late Warning");
    if (key.includes("profile"))
      return t("pages.hrNotifications.type.profile", "Profile");
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection"))
      return t("pages.hrNotifications.type.leave", "Leave");
    return t("pages.hrNotifications.type.general", "General");
  };

  const renderTime = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "-";
    return moment(d).locale(mLocale).format("DD MMM YYYY, HH:mm");
  };

  return (
    <div className="page-card">
      {/* Header */}
      <div className="worker-header" style={{ marginBottom: 10 }}>
        <div>
          <h1 className="worker-title">
            {t("pages.hrNotifications.title", "Notifications")}
          </h1>
          <p className="worker-datetime">
            {t("pages.hrNotifications.subtitle", "Updates, alerts, and actions for HR.")}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn outline"
            onClick={fetchNotifications}
            disabled={loading}
            title={t("pages.hrNotifications.refresh", "Refresh")}
          >
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span style={{ marginLeft: 6 }}>
              {t("pages.hrNotifications.refresh", "Refresh")}
            </span>
          </button>

          <button
            className="btn outline"
            onClick={handleMarkAllRead}
            disabled={notifications.length === 0}
          >
            <FiCheckCircle />
            <span style={{ marginLeft: 6 }}>
              {t("pages.hrNotifications.markAllRead", "Mark all read")}
            </span>
          </button>

          <button
            className="btn danger"
            onClick={handleClearAll}
            disabled={notifications.length === 0}
          >
            <FiTrash2 />
            <span style={{ marginLeft: 6 }}>
              {t("pages.hrNotifications.clearAll", "Clear All")}
            </span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>{t("pages.hrNotifications.table.type", "Type")}</th>
              <th>{t("pages.hrNotifications.table.message", "Message")}</th>
              <th>{t("pages.hrNotifications.table.time", "Time")}</th>
              <th style={{ textAlign: "center" }}>
                {t("pages.hrNotifications.table.action", "Action")}
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("common.loading", "Loading...")}
                </td>
              </tr>
            ) : pagedNotifications.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("pages.hrNotifications.noNotificationsFound", "No notifications found.")}
                </td>
              </tr>
            ) : (
              pagedNotifications.map((n) => (
                <tr key={n.notificationId || n.id || `${n.notificationType}-${n._ts || "x"}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ opacity: 0.9 }}>
                        {renderTypeIcon(n.notificationType || n.type)}
                      </span>

                      <span style={{ fontWeight: 700 }}>
                        {renderTypeLabel(n.notificationType || n.type)}
                      </span>

                      {n._isNewSinceLastSeen && (
                        <span
                          className="badge badge-ok"
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {t("pages.hrNotifications.badge.new", "NEW")}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ color: "#334155" }}>{n.message || "-"}</td>

                  <td style={{ color: "#64748b" }}>
                    {renderTime(n.createdAt || n.timestamp)}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <button className="btn outline small" onClick={() => openQuick(n)}>
                      <FiCheck />
                      <span style={{ marginLeft: 6 }}>
                        {t("pages.hrNotifications.view", "View")}
                      </span>
                    </button>

                    {!!n.link && (
                      <button
                        className="btn outline small"
                        style={{ marginLeft: 8 }}
                        onClick={() => navigate(n.link)}
                      >
                        {t("pages.hrNotifications.open", "Open")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Pagination
          total={notifications.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Modal */}
      {quickOpen && (
        <QuickActionModal
          isOpen={quickOpen}
          onClose={closeQuick}
          title={t("pages.hrNotifications.modal.title", "Notification")}
          data={selected}
          t={t}
        />
      )}
    </div>
  );
}
