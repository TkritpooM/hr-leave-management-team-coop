// src/pages/HRAttendancePage.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import "./HRAttendancePage.css";

export default function HRAttendancePage() {
  const [now, setNow] = useState(new Date());

  // Attendance (Today)
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);

  // Backend data
  const [history, setHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });

  // Leave modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
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

  // --- 1) Attendance (History + Today status) ---
  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/timerecord/my",
        getAuthHeader()
      );

      const records = response.data.records || [];
      setHistory(records);

      // ✅ FIX: reset ค่าทุกครั้งก่อนหา today (กันค้าง)
      setCheckedInAt(null);
      setCheckedOutAt(null);

      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = records.find(
        (r) => r.workDate && r.workDate.startsWith(todayStr)
      );

      if (todayRecord) {
        if (todayRecord.checkInTime) setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime) setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  // --- 2) Leave Quota ---
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/leave/quota/my",
        getAuthHeader()
      );
      
      // ลอง console.log ดูว่า response.data หน้าตาเป็นยังไง
      console.log("Quota Response:", response.data);

      const qs = response.data.quotas || []; // Backend ส่งมาเป็นชื่อ 'quotas'
      setQuotas(qs);

      if (qs.length > 0) {
        setLeaveForm((prev) => ({ 
          ...prev, 
          leaveTypeId: qs[0].leaveTypeId.toString() 
        }));
      }
    } catch (err) {
      console.error("Failed to fetch quotas:", err);
    }
  };

  // --- 3) Late Summary ---
  const fetchLateSummary = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/timerecord/late/summary",
        getAuthHeader()
      );
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
    fetchQuotaData();
    fetchLateSummary();

    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Handlers ---
  const handleCheckIn = async () => {
    try {
      await axios.post("http://localhost:8000/api/timerecord/checkin", {}, getAuthHeader());
      alert("✅ Check In สำเร็จ!");
      fetchAttendanceData();
      fetchLateSummary(); // อัปเดตยอดมาสาย
    } catch (err) {
      alert("❌ " + (err.response?.data?.message || "Check In ล้มเหลว"));
    }
  };

  const handleCheckOut = async () => {
    try {
      await axios.post("http://localhost:8000/api/timerecord/checkout", {}, getAuthHeader());
      alert("✅ Check Out สำเร็จ!");
      fetchAttendanceData();
    } catch (err) {
      alert("❌ " + (err.response?.data?.message || "Check Out ล้มเหลว"));
    }
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => {
      const newState = { ...prev, [name]: value };

      // ✅ ถ้าสิ่งที่เปลี่ยนคือ startDate ให้เอาค่าไปใส่ใน endDate ด้วยอัตโนมัติ
      if (name === "startDate") {
        newState.endDate = value;
      }

      return newState;
    });
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        leaveTypeId: parseInt(leaveForm.leaveTypeId, 10),
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        startDuration: "Full",
        endDuration: "Full",
        reason: leaveForm.detail,
      };

      const response = await axios.post(
        "http://localhost:8000/api/leave/request",
        payload,
        getAuthHeader()
      );

      // ✅ ตรวจสอบ success จากร่างกายของ JSON ที่ Backend ส่งมา
      if (response.data.success) {
        alert("✅ " + (response.data.message || "ส่งคำขอลาสำเร็จ!"));
        setIsLeaveModalOpen(false);
        fetchQuotaData(); // อัปเดตตัวเลขโควต้าหน้าจอ
        // ล้างฟอร์ม (Optional)
        setLeaveForm({ leaveTypeId: quotas[0]?.leaveTypeId.toString() || "", startDate: "", endDate: "", detail: "" });
      } else {
        // ❌ กรณีโควต้าไม่พอ หรือ Validation ไม่ผ่าน (แต่ Server ตอบ 200 มาให้)
        alert("⚠️ " + (response.data.message || "ไม่สามารถส่งคำขอลาได้"));
      }
    } catch (err) {
      // ❌ กรณี Server พัง หรือ Token หมดอายุ (Error Status 4xx, 5xx)
      const errorMsg = err.response?.data?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์";
      alert("❌ " + errorMsg);
    }
  };

  // Helpers
  const formatTime = (d) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

  const formatDate = (s) =>
    s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  return (
    <div className="page-card">
      {/* Header เหมือน Worker */}
      <header className="worker-header">
        <div>
          <h1 className="worker-title">Hello, {user.firstName || "HR"}</h1>
          <p className="worker-datetime">{now.toLocaleString("en-GB")}</p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
        </div>
      </header>

      {/* Late warning เหมือน Worker */}
      <div className="late-warning">
        <span>
          Late this month: <strong>{lateSummary.lateCount} / {lateSummary.lateLimit}</strong>
        </span>
        {lateSummary.lateCount > lateSummary.lateLimit && (
          <span className="late-warning-danger"> Exceeded Limit!</span>
        )}
      </div>

      {/* Action cards เหมือน Worker */}
      <section className="action-row">
        <div className="action-card">
          <h3>Check In</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button className="primary-btn" onClick={handleCheckIn} disabled={!!checkedInAt}>
            {checkedInAt ? "Checked In" : "Check In Now"}
          </button>
        </div>

        <div className="action-card">
          <h3>Check Out</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>
          <button
            className="secondary-btn"
            onClick={handleCheckOut}
            disabled={!checkedInAt || !!checkedOutAt}
          >
            {!checkedInAt ? "Check In First" : checkedOutAt ? "Checked Out" : "Check Out"}
          </button>
        </div>

        <div className="action-card">
          <h3>Leave</h3>
          <p className="action-time">Manage Leaves</p>
          <button className="secondary-btn" onClick={() => setIsLeaveModalOpen(true)}>
            Request Leave
          </button>
        </div>
      </section>

      {/* Leave Balance เหมือน Worker */}
      <section className="summary-row">
        {quotas.length > 0 ? (
          quotas.map((q) => (
            <div className="summary-card" key={q.quotaId}>
              <h4>{q.leaveType.typeName}</h4>
              <p>
                Used {parseFloat(q.usedDays)} / {parseFloat(q.totalDays)} Days
              </p>
            </div>
          ))
        ) : (
          <p>Loading quotas.</p>
        )}
      </section>

      {/* History เหมือน Worker (คอลัมน์ Status) */}
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
                <tr>
                  <td colSpan="4" className="empty">
                    ไม่มีข้อมูล
                  </td>
                </tr>
              ) : (
                history.map((row) => (
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

      {/* Leave Request Modal (เหมือน Worker) */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Request Leave</h3>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>Leave Type</label>
              <select
                  name="leaveTypeId"
                  value={leaveForm.leaveTypeId}
                  onChange={handleLeaveChange}
                  required
              >
                  {quotas.length > 0 ? (
                      quotas.map((q) => (
                          <option key={q.leaveTypeId} value={q.leaveTypeId}>
                              {q.leaveType?.typeName || "Unknown Type"} 
                          </option>
                      ))
                  ) : (
                      <option value="" disabled>No leave types available</option>
                  )}
              </select>

              <div className="date-row">
                <label>
                  Start Date
                  <input type="date" name="startDate" value={leaveForm.startDate} onChange={handleLeaveChange} required />
                </label>
                <label>
                  End Date
                  <input type="date" name="endDate" value={leaveForm.endDate} onChange={handleLeaveChange} required />
                </label>
              </div>

              <label>
                Detail
                <textarea
                  name="detail"
                  rows="3"
                  onChange={handleLeaveChange}
                  placeholder="Reason."
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setIsLeaveModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
