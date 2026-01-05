import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./HRAttendancePage.css";
import moment from "moment";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from 'date-fns/locale';

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
  const [policy, setPolicy] = useState({ endTime: "18:00" });

  const fetchPolicy = async () => {
    try {
      const res = await axios.get("http://localhost:8000/api/admin/attendance-policy", getAuthHeader());
      if (res.data.policy) setPolicy(res.data.policy);
    } catch (err) { console.error("Fetch policy error", err); }
  };

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
    fetchPolicy();
    fetchAttendanceData();
    fetchLeaveHistory();
    fetchQuotaData();
    fetchLateSummary();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckIn = async () => {
    try {
      // เดิม: /checkin -> แก้เป็น: /check-in
      await axios.post("http://localhost:8000/api/timerecord/check-in", {}, getAuthHeader());
      await alertSuccess("Success", "Check-in successful");
      fetchAttendanceData();
      fetchLateSummary();
    } catch (err) { alertError("Check-in failed", err.response?.data?.message); }
  };

  const handleCheckOut = async () => {
    // 1. ตรวจสอบว่ามีข้อมูล policy หรือยัง (ดึงมาจาก DB แล้ว)
    if (!policy || !policy.endTime) {
      return alertError("Error", "Unable to load attendance policy.");
    }

    // 2. คำนวณเวลาเลิกงานจาก Policy ในวันนี้
    const [pEndHour, pEndMin] = policy.endTime.split(':').map(Number);
    const nowMoment = moment(); // เวลาปัจจุบัน
    const endMoment = moment().hour(pEndHour).minute(pEndMin).second(0).millisecond(0);

    // 3. 🔥 ตรวจสอบเงื่อนไข: ถ้าเวลาปัจจุบัน "ยังไม่ถึง" เวลาเลิกงาน
    if (nowMoment.isBefore(endMoment)) {
      return alertError(
        "Not time to check out yet", 
        `Policy allows check-out starting from ${policy.endTime}.`
      );
    }

    // 4. ถ้าผ่านเงื่อนไข (ถึงเวลาแล้ว) ให้ยิง API ตามปกติ
    try {
      await axios.post("http://localhost:8000/api/timerecord/check-out", {}, getAuthHeader());
      await alertSuccess("Success", "Check-out successful");
      fetchAttendanceData();
    } catch (err) { 
      alertError("Check-out failed", err.response?.data?.message || "Something went wrong"); 
    }
  };

  const handleCancelLeave = async (requestId) => {
    if (!(await alertConfirm("Confirm cancellation", "Are you sure you want to cancel this leave request?", "Confirm"))) return;
    try {
      const res = await axios.patch(`http://localhost:8000/api/leave/${requestId}/cancel`, {}, getAuthHeader());
      if (res.data.success) {
        await alertSuccess("Success", "Leave request cancelled successfully.");
        fetchLeaveHistory();
        fetchQuotaData();
      } else { alertError("Unable to cancel", res.data.message); }
    } catch (err) { alertError("Error", "Failed to connect to server."); }
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
        await alertSuccess("Success", "Leave request submitted successfully.");
        setIsLeaveModalOpen(false);
        fetchQuotaData();
        fetchLeaveHistory();
        setLeaveForm({ leaveTypeId: quotas[0]?.leaveTypeId.toString() || "", startDate: "", endDate: "", detail: "" });
      } else { alertInfo("Failed", res.data.message); }
    } catch (err) { alertError("Error", err.response?.data?.message); }
  };

  const formatTime = (d) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const formatDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const isBeforeEndTime = moment().isBefore(moment().hour(policy.endTime.split(':')[0]).minute(policy.endTime.split(':')[1]));

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
          <button className="btn-checkout" onClick={handleCheckOut} disabled={!checkedInAt || !!checkedOutAt || isBeforeEndTime} style={isBeforeEndTime && checkedInAt && !checkedOutAt ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
            {isBeforeEndTime && checkedInAt && !checkedOutAt ? `Wait until ${policy.endTime}` : "Check Out"}
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
        Your Leave Balance (Including Carry-over)
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
                <tr><td colSpan="4" className="empty">No attendance records</td></tr>
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
                <tr><td colSpan="5" className="empty">No leave history yet</td></tr>
              ) : (
                leaveHistory.slice(0, 10).map((req) => (
                  <tr key={req.requestId}>
                    <td><strong>{req.leaveType?.typeName}</strong></td>
                    <td>{moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}</td>
                    <td>{req.totalDaysRequested}</td>
                    <td><span className={`status-badge status-${normStatus(req.status)}`}>{req.status}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      {normStatus(req.status) === "pending" && (
                        <button className="btn-leave" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: 'none' }} onClick={() => handleCancelLeave(req.requestId)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 🔥 Modal: Request Leave (ปรับให้เป็น DatePicker ภาษาอังกฤษ) */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Request Leave</h3>
              <button 
                type="button"
                onClick={() => setIsLeaveModalOpen(false)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>Leave Type</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName} (Remaining: {num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays)} days)
                  </option>
                ))}
              </select>

              <div className="date-row">
                <label>
                  Start Date
                  <DatePicker
                    selected={leaveForm.startDate ? new Date(leaveForm.startDate) : null}
                    onChange={(date) => {
                      const dStr = moment(date).format("YYYY-MM-DD");
                      handleLeaveChange({ target: { name: "startDate", value: dStr } });
                    }}
                    minDate={new Date()}
                    dateFormat="yyyy-MM-dd"
                    locale={enUS}
                    placeholderText="YYYY-MM-DD"
                    className="wa-datepicker-input"
                    required
                  />
                </label>
                <label>
                  End Date
                  <DatePicker
                    selected={leaveForm.endDate ? new Date(leaveForm.endDate) : null}
                    onChange={(date) => {
                      const dStr = moment(date).format("YYYY-MM-DD");
                      handleLeaveChange({ target: { name: "endDate", value: dStr } });
                    }}
                    minDate={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                    dateFormat="yyyy-MM-dd"
                    locale={enUS}
                    placeholderText="YYYY-MM-DD"
                    className="wa-datepicker-input"
                    required
                  />
                </label>
              </div>

              {/* 🔥 กล่องสรุปวันหยุด Real-time */}
              {(leaveForm.startDate && leaveForm.endDate) && (
                <div className="leave-preview-info" style={{
                  gridColumn: '1 / -1', background: '#f0f9ff', border: '1px solid #bae6fd',
                  padding: '12px', borderRadius: '12px', color: '#0369a1', fontSize: '14px'
                }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiCalendar /> <span>Actual leave days: <strong>{previewDays} days</strong></span>
                   </div>
                   <p style={{ fontSize: '11px', color: '#0ea5e9', margin: '4px 0 0' }}>* Weekends and public holidays are excluded automatically</p>
                </div>
              )}

              <label className="full">Detail<textarea name="detail" rows="3" value={leaveForm.detail} onChange={handleLeaveChange} placeholder="Reason." /></label>
              <label className="full">
                <span className="field-label">ATTACHMENT (OPTIONAL)</span>

                <div className="file-upload">
                  <input
                    type="file"
                    id="attachment"
                    hidden
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                  />

                  <label htmlFor="attachment" className="file-upload-btn">
                    Choose file
                  </label>

                  <span className={`file-upload-name ${selectedFile ? "active" : ""}`}>
                    {selectedFile ? selectedFile.name : "No file selected"}
                  </span>
                </div>
              </label>
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