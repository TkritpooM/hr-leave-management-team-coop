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
import "./WorkerNotifications.css"; // ใช้ CSS เดิม
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import QuickActionModal from "../components/QuickActionModal";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import moment from "moment";
import "moment/locale/th";
import axiosClient from "../api/axiosClient";

const LAST_SEEN_KEY = "hr_notifications_last_seen";
const SIDEBAR_UNREAD_KEY = "hr_unread_notifications";

export default function HRNotifications() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Moment locale
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
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const setSidebarUnreadZero = () => {
    localStorage.setItem(SIDEBAR_UNREAD_KEY, "0");
    window.dispatchEvent(new Event("storage"));
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const lastSeen = Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;

      const res = await axiosClient.get("/notifications/my");
      const fetched = res.data.notifications || res.data || [];

      setNotifications(
        fetched.map((n) => ({
          ...n,
          _isNewSinceLastSeen: new Date(n.createdAt).getTime() > lastSeen,
        }))
      );

      setSidebarUnreadZero();
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch (err) {
      alertError(
        t("common.error"),
        t("pages.hrNotifications.alert.loadFailed", {
          defaultValue: t("pages.workerNotifications.alert.loadFailed"),
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await axiosClient.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === id ? { ...n, isRead: true } : n
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Identify if this notification is about profile update requests.
   * Supports:
   * - new style: message key like "notifications.profile.newUpdateRequest"
   * - old style: text contains "Profile Update"
   */
  const isProfileUpdateNoti = (noti) => {
    const msg = String(noti?.message || "");
    return (
      msg.startsWith("notifications.profile.") ||
      msg.includes("Profile Update")
    );
  };

  /**
   * Extract request id (for profile requests)
   * Priority: meta.requestId -> relatedRequestId -> regex in old string
   */
  const extractRequestId = (noti) => {
    const metaId =
      noti?.meta?.requestId ??
      noti?.meta?.id ??
      noti?.meta?.profileRequestId;
    if (metaId !== undefined && metaId !== null && String(metaId) !== "") {
      return String(metaId);
    }
    if (noti?.relatedRequestId) return String(noti.relatedRequestId);

    const msg = String(noti?.message || "");
    const match = msg.match(/ID:\s*(\d+)/i);
    return match?.[1];
  };

  const handleNotiClick = (noti) => {
    if (!noti.isRead) markAsRead(noti.notificationId);

    // Profile update request -> go to profile requests page
    if (isProfileUpdateNoti(noti)) {
      const requestId = extractRequestId(noti);
      navigate("/hr/profile-requests", {
        state: { autoOpenId: requestId },
      });
      return;
    }

    // Leave request -> open QuickActionModal
    if (noti.relatedRequestId && noti.relatedRequest) {
      const employeeNameFromMeta =
        noti?.meta?.employeeName || noti?.meta?.requesterName;

      // old fallback (string parse) สำหรับ noti เก่าที่ message เป็นอังกฤษเต็ม ๆ
      const employeeNameFromOldText =
        noti.notificationType === "NewRequest"
          ? (String(noti.message || "")
              .split("from ")[1]
              ?.split(" (")[0] || "")
          : "";

      setSelectedRequest({
        requestId: noti.relatedRequestId,
        employeeName:
          employeeNameFromMeta ||
          employeeNameFromOldText ||
          t("common.user"),
        leaveType:
          noti.relatedRequest.leaveType?.typeName ||
          t("common.noResults"),
        startDate: noti.relatedRequest.startDate,
        endDate: noti.relatedRequest.endDate,
        startDuration: noti.relatedRequest.startDuration,
        endDuration: noti.relatedRequest.endDuration,
        reason: noti.relatedRequest?.reason || t("common.noDataAvailable"),
        status: noti.relatedRequest.status,
        attachmentUrl: noti.relatedRequest.attachmentUrl,
        isReadOnly: noti.relatedRequest.status !== "Pending",
      });
      setIsModalOpen(true);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axiosClient.put("/notifications/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await alertSuccess(
        t("common.success"),
        t("pages.hrNotifications.alert.markedRead", {
          defaultValue: t("pages.workerNotifications.alert.markedRead"),
        })
      );
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNoti = async (id) => {
    const ok = await alertConfirm(
      t("common.confirm"),
      t("pages.hrNotifications.alert.deleteOneConfirmText", {
        defaultValue: t("pages.workerNotifications.alert.clearAllText"),
      }),
      t("common.confirm")
    );
    if (!ok) return;

    try {
      await axiosClient.delete(`/notifications/${id}`);
      setNotifications((prev) =>
        prev.filter((n) => n.notificationId !== id)
      );
    } catch (err) {
      alertError(t("common.error"), t("common.error"));
    }
  };

  const handleClearAll = async () => {
    const ok = await alertConfirm(
      t("pages.hrNotifications.alert.clearAllTitle", {
        defaultValue: t("pages.workerNotifications.alert.clearAllTitle"),
      }),
      t("pages.hrNotifications.alert.clearAllText", {
        defaultValue: t("pages.workerNotifications.alert.clearAllText"),
      }),
      t("common.confirm")
    );
    if (!ok) return;

    try {
      await axiosClient.delete("/notifications/clear-all");
      setNotifications([]);
      await alertSuccess(
        t("common.success"),
        t("pages.hrNotifications.alert.cleared", {
          defaultValue: t("pages.workerNotifications.alert.cleared"),
        })
      );
    } catch (err) {
      alertError(
        t("common.error"),
        t("pages.hrNotifications.alert.clearFailed", {
          defaultValue: t("pages.workerNotifications.alert.clearFailed"),
        })
      );
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const pagedNotifications = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return notifications.slice(startIdx, startIdx + pageSize);
  }, [notifications, page, pageSize]);

  /**
   * Card title per notification
   * Supports both new i18n-key style and legacy text.
   */
  const getTitle = (type, message) => {
    const msg = String(message || "");

    if (msg.startsWith("notifications.profile.") || msg.includes("Profile Update")) {
      return t("pages.hrNotifications.types.profileUpdate");
    }
    if (type === "NewRequest") return t("pages.hrNotifications.types.leaveRequest");
    if (type === "Approved") return t("pages.hrNotifications.types.approved");
    if (type === "Rejected") return t("pages.hrNotifications.types.rejected");
    return t("pages.hrNotifications.types.general");
  };

  const renderTypeIcon = (type, message) => {
    const msg = String(message || "");
    if (msg.startsWith("notifications.profile.") || msg.includes("Profile Update")) {
      return <FiInfo style={{ color: "#8b5cf6" }} />;
    }
    if (type === "NewRequest") return <FiAlertCircle style={{ color: "#ef4444" }} />;
    return <FiBell style={{ color: "#64748b" }} />;
  };

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">{t("pages.hrNotifications.title")}</h1>
          <p className="worker-datetime">{t("pages.hrNotifications.subtitle")}</p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn outline small"
            onClick={fetchNotifications}
            disabled={loading}
          >
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span>{t("pages.hrNotifications.actions.refresh")}</span>
          </button>

          <button
            className="btn outline small"
            onClick={markAllAsRead}
            disabled={notifications.length === 0}
          >
            <FiCheckCircle />
            <span>{t("pages.hrNotifications.actions.markAllRead")}</span>
          </button>

          <button
            className="btn danger small"
            onClick={handleClearAll}
            disabled={notifications.length === 0}
          >
            <FiTrash2 />
            <span>{t("pages.hrNotifications.actions.clearAll")}</span>
          </button>
        </div>
      </header>

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: "220px" }}>
                {t("pages.hrNotifications.table.type")}
              </th>
              <th>{t("pages.hrNotifications.table.message")}</th>
              <th style={{ width: "220px" }}>
                {t("pages.hrNotifications.table.time")}
              </th>
              <th style={{ textAlign: "center", width: "150px" }}>
                {t("pages.hrNotifications.table.action")}
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("common.loading")}
                </td>
              </tr>
            ) : pagedNotifications.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("pages.hrNotifications.noNotifications")}
                </td>
              </tr>
            ) : (
              pagedNotifications.map((n) => (
                <tr
                  key={n.notificationId}
                  className={n.isRead ? "read" : "unread"}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {renderTypeIcon(n.notificationType, n.message)}
                      <span style={{ fontWeight: 700 }}>
                        {getTitle(n.notificationType, n.message)}
                      </span>
                      {n._isNewSinceLastSeen && (
                        <span className="badge badge-ok">
                          {t("pages.hrNotifications.badge.new")}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* ✅ Message: supports i18n key + meta; fallback to raw message */}
                  <td style={{ color: "#334155", lineHeight: "1.5" }}>
                    {n.message
                      ? t(n.message, { ...(n.meta || {}), defaultValue: n.message })
                      : t("common.noDataAvailable")}
                  </td>

                  <td style={{ color: "#64748b", fontSize: "13px" }}>
                    {new Date(n.createdAt).toLocaleString(
                      mLocale === "th" ? "th-TH" : "en-GB"
                    )}
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <div className="action-btns-group">
                      <button
                        className="btn outline small"
                        onClick={() => handleNotiClick(n)}
                      >
                        <FiCheck />
                        <span>{t("pages.hrNotifications.actions.view")}</span>
                      </button>

                      <button
                        className="btn danger small"
                        style={{ padding: "6px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNoti(n.notificationId);
                        }}
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && notifications.length > 0 && (
        <div className="pagination-footer">
          <Pagination
            total={notifications.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <QuickActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        requestData={selectedRequest}
        onActionSuccess={fetchNotifications}
        t={t}
      />
    </div>
  );
}
