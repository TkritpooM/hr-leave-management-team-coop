import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { 
  FiBell, 
  FiTrash2, 
  FiCheckCircle, 
  FiRefreshCw, 
  FiXCircle, 
  FiCheck,
  FiInfo 
} from "react-icons/fi";
import "./WorkerNotifications.css";
import Pagination from "../components/Pagination"; 

const api = axios.create({ baseURL: "http://localhost:8000" });
const getAuthHeader = () => ({ 
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } 
});

export default function WorkerNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/notifications/my", getAuthHeader());
      const fetchedNotis = res.data.notifications || [];
      setNotifications(fetchedNotis);
      
      const unreadCount = fetchedNotis.filter(n => !n.isRead).length;
      localStorage.setItem("worker_unread_notifications", unreadCount.toString());
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const total = notifications.length;
  const startIdx = (page - 1) * pageSize;
  const pagedNotifications = useMemo(() => {
    return notifications.slice(startIdx, startIdx + pageSize);
  }, [notifications, startIdx, pageSize]);

  const markAsRead = async (id) => {
    try {
      await api.put(`/api/notifications/${id}/read`, {}, getAuthHeader());
      const updatedNotis = notifications.map(n => 
        n.notificationId === id ? { ...n, isRead: true } : n
      );
      setNotifications(updatedNotis);

      const unreadCount = updatedNotis.filter(n => !n.isRead).length;
      localStorage.setItem("worker_unread_notifications", unreadCount.toString());
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("Mark read failed:", err);
    }
  };

  // ✅ ฟังก์ชัน Mark All Read สำหรับ Worker
  const handleMarkAllAsRead = async () => {
    try {
      await api.put("/api/notifications/mark-all-read", {}, getAuthHeader());
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));

      localStorage.setItem("worker_unread_notifications", "0");
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("Mark all read failed:", err);
    }
  };

  const deleteNoti = async (id) => {
    if (!window.confirm("คุณต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?")) return;
    try {
      await api.delete(`/api/notifications/${id}`, getAuthHeader());
      const filteredNotis = notifications.filter(n => n.notificationId !== id);
      setNotifications(filteredNotis);

      const unreadCount = filteredNotis.filter(n => !n.isRead).length;
      localStorage.setItem("worker_unread_notifications", unreadCount.toString());
      window.dispatchEvent(new Event("storage"));

      if (pagedNotifications.length === 1 && page > 1) setPage(page - 1);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("คุณต้องการลบการแจ้งเตือนทั้งหมดใช่หรือไม่?")) return;
    try {
      const res = await api.delete("/api/notifications/clear-all", getAuthHeader());
      if (res.data.success) {
        setNotifications([]);
        setPage(1);
        localStorage.setItem("worker_unread_notifications", "0");
        window.dispatchEvent(new Event("storage"));
      }
    } catch (err) {
      console.error("Clear all failed:", err);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "Approval": return <FiCheckCircle style={{ color: "#10b981" }} />;
      case "Rejection": return <FiXCircle style={{ color: "#ef4444" }} />;
      default: return <FiInfo style={{ color: "#3b82f6" }} />;
    }
  };

  const getStatusClass = (type) => {
    if (type === "Rejection") return "danger";
    if (type === "Approval") return "ok";
    return "info";
  };

  return (
    <div className="page-card wn">
      <div className="wn-head">
        <div>
          <h2 className="wn-title">Notifications</h2>
          <p className="wn-sub">แสดงรายการแจ้งเตือนสถานะคำขอลา (หน้า {page})</p>
        </div>
        
        {/* ✅ ปรับ Actions ให้มีปุ่ม Mark all read และ UI เหมือนหน้า HR */}
        <div className="wn-actions">
          <button className="emp-btn emp-btn-outline small" onClick={fetchNotifications} title="Refresh">
            <FiRefreshCw className={loading ? "spin" : ""} />
          </button>
          
          <button className="emp-btn emp-btn-outline small" onClick={handleClearAll} disabled={notifications.length === 0}>
            <FiTrash2 /> Clear All
          </button>

          <button className="emp-btn emp-btn-primary small" onClick={handleMarkAllAsRead} disabled={notifications.length === 0}>
            <FiCheck /> Mark all read
          </button>
        </div>
      </div>

      <div className="wn-list">
        {loading ? (
          <div className="wn-empty">
            <FiRefreshCw className="spin" size={24} />
            <p>กำลังโหลดข้อมูล...</p>
          </div>
        ) : pagedNotifications.length === 0 ? (
          <div className="wn-empty">
            <FiBell style={{ opacity: 0.5 }} size={32} />
            <p>ยังไม่มีการแจ้งเตือนในขณะนี้</p>
          </div>
        ) : (
          pagedNotifications.map((n) => (
            <div 
              key={n.notificationId} 
              className={`wn-item ${getStatusClass(n.notificationType)} ${n.isRead ? 'read' : 'unread'}`}
              onClick={() => !n.isRead && markAsRead(n.notificationId)}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div className="noti-icon-box" style={{ marginTop: '4px', fontSize: '20px' }}>
                  {getNotificationIcon(n.notificationType)}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div className="wn-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {n.notificationType === "Approval" ? "คำขอลาได้รับการอนุมัติ" : 
                     n.notificationType === "Rejection" ? "คำขอลาถูกปฏิเสธ" : "แจ้งเตือนระบบ"}
                    {!n.isRead && <span className="badge-new">NEW</span>}
                  </div>
                  <div className="wn-item-msg">{n.message}</div>
                  <div className="wn-item-time">
                    {new Date(n.createdAt).toLocaleString("en-GB", {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <button 
                  className="delete-btn-icon"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNoti(n.notificationId);
                  }}
                  title="Delete"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && notifications.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <Pagination 
            total={total} 
            page={page} 
            pageSize={pageSize} 
            onPageChange={setPage} 
            onPageSizeChange={setPageSize} 
          />
        </div>
      )}
    </div>
  );
}