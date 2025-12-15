// src/pages/WorkerDashboard.jsx
import React, { useEffect, useState } from "react";
import "./WorkerDashboard.css";

const MOCK_HISTORY = [
  {
    date: "12 Dec 2025",
    checkIn: "10:50",
    checkOut: "18:10",
    status: "Late",
    note: "-",
  },
  {
    date: "11 Dec 2025",
    checkIn: "09:00",
    checkOut: "18:00",
    status: "On Time",
    note: "-",
  },
  {
    date: "10 Dec 2025",
    checkIn: "-",
    checkOut: "-",
    status: "Leave (Annual)",
    note: "Family",
  },
];

export default function WorkerDashboard() {
  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    type: "Annual",
    startDate: "",
    endDate: "",
    detail: "",
  });

  // mock data
  const lateCountThisMonth = 3;
  const lateLimit = 5;
  const leaveBalance = {
    annual: { used: 5, total: 12 },
    sick: { used: 2, total: 7 },
    personal: { used: 2, total: 3 },
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) =>
    date
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "--:--";

  const formatDateTime = (date) =>
    date.toLocaleString("en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const handleCheckIn = () => {
    if (checkedInAt) return;
    setCheckedInAt(new Date());
    setCheckedOutAt(null);
  };

  const handleCheckOut = () => {
    if (!checkedInAt || checkedOutAt) return;
    setCheckedOutAt(new Date());
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitLeave = (e) => {
    e.preventDefault();
    console.log("Leave request:", leaveForm);
    alert("Leave request submitted (mock)");
    setIsLeaveModalOpen(false);
    setLeaveForm({
      type: "Annual",
      startDate: "",
      endDate: "",
      detail: "",
    });
  };

  const isLateExceeded = lateCountThisMonth > lateLimit;

  return (
    <div className="page-card">
      {/* ===== Header ===== */}
      <header className="worker-header">
        <div>
          <h1 className="worker-title">Jokec, Worker</h1>
          <p className="worker-datetime">{formatDateTime(now)}</p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
          <button className="icon-button" aria-label="Notifications">
            🔔
          </button>
        </div>
      </header>

      {/* ===== Late warning ===== */}
      <div className="late-warning">
        <span>
          Late this month: {lateCountThisMonth} / {lateLimit}
        </span>
        {isLateExceeded && (
          <span className="late-warning-danger">
            You have exceeded the late limit. HR will be notified.
          </span>
        )}
      </div>

      {/* ===== Action cards ===== */}
      <section className="action-row">
        {/* Check In */}
        <div className="action-card">
          <h3>Check In</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button
            className="primary-btn"
            onClick={handleCheckIn}
            disabled={!!checkedInAt}
          >
            {checkedInAt ? "Checked In" : "Check In Now"}
          </button>
        </div>

        {/* Check Out */}
        <div className="action-card">
          <h3>Check Out</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>
          <button
            className="secondary-btn"
            onClick={handleCheckOut}
            disabled={!checkedInAt || !!checkedOutAt}
          >
            {!checkedInAt
              ? "Check In First"
              : checkedOutAt
              ? "Checked Out"
              : "Check Out"}
          </button>
        </div>

        {/* Leave */}
        <div className="action-card">
          <h3>Leave</h3>
          <p className="action-time">Request a leave</p>
          <button
            className="secondary-btn"
            onClick={() => setIsLeaveModalOpen(true)}
          >
            Request Leave
          </button>
        </div>
      </section>

      {/* ===== Leave balance ===== */}
      <section className="summary-row">
        <div className="summary-card">
          <h4>Annual Leave</h4>
          <p>
            Used {leaveBalance.annual.used} / {leaveBalance.annual.total} days
          </p>
        </div>
        <div className="summary-card">
          <h4>Sick Leave</h4>
          <p>
            Used {leaveBalance.sick.used} / {leaveBalance.sick.total} days
          </p>
        </div>
        <div className="summary-card">
          <h4>Personal Leave</h4>
          <p>
            Used {leaveBalance.personal.used} / {leaveBalance.personal.total} days
          </p>
        </div>
      </section>

      {/* ===== History ===== */}
      <section className="history-section">
        <h2>Your Personal Time History</h2>

        <div className="history-filters">
          <select>
            <option>This Month</option>
            <option>Last Month</option>
          </select>
          <select>
            <option>All</option>
            <option>Attendance Only</option>
            <option>Leave Only</option>
            <option>Late Only</option>
          </select>
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
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_HISTORY.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.checkIn}</td>
                  <td>{row.checkOut}</td>
                  <td>{row.status}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== Leave modal ===== */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Request Leave</h3>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>
                Leave Type
                <select
                  name="type"
                  value={leaveForm.type}
                  onChange={handleLeaveChange}
                >
                  <option value="Annual">Annual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Personal">Personal Leave</option>
                </select>
              </label>

              <div className="date-row">
                <label>
                  Start Date
                  <input
                    type="date"
                    name="startDate"
                    value={leaveForm.startDate}
                    onChange={handleLeaveChange}
                    required
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    name="endDate"
                    value={leaveForm.endDate}
                    onChange={handleLeaveChange}
                    required
                  />
                </label>
              </div>

              <label>
                Detail
                <textarea
                  name="detail"
                  rows="3"
                  value={leaveForm.detail}
                  onChange={handleLeaveChange}
                  placeholder="Reason for leave..."
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
