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
import "./WorkerNotifications.css"; // เรียกใช้ CSS ล่าสุดที่แยกไฟล์ไว้
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
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
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
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  };

  const normalizeForModal = (n) => {
    const notiType = String(n?.notificationType || n?.type || "").toLowerCase();

    // ---- PROFILE REQUESTS ----
    const profileId = n?.relatedProfileRequestId || n?.profileUpdateRequest?.requestId;
    if (profileId || notiType.includes("profile")) {
      const req = n?.profileUpdateRequest || 
                  n?.employee?.profileUpdateRequests?.find((r) => Number(r.requestId) === Number(profileId));

      return {
        type: "PROFILE",
        requestId: req?.requestId ?? profileId,
        profileRequestId: req?.requestId ?? profileId,
        status: req?.status ?? n?.status ?? "Pending",
        oldName: req ? `${req.oldFirstName || ""} ${req.oldLastName || ""}`.trim() : n?.oldName,
        newName: req ? `${req.newFirstName || ""} ${req.newLastName || ""}`.trim() : n?.newName,
        reason: req?.reason ?? n?.reason,
        attachmentUrl: req?.attachmentUrl ?? n?.attachmentUrl,
        approvedByHR: req?.approvedByHR ?? n?.approvedByHR,
        notificationId: n?.notificationId,
        message: n?.message,
        createdAt: n?.createdAt,
      };
    }

    // ---- LEAVE REQUESTS ----
    const leaveId = n?.relatedRequestId || n?.relatedRequest?.requestId;
    if (leaveId || notiType.includes("leave") || notiType.includes("approval") || notiType.includes("rejection")) {
      const req = n?.relatedRequest;
      return {
        type: "LEAVE",
        requestId: req?.requestId ?? leaveId,
        leaveRequestId: req?.requestId ?? leaveId,
        status: req?.status ?? n?.status ?? "Pending",
        employeeName: req?.employee ? `${req.employee.firstName} ${req.employee.lastName}`.trim() : n?.employeeName,
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
      const res = await axiosClient.get("/notifications/my");
      const fetched = res.data?.notifications || [];

      setNotifications(
        fetched.map((n) => ({
          ...n,
          _ts: n.createdAt,
          _isNewSinceLastSeen: safeTs(n.createdAt) > lastSeen,
        }))
      );

      setSidebarUnreadZero();
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch (err) {
      alertError(t("common.error"), t("pages.workerNotifications.alert.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleClearAll = async () => {
    const ok = await alertConfirm(
      t("pages.workerNotifications.alert.clearAllTitle"),
      t("pages.workerNotifications.alert.clearAllText"),
      t("common.confirm")
    );
    if (!ok) return;

    try {
      await axiosClient.delete("/notifications/clear");
      await alertSuccess(t("common.success"), t("pages.workerNotifications.alert.cleared"));
      setNotifications([]);
      setSidebarUnreadZero();
      setPage(1);
    } catch (err) {
      alertError(t("common.error"), t("pages.workerNotifications.alert.clearFailed"));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axiosClient.put("/notifications/mark-all-read");
      await alertSuccess(t("common.success"), t("pages.workerNotifications.alert.markedRead"));
      fetchNotifications();
    } catch (err) {
      alertError(t("common.error"), t("pages.workerNotifications.alert.markReadFailed"));
    }
  };

  const deleteNoti = async (id) => {
    const ok = await alertConfirm(t("common.confirm"), t("pages.workerNotifications.alert.clearAllText"), t("common.confirm"));
    if (!ok) return;
    try {
      await axiosClient.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.notificationId !== id));
    } catch (err) {
      alertError(t("common.error"), t("common.somethingWentWrong"));
    }
  };

  const openQuick = (n) => {
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

  const renderTypeIcon = (type) => {
    const key = String(type || "").toLowerCase();
    if (key.includes("late")) return <FiAlertCircle style={{ color: "#ef4444" }} />;
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection")) return <FiInfo style={{ color: "#3b82f6" }} />;
    if (key.includes("profile")) return <FiInfo style={{ color: "#8b5cf6" }} />;
    return <FiBell style={{ color: "#64748b" }} />;
  };

  const renderTypeLabel = (type) => {
    const key = String(type || "").toLowerCase();
    if (key.includes("late")) return t("pages.workerNotifications.type.lateWarning");
    if (key.includes("profile")) return t("pages.workerNotifications.type.profile");
    if (key.includes("leave") || key.includes("approval") || key.includes("rejection")) return t("pages.workerNotifications.type.leave");
    return t("pages.workerNotifications.type.general");
  };

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">{t("pages.workerNotifications.title")}</h1>
          <p className="worker-datetime">{t("pages.workerNotifications.subtitle")}</p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn outline small" onClick={fetchNotifications} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span>{t("pages.workerNotifications.refresh")}</span>
          </button>

          <button className="btn outline small" onClick={handleMarkAllRead} disabled={notifications.length === 0}>
            <FiCheckCircle />
            <span>{t("pages.workerNotifications.markAllRead")}</span>
          </button>

          <button className="btn danger small" onClick={handleClearAll} disabled={notifications.length === 0}>
            <FiTrash2 />
            <span>{t("pages.workerNotifications.clearAll")}</span>
          </button>
        </div>
      </header>

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: "180px" }}>{t("pages.workerNotifications.table.type")}</th>
              <th>{t("pages.workerNotifications.table.message")}</th>
              <th style={{ width: "200px" }}>{t("pages.workerNotifications.table.time")}</th>
              <th style={{ textAlign: "center", width: "150px" }}>{t("pages.workerNotifications.table.action")}</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">{t("common.loading")}</td></tr>
            ) : pagedNotifications.length === 0 ? (
              <tr><td colSpan="4" className="empty">{t("pages.workerNotifications.noNotificationsFound")}</td></tr>
            ) : (
              pagedNotifications.map((n) => (
                <tr key={n.notificationId || n.id || `${n.notificationType}-${n._ts}`} className={n.isRead ? "read" : "unread"}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {renderTypeIcon(n.notificationType)}
                      <span style={{ fontWeight: 700 }}>{renderTypeLabel(n.notificationType)}</span>
                      {n._isNewSinceLastSeen && (
                        <span className="badge badge-ok">{t("pages.workerNotifications.badge.new")}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ color: "#334155", lineHeight: "1.5" }}>{n.message}</td>
                  <td style={{ color: "#64748b", fontSize: "13px" }}>
                    {moment(n.createdAt).locale(mLocale).format("DD MMM YYYY, HH:mm")}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div className="action-btns-group">
                      <button className="btn outline small" onClick={() => openQuick(n)}>
                        <FiCheck />
                        <span>{t("pages.workerNotifications.view")}</span>
                      </button>
                      <button 
                        className="btn danger small" 
                        style={{ padding: '6px' }} 
                        onClick={(e) => { e.stopPropagation(); deleteNoti(n.notificationId); }}
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

      <div className="pagination-footer">
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
          title={t("pages.workerNotifications.modal.title")}
          data={selected}
        />
      )}
    </div>
  );
}