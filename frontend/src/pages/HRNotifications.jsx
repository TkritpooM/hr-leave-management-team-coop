import React, { useEffect, useMemo, useState } from "react";
import {
  FiBell, FiTrash2, FiCheckCircle, FiRefreshCw,
  FiAlertCircle, FiCheck, FiInfo,
} from "react-icons/fi";
import "./WorkerNotifications.css"; // เรียกใช้ CSS สไตล์ Minimal
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

  // จัดการ Locale สำหรับ Moment และวันที่
  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
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

      setNotifications(fetched.map(n => ({
        ...n,
        _isNewSinceLastSeen: new Date(n.createdAt).getTime() > lastSeen,
      })));

      setSidebarUnreadZero();
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch (err) {
      alertError(t("common.error"), t("pages.workerNotifications.alert.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await axiosClient.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n));
    } catch (err) { console.error(err); }
  };

  const handleNotiClick = (noti) => {
    if (!noti.isRead) markAsRead(noti.notificationId);

    if (noti.message?.includes("Profile Update")) {
      const requestId = noti.message.match(/ID: (\d+)/)?.[1];
      navigate("/hr/profile-requests", { 
        state: { autoOpenId: requestId } 
      });
      return;
    }

    if (noti.relatedRequestId && noti.relatedRequest) {
      setSelectedRequest({
        requestId: noti.relatedRequestId,
        employeeName: noti.notificationType === "NewRequest" 
          ? (noti.message.split('from ')[1]?.split(' (')[0] || t("common.user"))
          : t("pages.hrProfileRequests.Employee"),
        leaveType: noti.relatedRequest.leaveType?.typeName || t("common.noResults"),
        startDate: noti.relatedRequest.startDate,
        endDate: noti.relatedRequest.endDate,
        startDuration: noti.relatedRequest.startDuration, 
        endDuration: noti.relatedRequest.endDuration,
        reason: noti.relatedRequest?.reason || t("common.noDataAvailable"),
        status: noti.relatedRequest.status,
        attachmentUrl: noti.relatedRequest.attachmentUrl, 
        isReadOnly: noti.relatedRequest.status !== "Pending" 
      });
      setIsModalOpen(true);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axiosClient.put("/notifications/mark-all-read");
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      await alertSuccess(t("common.success"), t("pages.workerNotifications.alert.markedRead"));
    } catch (err) { console.error(err); }
  };

  const deleteNoti = async (id) => {
    const ok = await alertConfirm(
          t("common.confirm"),
          t("pages.workerNotifications.alert.clearAllText"),
          t("common.confirm")
        );
    if (!ok) return;
    try {
      await axiosClient.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.notificationId !== id));
    } catch (err) { alertError(t("common.error"), t("common.error")); }
  };

  const handleClearAll = async () => {
    const ok = await alertConfirm(t("pages.workerNotifications.alert.clearAllTitle"), t("pages.workerNotifications.alert.clearAllText"), t("common.confirm"));
    if (!ok) return;
    try {
      await axiosClient.delete("/notifications/clear-all");
      setNotifications([]);
      await alertSuccess(t("common.success"), t("pages.workerNotifications.alert.cleared"));
    } catch (err) { alertError(t("common.error"), t("pages.workerNotifications.alert.clearFailed")); }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const pagedNotifications = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return notifications.slice(startIdx, startIdx + pageSize);
  }, [notifications, page, pageSize]);

  const getTitle = (type, message) => {
  if (message?.includes("Profile Update"))
    return t("pages.hrProfileRequests.title", "Profile Requests");
  if (type === "NewRequest")
    return t("pages.workerDashboard.Leave Request", "Leave Request");
  if (type === "Approved")
    return t("pages.workerLeave.Approved", "Approved");
  return t("pages.workerNotifications.type.general", "General");
};


  const renderTypeIcon = (type, message) => {
    if (message?.includes("Profile Update")) return <FiInfo style={{ color: "#8b5cf6" }} />;
    if (type === "NewRequest") return <FiAlertCircle style={{ color: "#ef4444" }} />;
    return <FiBell style={{ color: "#64748b" }} />;
  };

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">{t("pages.hrNotifications.HR Notifications")}</h1>
          <p className="worker-datetime">{t("pages.workerNotifications.subtitle")}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn outline small" onClick={fetchNotifications} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span>{t("pages.workerNotifications.refresh")}</span>
          </button>
          <button className="btn outline small" onClick={markAllAsRead} disabled={notifications.length === 0}>
            <FiCheckCircle />
            <span>{t("pages.hrNotifications.Mark all read")}</span>
          </button>
          <button className="btn danger small" onClick={handleClearAll} disabled={notifications.length === 0}>
            <FiTrash2 />
            <span>{t("pages.hrNotifications.Clear All")}</span>
          </button>
        </div>
      </header>

      <div className="history-table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: "220px" }}>{t("pages.workerNotifications.table.type")}</th>
              <th>{t("pages.workerNotifications.table.message")}</th>
              <th style={{ width: "220px" }}>{t("pages.workerNotifications.table.time")}</th>
              <th style={{ textAlign: "center", width: "150px" }}>{t("pages.workerNotifications.table.action")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">{t("common.loading")}</td></tr>
            ) : pagedNotifications.length === 0 ? (
              <tr><td colSpan="4" className="empty">{t("pages.hrNotifications.noNotifications")}</td></tr>
            ) : (
              pagedNotifications.map((n) => (
                <tr key={n.notificationId} className={n.isRead ? "read" : "unread"}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {renderTypeIcon(n.notificationType, n.message)}
                      <span style={{ fontWeight: 700 }}>{getTitle(n.notificationType, n.message)}</span>
                      {n._isNewSinceLastSeen && <span className="badge badge-ok">{t("pages.hrNotifications.NEW")}</span>}
                    </div>
                  </td>
                  <td style={{ color: "#334155", lineHeight: "1.5" }}>{n.message}</td>
                  <td style={{ color: "#64748b", fontSize: "13px" }}>
                    {new Date(n.createdAt).toLocaleString(mLocale === 'th' ? 'th-TH' : 'en-GB')}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div className="action-btns-group">
                      <button className="btn outline small" onClick={() => handleNotiClick(n)}>
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