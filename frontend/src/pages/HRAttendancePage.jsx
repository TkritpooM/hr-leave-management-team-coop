import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./HRAttendancePage.css";
import moment from "moment";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

// Helper Functions
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
const normStatus = (s) => String(s || "").trim().toLowerCase();

// 🔥 ปรับปรุง QuotaCard ให้แสดงยอดทบสะสมเหมือนของ Worker
function QuotaCard({ title, usedDays, totalDays, carriedOverDays }) {
  const used = num(usedDays);
  const currentTotal = num(totalDays);
  const carried = num(carriedOverDays);
  
  // สิทธิ์รวม = สิทธิ์ปีปัจจุบัน + ยอดทบ
  const totalEffective = currentTotal + carried;
  const remaining = Math.max(0, totalEffective - used);
  const percent = totalEffective > 0 ? clamp((used / totalEffective) * 100, 0, 100) : 0;

  return (
    <div className="quota-card">
      <div className="quota-top">
        <div className="quota-title-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h4 className="quota-title">{title}</h4>
          {carried > 0 && (
            <span className="carried-badge" style={{
              background: '#ecfdf5', color: '#10b981', fontSize: '10px', 
              padding: '2px 8px', borderRadius: '4px', fontWeight: '800', 
              border: '1px solid #d1fae5', width: 'fit-content'
            }}>
              +{carried} Carried Over
            </span>
          )}
        </div>
        <span className="quota-chip">{Math.round(percent)}%</span>
      </div>

      <div className="quota-metrics">
        <div className="qm">
          <div className="qm-label">Used</div>
          <div className="qm-value">{used}</div>
        </div>
        <div className="qm highlight" style={{ background: 'rgba(30, 64, 175, 0.05)' }}>
          <div className="qm-label">Available</div>
          <div className="qm-value">{totalEffective}</div>
        </div>
        <div className="qm success" style={{ background: 'rgba(22, 163, 74, 0.05)' }}>
          <div className="qm-label">Remaining</div>
          <div className="qm-value">{remaining}</div>
        </div>
      </div>

      <div className="quota-bar">
        <div className="quota-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function HRAttendancePage() {
  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });

  // Leave modal & Preview
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0); // 🔥 สำหรับแสดงจำนวนวันลาจริง
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
  });

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // 1) Attendance Data
  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/my", getAuthHeader());
      const records = response.data.records || [];
      setHistory(records);
      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = records.find((r) => r.workDate && r.workDate.startsWith(todayStr));
      if (todayRecord) {
        if (todayRecord.checkInTime) setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime) setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }
    } catch (err) { console.error(err); }
  };

  // 2) Leave History Data
  const fetchLeaveHistory = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/my", getAuthHeader());
      setLeaveHistory(response.data.requests || []);
    } catch (err) { console.error(err); }
  };

  // 3) Quota Data
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader());
      const qs = response.data.quotas || [];
      setQuotas(qs);
      if (qs.length > 0 && !leaveForm.leaveTypeId) {
        setLeaveForm(prev => ({ ...prev, leaveTypeId: qs[0].leaveTypeId.toString() }));
      }
    } catch (err) { console.error(err); }
  };

  // 4) Late Summary
  const fetchLateSummary = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/late/summary", getAuthHeader());
      setLateSummary({ lateCount: response.data.lateCount, lateLimit: response.data.lateLimit });
    } catch (err) { console.error(err); }
  };

  // 🔥 5) Real-time Preview สำหรับวันลาจริง
  useEffect(() => {
    if (leaveForm.startDate && leaveForm.endDate) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await axios.get("http://localhost:8000/api/leave/calculate-days", {
            params: { 
              startDate: leaveForm.startDate, 
              endDate: leaveForm.endDate,
              startDuration: 'Full',
              endDuration: 'Full'
            },
            ...getAuthHeader()
          });
          setPreviewDays(res.data.totalDays || 0); 
        } catch (err) { setPreviewDays(0); }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPreviewDays(0);
    }
  }, [leaveForm.startDate, leaveForm.endDate]);

  useEffect(() => {
    fetchAttendanceData();
    fetchLeaveHistory();
    fetchQuotaData();
    fetchLateSummary();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = async () => {
    try {
      await axios.post("http://localhost:8000/api/timerecord/checkin", {}, getAuthHeader());
      await alertSuccess("สำเร็จ", "Check In สำเร็จ");
      fetchAttendanceData();
      fetchLateSummary();
    } catch (err) { alertError("Check In ล้มเหลว", err.response?.data?.message); }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post("http://localhost:8000/api/timerecord/checkout", {}, getAuthHeader());
      await alertSuccess("สำเร็จ", "Check Out สำเร็จ");
      fetchAttendanceData();
    } catch (err) { alertError("Check Out ล้มเหลว", err.response?.data?.message); }
  };

  const handleCancelLeave = async (requestId) => {
    if (!(await alertConfirm("ยืนยันการยกเลิก", "คุณมั่นใจหรือไม่ที่จะยกเลิกคำขอลาใบนี้?", "ยืนยัน"))) return;
    try {
      const res = await axios.patch(`http://localhost:8000/api/leave/${requestId}/cancel`, {}, getAuthHeader());
      if (res.data.success) {
        await alertSuccess("สำเร็จ", "ยกเลิกคำขอลาเรียบร้อยแล้ว");
        fetchLeaveHistory();
        fetchQuotaData();
      } else { alertError("ไม่สามารถยกเลิกได้", res.data.message); }
    } catch (err) { alertError("เกิดข้อผิดพลาด", "เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว"); }
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm(prev => {
      const newState = { ...prev, [name]: value };

      // 🛡️ Logic 1: เมื่อเลือก Start Date ใหม่
      if (name === "startDate") {
        // ถ้าวันจบที่มีอยู่ (EndDate) ดันมาก่อนวันเริ่มที่เพิ่งเลือกใหม่
        if (prev.endDate && value > prev.endDate) {
          newState.endDate = value; // ปรับวันจบให้เท่ากับวันเริ่มทันที
        }
        // ถ้ายังไม่เคยเลือกวันจบเลย ให้ default เป็นวันเดียวกัน
        if (!prev.endDate) {
          newState.endDate = value;
        }
      }

      // 🛡️ Logic 2: เมื่อพยายามเลือก End Date
      if (name === "endDate") {
        // ถ้าค่าที่เลือกมา ดันน้อยกว่าวันเริ่ม
        if (prev.startDate && value < prev.startDate) {
          newState.endDate = prev.startDate; // บังคับให้เป็นวันเดียวกับวันเริ่ม
        }
      }
      
      return newState;
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) setSelectedFile(e.target.files[0]);
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("leaveTypeId", parseInt(leaveForm.leaveTypeId, 10));
      formData.append("startDate", leaveForm.startDate);
      formData.append("endDate", leaveForm.endDate);
      formData.append("reason", leaveForm.detail);
      if (selectedFile) formData.append("attachment", selectedFile);

      const res = await axios.post("http://localhost:8000/api/leave/request", formData, {
        headers: { ...getAuthHeader().headers, "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        await alertSuccess("สำเร็จ", "ส่งคำขอลาสำเร็จ");
        setIsLeaveModalOpen(false);
        fetchQuotaData();
        fetchLeaveHistory();
        setLeaveForm({ leaveTypeId: quotas[0]?.leaveTypeId.toString() || "", startDate: "", endDate: "", detail: "" });
      } else { alertInfo("ไม่สำเร็จ", res.data.message); }
    } catch (err) { alertError("เกิดข้อผิดพลาด", err.response?.data?.message); }
  };

  const formatTime = (d) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const formatDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">Hello, {user.firstName || "HR"}</h1>
          <p className="worker-datetime">{now.toLocaleString("en-GB")}</p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
        </div>
      </header>

      <div className="late-warning">
        <span>Late this month: <strong>{lateSummary.lateCount} / {lateSummary.lateLimit}</strong></span>
      </div>

      <section className="action-row">
        <div className="action-card">
          <h3>Check In</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button className="btn-checkin" onClick={handleCheckIn} disabled={!!checkedInAt}>
            {checkedInAt ? "Checked In" : "Check In Now"}
          </button>
        </div>
        <div className="action-card">
          <h3>Check Out</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>
          <button className="btn-checkout" onClick={handleCheckOut} disabled={!checkedInAt || !!checkedOutAt}>
            Check Out
          </button>
        </div>
        <div className="action-card">
          <h3>Leave</h3>
          <p className="action-time">Manage Leaves</p>
          <button className="btn-leave" onClick={() => setIsLeaveModalOpen(true)}>
            Request Leave
          </button>
        </div>
      </section>

      <h2 className="section-subtitle">
        สิทธิ์การลาของคุณ (รวมสิทธิ์ที่ทบมาปีที่แล้ว)
      </h2>

      <section className="quota-grid">
        {quotas.length > 0 ? (
          quotas.map((q) => (
            <QuotaCard
              key={q.quotaId}
              title={q.leaveType?.typeName || "Leave"}
              usedDays={q.usedDays}
              totalDays={q.totalDays}
              carriedOverDays={q.carriedOverDays} // 🔥 ส่งค่าทบยอด
            />
          ))
        ) : (
          <div className="quota-empty">Loading quotas...</div>
        )}
      </section>

      {/* --- Section: Time History (เดิม) --- */}
      <section className="history-section">
        <h2>Your Personal Time History</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan="4" className="empty">ไม่มีข้อมูลการลงเวลา</td></tr>
              ) : (
                history.slice(0, 10).map((row) => (
                  <tr key={row.recordId}>
                    <td>{formatDate(row.workDate)}</td>
                    <td>{formatTime(row.checkInTime)}</td>
                    <td>{formatTime(row.checkOutTime)}</td>
                    <td><span className={`status-badge ${row.isLate ? "status-late" : "status-ok"}`}>{row.isLate ? "Late" : "On Time"}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- Section: Leave History (เดิม) --- */}
      <section className="history-section" style={{ marginTop: '30px' }}>
        <h2>Your Personal Leave History</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr><th>Type</th><th>Date Range</th><th>Days</th><th>Status</th><th style={{ textAlign: 'center' }}>Action</th></tr>
            </thead>
            <tbody>
              {leaveHistory.length === 0 ? (
                <tr><td colSpan="5" className="empty">ยังไม่มีประวัติการลา</td></tr>
              ) : (
                leaveHistory.slice(0, 10).map((req) => (
                  <tr key={req.requestId}>
                    <td><strong>{req.leaveType?.typeName}</strong></td>
                    <td>{moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}</td>
                    <td>{req.totalDaysRequested}</td>
                    <td><span className={`status-badge status-${normStatus(req.status)}`}>{req.status}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      {normStatus(req.status) === "pending" && (
                        <button className="btn-leave" style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#ef4444' }} onClick={() => handleCancelLeave(req.requestId)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🔥 Modal: Request Leave (ปรับให้เหมือน Worker) */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Request Leave</h3>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>Leave Type</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName} (คงเหลือ: {num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays)} วัน)
                  </option>
                ))}
              </select>

              <div className="date-row">
                <label>Start Date <input type="date" name="startDate" min={new Date().toISOString().split("T")[0]} value={leaveForm.startDate} onChange={handleLeaveChange} required /></label>
                <label>End Date <input type="date" name="endDate" value={leaveForm.endDate} onChange={handleLeaveChange} min={leaveForm.startDate || new Date().toISOString().split("T")[0]} required /></label>
              </div>

              {/* 🔥 กล่องสรุปวันหยุด Real-time (เหมือน Worker) */}
              {(leaveForm.startDate && leaveForm.endDate) && (
                <div className="leave-preview-info" style={{
                  gridColumn: '1 / -1', background: '#f0f9ff', border: '1px solid #bae6fd',
                  padding: '12px', borderRadius: '12px', color: '#0369a1', fontSize: '14px'
                }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiCalendar /> <span>จำนวนวันลาจริง: <strong>{previewDays} วัน</strong></span>
                   </div>
                   <p style={{ fontSize: '11px', color: '#0ea5e9', margin: '4px 0 0' }}>* ระบบหักวันหยุดเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ให้คุณแล้ว</p>
                </div>
              )}

              <label className="full">Detail<textarea name="detail" rows="3" value={leaveForm.detail} onChange={handleLeaveChange} placeholder="Reason." /></label>
              <label className="full">หลักฐานแนบ<input type="file" onChange={handleFileChange} style={{ border: 'none', padding: '10px 0' }} /></label>

              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => setIsLeaveModalOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}