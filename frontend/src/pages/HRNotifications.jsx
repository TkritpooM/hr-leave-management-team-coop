import React, { useEffect, useState, useMemo } from "react";
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
import Pagination from "../components/Pagination"; // เพิ่ม Pagination

const api = axios.create({ baseURL: "http://localhost:8000" });
const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function HRNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchNotifications = async () => {
    try {
        setLoading(true);
        const res = await api.get("/api/notifications/my", getAuthHeader());
        const fetchedNotis = res.data.notifications || [];
        setNotifications(fetchedNotis);
        
        // 🆕 แทนที่จะเซ็ตเป็น "0" ทันที ให้ดูว่าในลิสต์มีอันไหนที่ isRead เป็น false บ้าง
        const unreadCount = fetchedNotis.filter(n => !n.isRead).length;

        // อัปเดตตัวเลข Badge บน Sidebar ตามจำนวนจริง
        localStorage.setItem("hr_unread_notifications", unreadCount.toString());
        
        // ส่งสัญญาณให้ Sidebar รู้ว่ามีการเปลี่ยนแปลง
        window.dispatchEvent(new Event("storage"));
    } catch (err) {
        console.error("Failed to fetch HR notifications:", err);
    } finally {
        setLoading(false);
    }
  };

  // 🆕 เพิ่มฟังก์ชันนี้ใน HRNotifications.jsx
  const markAsRead = async (id) => {
    try {
        // ส่ง API ไปอัปเดตสถานะใน DB
        await api.put(`/api/notifications/${id}/read`, {}, getAuthHeader());
        
        // อัปเดต State ในหน้าจอ
        const updatedNotis = notifications.map(n => 
        n.notificationId === id ? { ...n, isRead: true } : n
        );
        setNotifications(updatedNotis);

        // คำนวณเลข unread ใหม่และเซ็ตลง localStorage
        const newUnreadCount = updatedNotis.filter(n => !n.isRead).length;
        localStorage.setItem("hr_unread_notifications", newUnreadCount.toString());
        window.dispatchEvent(new Event("storage"));
    } catch (err) {
        console.error("Mark read failed:", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // ✅ Pagination Logic (เหมือนหน้า Worker)
  const total = notifications.length;
  const startIdx = (page - 1) * pageSize;
  const pagedNotifications = useMemo(() => {
    return notifications.slice(startIdx, startIdx + pageSize);
  }, [notifications, startIdx, pageSize]);

  const markAllAsRead = async () => {
    try {
        // 1. ส่ง API ไปอัปเดตใน Database
        await api.put("/api/notifications/mark-all-read", {}, getAuthHeader());

        // 2. อัปเดต State ในหน้าจอให้เป็น Read ทั้งหมด
        setNotifications(notifications.map(n => ({ ...n, isRead: true })));

        // 3. เซ็ตเลข Badge ใน localStorage เป็น 0 และแจ้ง Sidebar
        localStorage.setItem("hr_unread_notifications", "0");
        window.dispatchEvent(new Event("storage"));

        alert("อ่านการแจ้งเตือนทั้งหมดเรียบร้อยแล้ว");
    } catch (err) {
        console.error("Mark all read failed:", err);
    }
  };

  const deleteNoti = async (id) => {
    if (!window.confirm("คุณต้องการลบการแจ้งเตือนนี้ใช่หรือไม่?")) return;
    try {
        await api.delete(`/api/notifications/${id}`, getAuthHeader());
        setNotifications(notifications.filter(n => n.notificationId !== id));

        const updatedNotis = notifications.filter(n => n.notificationId !== id);
        const remainUnread = updatedNotis.filter(n => !n.isRead).length;
        localStorage.setItem("hr_unread_notifications", remainUnread.toString());
        window.dispatchEvent(new Event("storage"));

        // ถ้าลบจนหน้านั้นว่าง ให้ถอยกลับ 1 หน้า
        if (pagedNotifications.length === 1 && page > 1) setPage(page - 1);
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
          setPage(1);
          localStorage.setItem("hr_unread_notifications", "0");
          window.dispatchEvent(new Event("storage"));
          alert("ล้างการแจ้งเตือนทั้งหมดเรียบร้อยแล้ว");
        }
    } catch (err) {
        console.error("Clear all failed:", err);
        alert("เกิดข้อผิดพลาดในการล้างข้อมูล");
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "NewRequest": return <FiAlertCircle style={{ color: "#ef4444" }} />;
      case "Approved": return <FiCheckCircle style={{ color: "#10b981" }} />;
      default: return <FiInfo style={{ color: "#3b82f6" }} />;
    }
  };

  const getStatusClass = (type) => {
    if (type === "NewRequest") return "danger";
    if (type === "Approved") return "ok";
    return "info";
  };

  return (
    <div className="page-card wn"> {/* เพิ่มคลาส wn เพื่อใช้ style ร่วมกัน */}
      <div className="wn-head">
        <div>
          <h2 className="wn-title">HR Notifications</h2>
          <p className="wn-sub">รายการแจ้งเตือนคำขอลาและกิจกรรมจากพนักงาน (หน้า {page})</p>
        </div>
        <div className="wn-actions">
          <button className="emp-btn emp-btn-outline small" onClick={fetchNotifications} title="Refresh">
            <FiRefreshCw className={loading ? "spin" : ""} />
          </button>
          
          {/* ✅ เพิ่มปุ่ม Clear All เหมือนหน้า Worker */}
          <button className="emp-btn emp-btn-outline small" onClick={handleClearAll} disabled={notifications.length === 0}>
            <FiTrash2 /> Clear All
          </button>

          <button className="emp-btn emp-btn-primary small" onClick={markAllAsRead}>
            <FiCheck /> Mark all read
          </button>
        </div>
      </div>

      <div className="wn-list">
        {loading ? (
          <div className="wn-empty">
            <FiRefreshCw className="spin" size={24} />
            <p>กำลังโหลดข้อมูลแจ้งเตือน...</p>
          </div>
        ) : pagedNotifications.length === 0 ? (
          <div className="wn-empty">
            <FiBell style={{ opacity: 0.5 }} size={32} />
            <p>ไม่มีการแจ้งเตือนสำหรับคุณในขณะนี้</p>
          </div>
        ) : (
          pagedNotifications.map((n) => (
            <div key={n.notificationId} className={`wn-item ${getStatusClass(n.notificationType)} ${n.isRead ? 'read' : 'unread'}`} onClick={() => !n.isRead && markAsRead(n.notificationId)}>
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
                  <div className="wn-item-time">
                    {new Date(n.createdAt).toLocaleString("en-GB", {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>

                <button 
                  className="delete-btn-icon"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
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

      {/* ✅ เพิ่ม Pagination Component ด้านล่าง */}
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