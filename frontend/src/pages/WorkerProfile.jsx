import React, { useEffect, useState } from "react";
import axios from "axios";
import moment from "moment";
import { 
  FiUser, FiMail, FiCalendar, FiShield, 
  FiBriefcase, FiRefreshCw, FiEdit2, FiCheck, FiX, FiLock
} from "react-icons/fi";
import "./WorkerProfile.css";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

export default function WorkerProfile() {
  const [profile, setProfile] = useState(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(!profile);
  
  // State สำหรับโหมดแก้ไข
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    currentPassword: "",
    newPassword: ""
  });

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:8000/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setProfile(res.data.user);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        // Reset ฟอร์มข้อมูลตามฐานข้อมูลล่าสุด
        setFormData(prev => ({
          ...prev,
          firstName: res.data.user.firstName,
          lastName: res.data.user.lastName,
          currentPassword: "",
          newPassword: ""
        }));
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
        const token = localStorage.getItem("token");
        const res = await axios.put("http://localhost:8000/api/auth/update-profile", formData, {
        headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.data.success) {
        await alertSuccess("สำเร็จ", "อัปเดตข้อมูลสำเร็จ");
        setIsEditing(false); // ปิดโหมดแก้ไข
        
        // --- เรียกฟังก์ชันดึงข้อมูลใหม่ เพื่ออัปเดต UI โดยไม่ต้องรีโหลดหน้า ---
        await fetchProfile(); 
        // --------------------------------------------------------
        }
    } catch (err) {
        await alertError("เกิดข้อผิดพลาด", (err.response?.data?.message || "เกิดข้อผิดพลาดในการอัปเดต"));
    }
  };

  if (loading) return <div className="p-loader">กำลังโหลดข้อมูลโปรไฟล์...</div>;
  if (!profile) return <div className="p-error">ไม่พบข้อมูลผู้ใช้งาน</div>;

  const initials = (profile.firstName?.charAt(0) || "U") + (profile.lastName?.charAt(0) || "");

  return (
    <div className="profile-page-container">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Profile</h1>
        
      </header>

      <div className="profile-main-content">
        <aside className="profile-identity-card">
          <div className="avatar-section">
            <div className="avatar-circle">
              {profile.profileImageUrl ? (
                <img src={profile.profileImageUrl} alt="Profile" />
              ) : (
                initials.toUpperCase()
              )}
            </div>
            <h2 className="display-name">{profile.firstName} {profile.lastName}</h2>
            <span className="badge-role">{profile.role || "Worker"}</span>
            <div className={`status-pill ${profile.isActive ? 'active' : 'inactive'}`}>
              <span className="dot"></span>
              {profile.isActive ? "Active Employee" : "Inactive"}
            </div>
          </div>
        </aside>

        <form className="profile-details-grid" onSubmit={handleUpdate}>
          {/* ข้อมูลส่วนตัว */}
          <section className="info-section">
            <h3 className="section-header"><FiUser /> ข้อมูลส่วนตัว</h3>
            <div className="info-field-list">
              <div className="info-box">
                <label>ชื่อ</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    className="edit-input"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  />
                ) : <p>{profile.firstName}</p>}
              </div>
              <div className="info-box">
                <label>นามสกุล</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    className="edit-input"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  />
                ) : <p>{profile.lastName}</p>}
              </div>
              <div className="info-box">
                <label><FiMail /> อีเมลติดต่อ</label>
                <p>{profile.email}</p>
              </div>
            </div>
          </section>

          {/* ข้อมูลการทำงาน หรือ โหมดเปลี่ยนรหัสผ่าน */}
          {!isEditing ? (
            <section className="info-section">
              <h3 className="section-header"><FiBriefcase /> ข้อมูลการทำงาน</h3>
              <div className="info-field-list">
                <div className="info-box">
                  <label>รหัสพนักงาน</label>
                  <p>#{profile.employeeId}</p>
                </div>
                <div className="info-box">
                  <label><FiCalendar /> วันที่เริ่มงาน</label>
                  <p>{profile.joiningDate ? moment(profile.joiningDate).format("DD MMM YYYY") : "-"}</p>
                </div>
                <div className={`info-box highlight ${profile.isActive ? 'ok' : 'danger'}`}>
                  <label><FiShield /> สถานะพนักงาน</label>
                  <p>{profile.isActive ? "กำลังทำงาน (Active)" : "พ้นสภาพพนักงาน"}</p>
                </div>
              </div>
            </section>
          ) : (
            <section className="info-section edit-password-section">
              <h3 className="section-header"><FiLock /> เปลี่ยนรหัสผ่าน</h3>
              <div className="info-field-list">
                <div className="info-box">
                  <label>รหัสผ่านปัจจุบัน (เพื่อยืนยันการเปลี่ยนแปลง)</label>
                  <input 
                    type="password" 
                    className="edit-input"
                    placeholder="ใส่รหัสผ่านเดิม..."
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({...formData, currentPassword: e.target.value})}
                  />
                </div>
                <div className="info-box">
                  <label>รหัสผ่านใหม่ (ปล่อยว่างถ้าไม่ต้องการเปลี่ยน)</label>
                  <input 
                    type="password" 
                    className="edit-input"
                    placeholder="ใส่รหัสผ่านใหม่..."
                    value={formData.newPassword}
                    onChange={(e) => setFormData({...formData, newPassword: e.target.value})}
                  />
                </div>
                <p className="edit-hint">* หากต้องการเปลี่ยนรหัสผ่าน ต้องระบุทั้งสองช่อง</p>
              </div>
            </section>
          )}
        </form>
      </div>
    </div>
  );
}
