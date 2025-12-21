// src/pages/WorkerDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./WorkerDashboard.css";
import Pagination from "../components/Pagination";

export default function WorkerDashboard() {
  const [now, setNow] = useState(new Date());

  // States สำหรับ Attendance (Today)
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);

  // States สำหรับข้อมูลจริงจาก Backend
  const [history, setHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });

  // States สำหรับ Leave Modal & Form
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
  });

  // ✅ Pagination (เพิ่มเฉพาะส่วนนี้)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // --- 1. Fetch Attendance (History & Today's Status) ---
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
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  // --- 2. Fetch Quota (Real data from Backend) ---
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader());
      setQuotas(response.data.quotas || []);
      // ตั้งค่า LeaveType เริ่มต้นในฟอร์ม
      if (response.data.quotas.length > 0) {
        setLeaveForm((prev) => ({ ...prev, leaveTypeId: response.data.quotas[0].leaveTypeId }));
      }
    } catch (err) {
      console.error("Failed to fetch quotas:", err);
    }
  };

  // --- 3. Fetch Late Summary (Real data from Backend) ---
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
      fetchLateSummary(); // อัปเดตยอดมาสายเผื่อวันนี้สาย
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

      // ✅ ถ้าสิ่งที่เปลี่ยนคือ startDate ให้เอาค่าไปใส่ใน endDate ด้วย
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
        leaveTypeId: parseInt(leaveForm.leaveTypeId),
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        startDuration: "Full",
        endDuration: "Full",
        reason: leaveForm.detail,
      };

      // 💡 ส่งข้อมูล (ตอนนี้ Backend จะส่ง 200 พร้อม success: false ถ้าโควต้าไม่พอ)
      const res = await axios.post("http://localhost:8000/api/leave/request", payload, getAuthHeader());

      // ✅ ตรวจสอบผลลัพธ์จาก Body
      if (res.data.success) {
        alert("✅ ส่งคำขอลาสำเร็จ!");
        setIsLeaveModalOpen(false);

        // ล้างฟอร์ม
        setLeaveForm({
          leaveTypeId: quotas.length > 0 ? quotas[0].leaveTypeId : "",
          startDate: "",
          endDate: "",
          detail: "",
        });

        fetchQuotaData(); // อัปเดตตัวเลขโควต้า
      } else {
        // ⚠️ กรณีโควต้าไม่พอ หรือลาซ้ำ (ผลลัพธ์จาก Backend ที่เราดักไว้)
        alert("⚠️ ไม่สำเร็จ: " + res.data.message);
      }
    } catch (err) {
      // ❌ กรณี Error รุนแรง เช่น Server ล่ม
      const errorMsg = err.response?.data?.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ";
      alert("❌ " + errorMsg);
      console.error("Submit Leave Error:", err);
    }
  };

  // Helper Formats
  const formatTime = (d) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const formatDate = (s) =>
    s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // ✅ Pagination 계산 (เพิ่มเฉพาะส่วนนี้)
  const totalHistory = history.length;
  const startIdx = (page - 1) * pageSize;
  const pagedHistory = useMemo(() => history.slice(startIdx, startIdx + pageSize), [history, startIdx, pageSize]);

  // ✅ เมื่อ history เปลี่ยน (fetch ใหม่) ให้กัน page หลุด
  useEffect(() => {
    setPage(1);
  }, [totalHistory]);

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">Hello, {user.firstName || "Worker"}</h1>
          <p className="worker-datetime">{now.toLocaleString("en-GB")}</p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
        </div>
      </header>

      {/* สรุปมาสายจาก Backend */}
      <div className="late-warning">
        <span>
          Late this month:{" "}
          <strong>
            {lateSummary.lateCount} / {lateSummary.lateLimit}
          </strong>
        </span>
        {lateSummary.lateCount > lateSummary.lateLimit && <span className="late-warning-danger"> Exceeded Limit!</span>}
      </div>

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
          <button className="secondary-btn" onClick={handleCheckOut} disabled={!checkedInAt || !!checkedOutAt}>
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

      {/* Leave Balance จาก Backend */}
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
          <p>Loading quotas...</p>
        )}
      </section>

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
              {pagedHistory.map((row) => (
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
              ))}
            </tbody>
          </table>

          {/* ✅ Pagination (เพิ่มเฉพาะส่วนนี้) */}
          <Pagination
            total={totalHistory}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>

      {/* Leave Request Modal */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Request Leave</h3>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>Leave Type</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType.typeName}
                  </option>
                ))}
              </select>
              <div className="date-row">
                <label>
                  Start Date <input type="date" name="startDate" value={leaveForm.startDate} onChange={handleLeaveChange} required />
                </label>
                <label>
                  End Date <input type="date" name="endDate" value={leaveForm.endDate} onChange={handleLeaveChange} required />
                </label>
              </div>
              <label>
                Detail{" "}
                <textarea name="detail" rows="3" onChange={handleLeaveChange} placeholder="Reason..."></textarea>
              </label>
              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => setIsLeaveModalOpen(false)}>
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
