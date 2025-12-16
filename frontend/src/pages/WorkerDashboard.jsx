import React, { useEffect, useState } from "react";
import axios from "axios";
import "./WorkerDashboard.css";

export default function WorkerDashboard() {
  const [now, setNow] = useState(new Date());
  
  // State สำหรับเก็บสถานะการเช็คชื่อของ "วันนี้"
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  
  // State สำหรับเก็บประวัติ
  const [history, setHistory] = useState([]);
  
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    type: "Annual",
    startDate: "",
    endDate: "",
    detail: "",
  });

  const lateCountThisMonth = 0; 
  const lateLimit = 5;
  const leaveBalance = {
    annual: { used: 5, total: 12 },
    sick: { used: 2, total: 7 },
    personal: { used: 2, total: 3 },
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // --- 🔥 Fetch Data (แก้ไขแล้ว) ---
  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/my", getAuthHeader());
      
      // ✅ แก้จุดที่ 1: ดึง array ออกมาจาก key "records" ตามที่เห็นใน Network Tab
      const records = response.data.records || [];
      
      setHistory(records);

      // เช็คว่า "วันนี้" มีรายการหรือยัง?
      const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // ใช้ workDate ให้ตรงกับ API
      const todayRecord = records.find(r => r.workDate && r.workDate.startsWith(todayStr));

      if (todayRecord) {
        if (todayRecord.checkInTime) {
            setCheckedInAt(new Date(todayRecord.checkInTime));
        }
        if (todayRecord.checkOutTime) {
            setCheckedOutAt(new Date(todayRecord.checkOutTime));
        }
      }
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
    }
  };

  useEffect(() => {
    fetchAttendanceData();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (dateInput) => {
    if (!dateInput) return "--:--";
    const date = new Date(dateInput);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateTime = (date) =>
    date.toLocaleString("en-GB", {
      weekday: "long", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const formatDateOnly = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleCheckIn = async () => {
    if (checkedInAt) return; 

    try {
      await axios.post("http://localhost:8000/api/timerecord/checkin", {}, getAuthHeader());
      
      alert("✅ Check In สำเร็จ!");
      setCheckedInAt(new Date()); 
      fetchAttendanceData(); // โหลดตารางใหม่
    } catch (err) {
      console.error(err);
      alert("❌ Check In ไม่สำเร็จ: " + (err.response?.data?.message || err.message));
    }
  };

  const handleCheckOut = async () => {
    if (!checkedInAt || checkedOutAt) return;

    try {
      await axios.post("http://localhost:8000/api/timerecord/checkout", {}, getAuthHeader());
      
      alert("✅ Check Out สำเร็จ!");
      setCheckedOutAt(new Date());
      fetchAttendanceData();
    } catch (err) {
      console.error(err);
      alert("❌ Check Out ไม่สำเร็จ: " + (err.response?.data?.message || err.message));
    }
  };

  // Mock Leave Handlers
  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitLeave = (e) => {
    e.preventDefault();
    setIsLeaveModalOpen(false);
  };

  const isLateExceeded = lateCountThisMonth > lateLimit;
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">Hello, {user.firstName || 'Worker'}</h1>
          <p className="worker-datetime">{formatDateTime(now)}</p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
          <button className="icon-button">🔔</button>
        </div>
      </header>

      <div className="late-warning">
        <span>Late this month: {lateCountThisMonth} / {lateLimit}</span>
        {isLateExceeded && <span className="late-warning-danger">Limit Exceeded</span>}
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
          <p className="action-time">Request a leave</p>
          <button className="secondary-btn" onClick={() => setIsLeaveModalOpen(true)}>Request Leave</button>
        </div>
      </section>

      <section className="summary-row">
         <div className="summary-card"><h4>Annual</h4><p>Used {leaveBalance.annual.used}</p></div>
         <div className="summary-card"><h4>Sick</h4><p>Used {leaveBalance.sick.used}</p></div>
         <div className="summary-card"><h4>Personal</h4><p>Used {leaveBalance.personal.used}</p></div>
      </section>

      {/* ===== 🔥 History Section (Verified) ===== */}
      <section className="history-section">
        <h2>Your Personal Time History</h2>
        <div className="history-filters">
          <select><option>This Month</option></select>
          <button className="outline-btn">Export CSV</button>
        </div>

        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((row) => (
                  <tr key={row.recordId}>
                    {/* ใช้ชื่อตัวแปรตาม API: workDate */}
                    <td>{formatDateOnly(row.workDate)}</td>
                    
                    {/* ใช้ชื่อตัวแปรตาม API: checkInTime */}
                    <td>{formatTime(row.checkInTime)}</td>
                    
                    {/* ใช้ชื่อตัวแปรตาม API: checkOutTime */}
                    <td>{formatTime(row.checkOutTime)}</td>
                    
                    <td>
                        <span className={`status-badge ${row.isLate ? 'status-late' : 'status-ok'}`}>
                            {row.isLate ? 'Late' : 'On Time'}
                        </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan="5" style={{textAlign: 'center', padding: '20px'}}>
                        No history found.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isLeaveModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
            <div className="modal">
                <h3>Request Leave (Mock)</h3>
                <button onClick={() => setIsLeaveModalOpen(false)}>Close</button>
            </div>
          </div>
      )}
    </div>
  );
}