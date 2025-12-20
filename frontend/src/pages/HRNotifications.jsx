import React, { useEffect, useState } from "react";
import axios from "axios";
import { 
  FiBell, 
  FiTrash2, 
  FiCheckCircle, 
  FiRefreshCw, 
  FiAlertCircle, 
  FiCheck,
  FiInfo 
} from "react-icons/fi";
import "./WorkerNotifications.css";

const api = axios.create({ baseURL: "http://localhost:8000" });
const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function HRNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/notifications/my", getAuthHeader());
      setNotifications(res.data.notifications || []);
      
      // ล้างตัวเลข Badge บน Sidebar
      localStorage.setItem("hr_unread_notifications", "0");
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("Failed to fetch HR notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllAsRead = async () => {
    try {
      // Mockup logic สำหรับการอ่านทั้งหมด
      console.log("Marking all as read...");
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (err) { console.error(err); }
  };

  const deleteNoti = async (id) => {
    try {
        // เรียกไปที่ /api/notifications/{id}
        await api.delete(`/api/notifications/${id}`, getAuthHeader());
        setNotifications(notifications.filter(n => n.notificationId !== id));
    } catch (err) {
        console.error("Delete failed:", err);
        alert("ไม่สามารถลบการแจ้งเตือนได้");
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("คุณต้องการลบการแจ้งเตือนทั้งหมดใช่หรือไม่?")) return;
    try {
        const res = await api.delete("/api/notifications/clear-all", getAuthHeader());
        if (res.data.success) {
        setNotifications([]);
        alert("ล้างการแจ้งเตือนทั้งหมดเรียบร้อยแล้ว");
        }
    } catch (err) {
        console.error("Clear all failed:", err);
        alert("เกิดข้อผิดพลาดในการล้างข้อมูล");
    }
  };

  // Helper สำหรับดึง Icon ตามประเภท
  const getNotificationIcon = (type) => {
    switch (type) {
      case "NewRequest": return <FiAlertCircle style={{ color: "#ef4444" }} />; // สีแดงเด่น
      case "Approved": return <FiCheckCircle style={{ color: "#10b981" }} />;
      default: return <FiInfo style={{ color: "#3b82f6" }} />;
    }
  };

  // Helper สำหรับเลือกคลาส CSS (ใช้คลาสจาก WorkerNotifications.css)
  const getStatusClass = (type) => {
    if (type === "NewRequest") return "danger";
    if (type === "Approved") return "ok";
    return "info";
  };

  return (
    <div className="page-card">
      <div className="wn-head">
        <div>
          <h2 className="wn-title">HR Notifications</h2>
          <p className="wn-sub">รายการแจ้งเตือนคำขอและกิจกรรมจากพนักงาน</p>
        </div>
        <div className="wn-actions">
          <button className="emp-btn emp-btn-outline small" onClick={fetchNotifications} title="Refresh">
            <FiRefreshCw className={loading ? "spin" : ""} />
          </button>
          <button className="emp-btn emp-btn-primary small" onClick={markAllAsRead}>
            <FiCheck /> Mark all read
          </button>
        </div>
      </div>

      <div className="wn-list">
        {loading ? (
          <div className="wn-empty">
            <FiRefreshCw className="spin" style={{ marginBottom: '8px' }} size={24} />
            <p>กำลังโหลดข้อมูลแจ้งเตือน...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="wn-empty">
            <FiBell style={{ marginBottom: '8px', opacity: 0.5 }} size={32} />
            <p>ไม่มีการแจ้งเตือนสำหรับคุณในขณะนี้</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.notificationId} className={`wn-item ${getStatusClass(n.notificationType)}`}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div className="noti-icon-box" style={{ marginTop: '4px', fontSize: '20px' }}>
                  {getNotificationIcon(n.notificationType)}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div className="wn-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {n.notificationType === "NewRequest" ? "คำขอลาใหม่" : "ระบบแจ้งเตือน"}
                    {!n.isRead && <span className="badge-new">NEW</span>}
                  </div>
                  <div className="wn-item-msg">{n.message}</div>
                  <div className="wn-item-time">{new Date(n.createdAt).toLocaleString("en-GB")}</div>
                </div>

                <button 
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px' }}
                  onClick={() => deleteNoti(n.notificationId)}
                  title="Delete"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}