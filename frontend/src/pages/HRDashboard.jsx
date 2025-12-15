import React, { useMemo, useState } from "react";
import "./HRDashboard.css";

/* ===== Mock Data ===== */
const MOCK_DAY_RECORDS = {
  "2025-12-12": [
    { id: 1, name: "Jokec", role: "Worker", checkIn: "10:50", checkOut: "18:10", status: "Late", note: "-" },
    { id: 2, name: "Mina", role: "Worker", checkIn: "09:01", checkOut: "18:02", status: "On Time", note: "-" },
    { id: 3, name: "Boss", role: "Worker", checkIn: "-", checkOut: "-", status: "Leave (Sick)", note: "Flu" },
  ],
  "2025-12-11": [
    { id: 4, name: "Jokec", role: "Worker", checkIn: "09:00", checkOut: "18:00", status: "On Time", note: "-" },
    { id: 5, name: "Mina", role: "Worker", checkIn: "09:10", checkOut: "18:00", status: "Late", note: "-" },
  ],
};

/* ===== Helpers ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function getMonthMatrix(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startDay = first.getDay();
  const start = new Date(year, monthIndex, 1 - startDay);

  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      week.push(d);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function HRDashboard() {
  const [viewYear, setViewYear] = useState(2025);
  const [viewMonth, setViewMonth] = useState(11); // Dec
  const [selectedDate, setSelectedDate] = useState("2025-12-12");

  const weeks = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const dayRecords = useMemo(
    () => MOCK_DAY_RECORDS[selectedDate] || [],
    [selectedDate]
  );

  const daySummary = useMemo(() => {
    const totalLeave = dayRecords.filter((r) =>
      String(r.status).toLowerCase().includes("leave")
    ).length;
    const totalLate = dayRecords.filter((r) => r.status === "Late").length;
    const totalPresent = dayRecords.filter(
      (r) =>
        r.checkIn !== "-" &&
        !String(r.status).toLowerCase().includes("leave")
    ).length;
    return { totalPresent, totalLeave, totalLate };
  }, [dayRecords]);

  const monthHasData = (iso) => Boolean(MOCK_DAY_RECORDS[iso]?.length);

  const goPrevMonth = () => {
    const m = viewMonth - 1;
    if (m < 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth(m);
  };

  const goNextMonth = () => {
    const m = viewMonth + 1;
    if (m > 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth(m);
  };

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", {
    month: "long",
  });

  return (
    <div className="page-card">
      {/* ===== Header ===== */}
      <header className="hr-header">
        <div>
          <h1 className="hr-title">HR Dashboard</h1>
          <p className="hr-subtitle">
            Calendar + Attendance Overview
          </p>
        </div>

        <div className="hr-header-right">
          <div className="pill">{selectedDate}</div>
          <button className="icon-btn" aria-label="Notifications">
            🔔
          </button>
        </div>
      </header>

      {/* ===== Calendar Controls ===== */}
      <div className="calendar-top">
        <div className="calendar-title">
          <button className="nav-btn" onClick={goPrevMonth}>‹</button>
          <div className="month-label">
            {monthName} {viewYear}
          </div>
          <button className="nav-btn" onClick={goNextMonth}>›</button>
        </div>

        <div className="hint">
          คลิกวันที่เพื่อดูสรุปการทำงานของพนักงาน
        </div>
      </div>

      {/* ===== Calendar ===== */}
      <div className="calendar">
        <div className="calendar-head">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div className="cal-cell head" key={d}>{d}</div>
          ))}
        </div>

        <div className="calendar-body">
          {weeks.map((week, wIdx) => (
            <React.Fragment key={wIdx}>
              {week.map((d) => {
                const iso = toISODate(d);
                const inMonth = d.getMonth() === viewMonth;
                const isSelected = iso === selectedDate;
                const hasData = monthHasData(iso);

                return (
                  <button
                    key={iso}
                    className={[
                      "cal-cell",
                      inMonth ? "" : "muted",
                      isSelected ? "selected" : "",
                      hasData ? "hasData" : "",
                    ].join(" ")}
                    onClick={() => setSelectedDate(iso)}
                  >
                    <div className="cal-date">{d.getDate()}</div>
                    {hasData && <div className="dot" />}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ===== Summary ===== */}
      <section className="summary-row">
        <div className="summary-card">
          <h4>Present</h4>
          <p className="big">{daySummary.totalPresent}</p>
          <span className="mutetext">คนมาทำงาน</span>
        </div>
        <div className="summary-card">
          <h4>Leave</h4>
          <p className="big">{daySummary.totalLeave}</p>
          <span className="mutetext">คนลา</span>
        </div>
        <div className="summary-card">
          <h4>Late</h4>
          <p className="big">{daySummary.totalLate}</p>
          <span className="mutetext">คนมาสาย</span>
        </div>
      </section>

      {/* ===== Daily Records ===== */}
      <section className="table-section">
        <h2 className="section-title">
          Daily Records ({selectedDate})
        </h2>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {dayRecords.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty">
                    No data for this day
                  </td>
                </tr>
              ) : (
                dayRecords.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.role}</td>
                    <td>{r.checkIn}</td>
                    <td>{r.checkOut}</td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === "Late"
                            ? "badge-late"
                            : String(r.status).includes("Leave")
                            ? "badge-leave"
                            : "badge-ok"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td>{r.note}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
