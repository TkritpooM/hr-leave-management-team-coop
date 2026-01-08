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

const LAST_SEEN_KEY = "worker_notifications_last_seen";
const SIDEBAR_UNREAD_KEY = "worker_unread_notifications";

export default function WorkerNotifications() {
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

  const setSidebarUnreadZero = () => {
    try {
      localStorage.setItem(SIDEBAR_UNREAD_KEY, "0");
      window.dispatchEvent(new Event("worker_unread_notifications_updated"));
    } catch (_) {}
  };

  const safeTs = (ts) => {
    if (!ts) return 0;
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  const normalizeForModal = (n) => {
    // ✅ backend notification uses notificationType / relatedRequestId / relatedProfileRequestId
    const notiType = String(n?.notificationType || n?.type || "").toLowerCase();

    // ---- PROFILE ----
    const profileId = n?.relatedProfileRequestId || n?.profileUpdateRequest?.requestId;
    if (profileId || notiType.includes("profile")) {
      // backend include: employee.profileUpdateRequests (all)
      const req =
        n?.profileUpdateRequest ||
        n?.employee?.profileUpdateRequests?.find((r) => Number(r.requestId) === Number(profileId));

      return {
        type: "PROFILE",
        requestId: req?.requestId ?? profileId, // ✅ important
        profileRequestId: req?.requestId ?? profileId,
        status: req?.status ?? n?.status ?? "Pending",
        oldName: req ? `${req.oldFirstName || ""} ${req.oldLastName || ""}`.trim() : n?.oldName,
        newName: req ? `${req.newFirstName || ""} ${req.newLastName || ""}`.trim() : n?.newName,
        reason: req?.reason ?? n?.reason,
        attachmentUrl: req?.attachmentUrl ?? n?.attachmentUrl,
        approvedByHR: req?.approvedByHR ?? n?.approvedByHR,
        // keep original for reference
        notificationId: n?.notificationId,
        message: n?.message,
        createdAt: n?.createdAt,
      };
    }

    // ---- LEAVE ----
    const leaveId = n?.relatedRequestId || n?.relatedRequest?.requestId;
    if (leaveId || notiType.includes("leave") || notiType.includes("approval") || notiType.includes("rejection")) {
      const req = n?.relatedRequest;
      return {
        type: "LEAVE",
        requestId: req?.requestId ?? leaveId, // ✅ important
        leaveRequestId: req?.requestId ?? leaveId,
        status: req?.status ?? n?.status ?? "Pending",
        employeeName:
          req?.employeeName ||
          (req?.employee ? `${req.employee.firstName || ""} ${req.employee.lastName || ""}`.trim() : n?.employeeName),
        leaveType: req?.leaveType?.typeName ?? n?.leaveType,
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

    // ---- fallback: just view only ----
    return {
      type: "GENERAL",
      isReadOnly: true,
      message: n?.message,
      createdAt: n?.createdAt,
      notificationId: n?.notificationId,
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

      setSidebarUnreadZero();
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.workerNotifications.alert.loadFailed", "Failed to load notifications.")
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
      t("pages.workerNotifications.alert.clearAllTitle", "Clear all notifications?"),
      t(
        "pages.workerNotifications.alert.clearAllText",
        "This will remove all notifications. This action cannot be undone."
      ),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      // ✅ Backend: DELETE /api/notifications/clear  (ไม่ใช่ clear-all)
      await axiosClient.delete("/notifications/clear");
      await alertSuccess(
        t("common.success", "Success"),
        t("pages.workerNotifications.alert.cleared", "Cleared all notifications.")
      );
      setNotifications([]);
      setSidebarUnreadZero();
      setPage(1);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.workerNotifications.alert.clearFailed", "Failed to clear notifications.")
      );
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axiosClient.put("/notifications/mark-all-read");
      await alertSuccess(
        t("common.success", "Success"),
        t("pages.workerNotifications.alert.markedRead", "Marked all as read.")
      );
      fetchNotifications();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err?.response?.data?.message ||
          t("pages.workerNotifications.alert.markReadFailed", "Failed to mark all as read.")
      );
    }
  };

  const openQuick = (n) => {
    // ✅ สำคัญ: ส่งข้อมูลที่มี requestId เข้า modal
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
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection")) return <FiInfo />;
    if (key.includes("profile")) return <FiInfo />;
    return <FiBell />;
  };

  const renderTypeLabel = (typeOrNotiType) => {
    const key = String(typeOrNotiType || "").toLowerCase();
    if (key.includes("late"))
      return t("pages.workerNotifications.type.lateWarning", "Late Warning");
    if (key.includes("profile"))
      return t("pages.workerNotifications.type.profile", "Profile");
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection"))
      return t("pages.workerNotifications.type.leave", "Leave");
    return t("pages.workerNotifications.type.general", "General");
  };

  const renderTime = (ts) => {
    if (!ts) return "-";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "-";
    return moment(d).locale(mLocale).format("DD MMM YYYY, HH:mm");
  };

  return (
    <div className="page-card">
      <div className="worker-header" style={{ marginBottom: 10 }}>
        <div>
          <h1 className="worker-title">
            {t("pages.workerNotifications.title", "Notifications")}
          </h1>
          <p className="worker-datetime">
            {t("pages.workerNotifications.subtitle", "Updates, alerts, and actions for you.")}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn outline"
            onClick={fetchNotifications}
            disabled={loading}
            title={t("pages.workerNotifications.refresh", "Refresh")}
          >
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span style={{ marginLeft: 6 }}>{t("pages.workerNotifications.refresh", "Refresh")}</span>
          </button>

          <button className="btn outline" onClick={handleMarkAllRead} disabled={notifications.length === 0}>
            <FiCheckCircle />
            <span style={{ marginLeft: 6 }}>{t("pages.workerNotifications.markAllRead", "Mark all read")}</span>
          </button>

          <button className="btn danger" onClick={handleClearAll} disabled={notifications.length === 0}>
            <FiTrash2 />
            <span style={{ marginLeft: 6 }}>{t("pages.workerNotifications.clearAll", "Clear All")}</span>
          </button>
        </div>
      </div>

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>{t("pages.workerNotifications.table.type", "Type")}</th>
              <th>{t("pages.workerNotifications.table.message", "Message")}</th>
              <th>{t("pages.workerNotifications.table.time", "Time")}</th>
              <th style={{ textAlign: "center" }}>
                {t("pages.workerNotifications.table.action", "Action")}
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="empty">{t("common.loading", "Loading...")}</td>
              </tr>
            ) : pagedNotifications.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("pages.workerNotifications.noNotificationsFound", "No notifications found.")}
                </td>
              </tr>
            ) : (
              pagedNotifications.map((n) => (
                <tr key={n.notificationId || n.id || `${n.notificationType}-${n._ts || "x"}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ opacity: 0.9 }}>{renderTypeIcon(n.notificationType || n.type)}</span>
                      <span style={{ fontWeight: 700 }}>
                        {renderTypeLabel(n.notificationType || n.type)}
                      </span>

                      {n._isNewSinceLastSeen && (
                        <span
                          className="badge badge-ok"
                          style={{ marginLeft: 6, fontSize: 11, padding: "2px 8px", borderRadius: 999 }}
                        >
                          {t("pages.workerNotifications.badge.new", "NEW")}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ color: "#334155" }}>{n.message || "-"}</td>

                  <td style={{ color: "#64748b" }}>{renderTime(n.createdAt || n.timestamp)}</td>

                  <td style={{ textAlign: "center" }}>
                    <button className="btn outline small" onClick={() => openQuick(n)}>
                      <FiCheck />
                      <span style={{ marginLeft: 6 }}>{t("pages.workerNotifications.view", "View")}</span>
                    </button>

                    {!!n.link && (
                      <button
                        className="btn outline small"
                        style={{ marginLeft: 8 }}
                        onClick={() => navigate(n.link)}
                      >
                        {t("pages.workerNotifications.open", "Open")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Pagination
          total={notifications.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {quickOpen && (
        <QuickActionModal
          isOpen={quickOpen}
          onClose={closeQuick}
          title={t("pages.workerNotifications.modal.title", "Notification")}
          data={selected}
        />
      )}
    </div>
  );
}
