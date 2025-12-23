import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./HRAttendancePage.css";
import moment from "moment"; // 🔥 มั่นใจว่าได้ลง moment ไว้แล้ว (เหมือนหน้า worker)
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

const normStatus = (s) => String(s || "").trim().toLowerCase();

function QuotaCard({ title, usedDays, totalDays }) {
  const used = num(usedDays);
  const total = num(totalDays);
  const remaining = Math.max(0, total - used);
  const percent = total > 0 ? clamp((used / total) * 100, 0, 100) : 0;

  return (
    <div className="quota-card" role="group" aria-label={`${title} quota`}>
      <div className="quota-top">
        <h4 className="quota-title">{title}</h4>
        <span className="quota-chip">{Math.round(percent)}%</span>
      </div>

      <div className="quota-metrics">
        <div className="qm">
          <div className="qm-label">Used</div>
          <div className="qm-value">{used}</div>
        </div>
        <div className="qm">
          <div className="qm-label">Total</div>
          <div className="qm-value">{total}</div>
        </div>
        <div className="qm">
          <div className="qm-label">Remaining</div>
          <div className="qm-value">{remaining}</div>
        </div>
      </div>

      <div className="quota-bar" aria-label="Usage progress">
        <div className="quota-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function HRAttendancePage() {
  const [now, setNow] = useState(new Date());

  // Attendance (Today)
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);

  // Backend data
  const [history, setHistory] = useState([]);
  const [leaveHistory, setLeaveHistory] = useState([]); // 🔥 เพิ่มประวัติการลา
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });

  // Leave modal & File attachment
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
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

      setCheckedInAt(null);
      setCheckedOutAt(null);

      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = records.find((r) => r.workDate && r.workDate.startsWith(todayStr));

      if (todayRecord) {
        if (todayRecord.checkInTime) setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime) setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  // 2) Leave History Data 🔥
  const fetchLeaveHistory = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/my", getAuthHeader());
      setLeaveHistory(response.data.requests || []);
    } catch (err) {
      console.error("Failed to fetch leave history:", err);
    }
  };

  // 3) Quota Data
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader());
      const qs = response.data.quotas || [];
      setQuotas(qs);

      if (qs.length > 0) {
        setLeaveForm((prev) => ({
          ...prev,
          leaveTypeId: qs[0].leaveTypeId.toString(),
        }));
      }
    } catch (err) {
      console.error("Failed to fetch quotas:", err);
    }
  };

  // 4) Late Summary
  const fetchLateSummary = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/late/summary", getAuthHeader());
      setLateSummary({
        lateCount: response.data.lateCount,
        lateLimit: response.data.lateLimit,
      });
    } catch (err) {
      console.error("Failed to fetch late summary:", err);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
    fetchLeaveHistory(); // 🔥
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
    } catch (err) {
      await alertError("Check In ล้มเหลว", (err.response?.data?.message || "ไม่สามารถ Check In ได้"));
    }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post("http://localhost:8000/api/timerecord/checkout", {}, getAuthHeader());
      await alertSuccess("สำเร็จ", "Check Out สำเร็จ");
      fetchAttendanceData();
    } catch (err) {
      await alertError("Check Out ล้มเหลว", (err.response?.data?.message || "ไม่สามารถ Check Out ได้"));
    }
  };

  // 🔥 ฟังก์ชันยกเลิกใบลาของตัวเอง
  const handleCancelLeave = async (requestId) => {
    if (!(await alertConfirm("ยืนยันการยกเลิก", "คุณมั่นใจหรือไม่ที่จะยกเลิกคำขอลาใบนี้?", "ยืนยัน"))) return;
    try {
      const res = await axios.patch(
        `http://localhost:8000/api/leave/${requestId}/cancel`,
        {},
        getAuthHeader()
      );
      if (res.data.success) {
        await alertSuccess("สำเร็จ", "ยกเลิกคำขอลาเรียบร้อยแล้ว");
        fetchLeaveHistory();
        fetchQuotaData();
      } else {
        await alertError("ไม่สามารถยกเลิกได้", res.data.message);
      }
    } catch (err) {
      console.error("Cancel Leave Error:", err);
      await alertError("เกิดข้อผิดพลาด", "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "startDate") newState.endDate = value;
      return newState;
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("leaveTypeId", parseInt(leaveForm.leaveTypeId, 10));
      formData.append("startDate", leaveForm.startDate);
      formData.append("endDate", leaveForm.endDate);
      formData.append("startDuration", "Full");
      formData.append("endDuration", "Full");
      formData.append("reason", leaveForm.detail);
      
      if (selectedFile) {
        formData.append("attachment", selectedFile);
      }

      const token = localStorage.getItem("token");
      const response = await axios.post("http://localhost:8000/api/leave/request", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data.success) {
        await alertSuccess("สำเร็จ", "ส่งคำขอลาสำเร็จ");
        setIsLeaveModalOpen(false);
        setSelectedFile(null);
        fetchQuotaData();
        fetchLeaveHistory(); // 🔥 อัปเดตตารางหลังส่ง
        setLeaveForm({
          leaveTypeId: quotas[0]?.leaveTypeId.toString() || "",
          startDate: "",
          endDate: "",
          detail: "",
        });
      } else {
        await alertInfo("ไม่สามารถส่งคำขอลาได้", (response.data.message || "โปรดลองใหม่อีกครั้ง"));
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์";
      await alertError("เกิดข้อผิดพลาด", errorMsg);
    }
  };

  const formatTime = (d) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

  const formatDate = (s) =>
    s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

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
        <span>
          Late this month: <strong>{lateSummary.lateCount} / {lateSummary.lateLimit}</strong>
        </span>
        {lateSummary.lateCount > lateSummary.lateLimit && (
          <span className="late-warning-danger"> Exceeded Limit!</span>
        )}
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
            {!checkedInAt ? "Check In First" : checkedOutAt ? "Checked Out" : "Check Out"}
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

      <section className="quota-grid" aria-label="Leave quotas">
        {quotas.length > 0 ? (
          quotas.map((q) => (
            <QuotaCard
              key={q.quotaId}
              title={q.leaveType?.typeName || "Leave"}
              usedDays={q.usedDays}
              totalDays={q.totalDays}
            />
          ))
        ) : (
          <div className="quota-empty">Loading quotas...</div>
        )}
      </section>

      {/* --- Section: Time History --- */}
      <section className="history-section">
        <h2>Your Personal Time History</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Out</th>
                <th>Status</th>
              </tr>
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
                    <td>
                      <span className={`status-badge ${row.isLate ? "status-late" : "status-ok"}`}>
                        {row.isLate ? "Late" : "On Time"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- 🔥 Section: Leave History (ใหม่) --- */}
      <section className="history-section" style={{ marginTop: '30px' }}>
        <h2>Your Personal Leave History</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Date Range</th>
                <th>Days</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {leaveHistory.length === 0 ? (
                <tr><td colSpan="5" className="empty">ยังไม่มีประวัติการลา</td></tr>
              ) : (
                leaveHistory.slice(0, 10).map((req) => (
                  <tr key={req.requestId}>
                    <td><strong>{req.leaveType?.typeName}</strong></td>
                    <td>
                      {moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}
                    </td>
                    <td>{req.totalDaysRequested}</td>
                    <td>
                      <span className={`status-badge status-${normStatus(req.status)}`}>
                        {req.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {normStatus(req.status) === "pending" && (
                        <button
                          className="btn-leave"
                          style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#ef4444' }}
                          onClick={() => handleCancelLeave(req.requestId)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isLeaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Request Leave</h3>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>Leave Type</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName || "Unknown Type"}
                  </option>
                ))}
              </select>

              <div className="date-row">
                <label>Start Date <input type="date" name="startDate" value={leaveForm.startDate} onChange={handleLeaveChange} required /></label>
                <label>End Date <input type="date" name="endDate" value={leaveForm.endDate} onChange={handleLeaveChange} required /></label>
              </div>

              <label className="full">
                Detail
                <textarea name="detail" rows="3" value={leaveForm.detail} onChange={handleLeaveChange} placeholder="Reason." />
              </label>

              <label className="full">
                หลักฐานแนบ (ใบรับรองแพทย์/เอกสารอื่นๆ)
                <input type="file" accept="image/*, .pdf, .doc, .docx, .zip" onChange={handleFileChange} style={{ border: 'none', padding: '10px 0' }} />
                <small style={{ color: '#666', display: 'block', marginTop: '-5px', fontSize: '0.8rem' }}>
                  รองรับ: JPG, PNG, PDF, Word และ ZIP (ไม่เกิน 5MB)
                </small>
              </label>

              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => { setIsLeaveModalOpen(false); setSelectedFile(null); }}>Cancel</button>
                <button type="submit" className="primary-btn">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
