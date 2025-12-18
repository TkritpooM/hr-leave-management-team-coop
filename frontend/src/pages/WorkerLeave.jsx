// src/pages/WorkerLeave.jsx
import React, { useState, useEffect } from "react";
import axios from "axios";
import moment from "moment";
import "./HRDashboard.css"; // ใช้ CSS ตัวหลักที่คุณมี เพื่อความสม่ำเสมอของ UI

export default function WorkerLeave() {
  const [quotas, setQuotas] = useState([]);
  const [history, setHistory] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State สำหรับฟอร์มขอลา
  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    startDuration: "Full",
    endDuration: "Full",
    reason: "",
  });

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });

  // --- 📅 ดึงข้อมูลโควต้า ประวัติ และประเภทการลา ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotaRes, historyRes, typeRes] = await Promise.all([
        axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/leave/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/admin/leavetype", getAuthHeader()),
      ]);

      setQuotas(quotaRes.data.quotas || []);
      setHistory(historyRes.data.requests || []);
      setLeaveTypes(typeRes.data.types || []);

      // กำหนดค่าเริ่มต้นให้กับ Dropdown ถ้ายังไม่มีการเลือก
      if (typeRes.data.types?.length > 0 && !form.leaveTypeId) {
        setForm(prev => ({ 
          ...prev, 
          leaveTypeId: typeRes.data.types[0].leaveTypeId.toString() 
        }));
      }
    } catch (err) {
      console.error("Fetch Leave Data Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

    // --- 📤 ส่งฟอร์มขอลา (เวอร์ชัน Console สะอาด) ---
    const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 1. ตรวจสอบวันที่เบื้องต้นทางฝั่ง Client
    if (moment(form.startDate).isAfter(form.endDate)) {
        alert("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
        return;
    }

    try {
        // 2. เตรียมข้อมูล (แปลง ID เป็นตัวเลข)
        const payload = {
        ...form,
        leaveTypeId: parseInt(form.leaveTypeId),
        };

        /** * 3. ส่งข้อมูลไปยัง Backend 
         * หมายเหตุ: Backend ต้องปรับให้ส่ง Status 200 พร้อม success: false ในกรณีลาซ้ำ
         */
        const res = await axios.post("http://localhost:8000/api/leave/request", payload, getAuthHeader());
        
        // 4. ตรวจสอบค่า success ที่ส่งกลับมาจาก Body (ไม่ใช่เช็คจาก HTTP Status)
        if (res.data.success) {
        // กรณีสำเร็จจริง
        alert("ส่งคำขอลาสำเร็จ! ✅");
        
        // ล้างข้อมูลในฟอร์ม
        setForm(prev => ({ 
            ...prev, 
            startDate: "", 
            endDate: "", 
            reason: "" 
        }));
        
        // อัปเดตข้อมูลในหน้าจอ
        fetchData(); 
        } else {
        // กรณีไม่สำเร็จ (เช่น ลาซ้ำซ้อน) - จะไม่ขึ้นสีแดงใน Console เพราะ Status เป็น 200
        alert(`⚠️ ไม่สามารถส่งคำขอได้: ${res.data.message}`);
        }

    } catch (err) {
        /**
         * 5. ส่วนนี้จะดักจับเฉพาะ Error ที่เป็นของระบบจริงๆ (เช่น Server ล่ม 500 หรือเน็ตหลุด)
         * ซึ่งในกรณีเหล่านี้การขึ้นสีแดงใน Console ถือว่าเป็นเรื่องปกติเพื่อให้ตรวจสอบได้
         */
        const errMsg = err.response?.data?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์";
        alert("❌ Error: " + errMsg);
        console.error("Submit Error:", err);
    }
    };

  return (
    <div className="hr-card">
      <header className="hr-header">
        <div>
          <h1 className="hr-title">My Leave</h1>
          <p className="hr-subtitle">Manage your leave requests and check balances</p>
        </div>
      </header>

      {/* 1. Leave Balance Section */}
      <section className="summary-row">
        {quotas.length === 0 ? (
          <div className="summary-card"><h4>No Quota Found</h4></div>
        ) : (
          quotas.map(q => (
            <div className="summary-card" key={q.quotaId}>
              <h4>{q.leaveType?.typeName}</h4>
              <p className="big">{q.availableDays}</p>
              <span className="mutetext">Remaining from {q.totalDays} days</span>
            </div>
          ))
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", marginTop: "20px" }}>
        
        {/* 2. Request Form (Left Column) */}
        <div className="form-container" style={{ background: "#f9fafb", padding: "20px", borderRadius: "16px", border: "1px solid #f1f5f9" }}>
          <h3 style={{ marginBottom: "16px", fontSize: "16px" }}>New Request</h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            <div className="field">
              <label className="hint">Type of Leave</label>
              <select 
                className="pill" 
                style={{ width: "100%", marginTop: "4px" }}
                value={form.leaveTypeId} 
                onChange={e => setForm({...form, leaveTypeId: e.target.value})}
                required
              >
                {leaveTypes.map(t => (
                  <option key={t.leaveTypeId} value={t.leaveTypeId}>{t.typeName}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="field">
                <label className="hint">Start Date</label>
                <input 
                  type="date" 
                  className="pill" 
                  style={{ width: "100%", marginTop: "4px" }}
                  value={form.startDate} 
                  onChange={e => setForm({...form, startDate: e.target.value})} 
                  required 
                />
              </div>
              <div className="field">
                <label className="hint">End Date</label>
                <input 
                  type="date" 
                  className="pill" 
                  style={{ width: "100%", marginTop: "4px" }}
                  value={form.endDate} 
                  onChange={e => setForm({...form, endDate: e.target.value})} 
                  required 
                />
              </div>
            </div>

            <div className="field">
              <label className="hint">Reason</label>
              <textarea 
                className="pill" 
                style={{ width: "100%", marginTop: "4px", borderRadius: "12px", minHeight: "80px" }}
                value={form.reason} 
                onChange={e => setForm({...form, reason: e.target.value})} 
                placeholder="Why are you taking leave?"
              />
            </div>

            <button type="submit" className="sidebar-item active" style={{ width: "100%", marginTop: "8px", border: "none" }}>
              Submit Request
            </button>
          </form>
        </div>

        {/* 3. Leave History Table (Right Column) */}
        <div className="table-section">
          <h3 style={{ marginBottom: "16px", fontSize: "16px" }}>Leave History</h3>
          <div className="table-wrap">
            {loading ? (
              <div className="empty">Loading...</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Date Range</th>
                    <th>Days</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan="4" className="empty">No leave records yet.</td></tr>
                  ) : (
                    history.map(req => (
                      <tr key={req.requestId}>
                        <td style={{ fontWeight: "600" }}>{req.leaveType?.typeName}</td>
                        <td style={{ fontSize: "12px" }}>
                          {moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}
                        </td>
                        <td>{req.totalDaysRequested}</td>
                        <td>
                          <span className={`badge badge-${req.status.toLowerCase()}`}>
                            {req.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}