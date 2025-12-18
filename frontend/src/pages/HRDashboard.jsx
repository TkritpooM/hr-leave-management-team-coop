import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";
import moment from "moment";
import "./HRDashboard.css";

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
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));
  
  // States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [monthLeaveMap, setMonthLeaveMap] = useState({}); 
  const [loading, setLoading] = useState(false);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const weeks = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  // --- 📅 1. ดึงข้อมูลการลาทั้งเดือน (แสดง ชื่อ-นามสกุล บนปฏิทิน) ---
  const fetchMonthLeaves = async () => {
    try {
      const startOfMonth = toISODate(new Date(viewYear, viewMonth, 1));
      const endOfMonth = toISODate(new Date(viewYear, viewMonth + 1, 0));

      const res = await axios.get(
        `http://localhost:8000/api/leave/admin/all?startDate=${startOfMonth}&endDate=${endOfMonth}`,
        getAuthHeader()
      );

      const approvedLeaves = res.data.requests?.filter(r => r.status === 'Approved') || [];
      const mapping = {};

      approvedLeaves.forEach(leave => {
        let current = moment(leave.startDate).startOf('day');
        const end = moment(leave.endDate).startOf('day');

        while (current.isSameOrBefore(end, 'day')) {
          const dateStr = current.format('YYYY-MM-DD');
          if (!mapping[dateStr]) mapping[dateStr] = [];
          
          // เก็บทั้งชื่อและนามสกุล
          mapping[dateStr].push(`${leave.employee.firstName} ${leave.employee.lastName}`);
          current.add(1, 'day');
        }
      });

      setMonthLeaveMap(mapping);
    } catch (err) {
      console.error("Fetch Month Leaves Error:", err);
    }
  };

  // --- 🔥 2. ดึงรายละเอียดของวันที่เลือก ---
  const fetchDailyRecords = async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes] = await Promise.all([
        axios.get(`http://localhost:8000/api/timerecord/all?startDate=${selectedDate}&endDate=${selectedDate}`, getAuthHeader()),
        axios.get(`http://localhost:8000/api/leave/admin/all?startDate=${selectedDate}&endDate=${selectedDate}`, getAuthHeader())
      ]);

      setAttendanceRecords(attRes.data.records || []);
      setLeaveRequests(leaveRes.data.requests?.filter(r => r.status === 'Approved') || []);
    } catch (err) {
      console.error("Fetch Daily Data Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMonthLeaves(); }, [viewYear, viewMonth]);
  useEffect(() => { fetchDailyRecords(); }, [selectedDate]);

  const dayRecords = useMemo(() => {
    const att = attendanceRecords.map(r => ({
      id: `att-${r.recordId}`,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      role: r.employee.role,
      checkIn: r.checkInTime ? moment(r.checkInTime).format("HH:mm") : "-",
      checkOut: r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "-",
      status: r.isLate ? "Late" : "On Time",
      note: "-"
    }));

    const leave = leaveRequests.map(l => ({
      id: `leave-${l.requestId}`,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      role: l.employee.role,
      checkIn: "-", checkOut: "-",
      status: `Leave (${l.leaveType.typeName})`,
      note: l.reason || "-"
    }));

    return [...att, ...leave];
  }, [attendanceRecords, leaveRequests]);

  const daySummary = useMemo(() => ({
    totalPresent: attendanceRecords.length,
    totalLeave: leaveRequests.length,
    totalLate: attendanceRecords.filter((r) => r.isLate).length,
  }), [attendanceRecords, leaveRequests]);

  const goPrevMonth = () => {
    const m = viewMonth - 1;
    if (m < 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m);
  };
  const goNextMonth = () => {
    const m = viewMonth + 1;
    if (m > 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m);
  };

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", { month: "long" });

  return (
    <div className="page-card">
      <header className="hr-header">
        <div>
          <h1 className="hr-title">HR Dashboard</h1>
          <p className="hr-subtitle">Calendar - Employee Leave Overview</p>
        </div>
        <div className="hr-header-right">
          <div className="pill">{selectedDate}</div>
        </div>
      </header>

      <div className="calendar-top">
        <div className="calendar-title">
          <button className="nav-btn" onClick={goPrevMonth}>‹</button>
          <div className="month-label">{monthName} {viewYear}</div>
          <button className="nav-btn" onClick={goNextMonth}>›</button>
        </div>
      </div>

      <div className="calendar">
        <div className="calendar-head">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div className="cal-cell head" key={d}>{d}</div>)}
        </div>
        <div className="calendar-body">
          {weeks.map((week, wIdx) => (
            <React.Fragment key={wIdx}>
              {week.map((d) => {
                const iso = toISODate(d);
                const inMonth = d.getMonth() === viewMonth;
                const leaves = monthLeaveMap[iso] || [];

                return (
                  <div
                    key={iso}
                    className={`cal-cell ${!inMonth ? "muted" : ""} ${iso === selectedDate ? "selected" : ""}`}
                    onClick={() => setSelectedDate(iso)}
                  >
                    <div className="cal-date">{d.getDate()}</div>
                    <div className="cal-leave-list">
                      {leaves.map((fullName, i) => (
                        <div key={i} className="leave-item-name" title={fullName}>
                           {fullName}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <section className="summary-row">
        <div className="summary-card"><h4>Present</h4><p className="big">{daySummary.totalPresent}</p></div>
        <div className="summary-card"><h4>Leave</h4><p className="big">{daySummary.totalLeave}</p></div>
        <div className="summary-card"><h4>Late</h4><p className="big">{daySummary.totalLate}</p></div>
      </section>

      <section className="table-section">
        <h2 className="section-title">Details for {moment(selectedDate).format('LL')}</h2>
        <div className="table-wrap">
          {loading ? <div className="loading-box">Loading...</div> : (
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr>
              </thead>
              <tbody>
                {dayRecords.length === 0 ? (
                  <tr><td colSpan="5" className="empty">ไม่มีข้อมูลในวันนี้</td></tr>
                ) : (
                  dayRecords.map(r => (
                    <tr key={r.id}>
                      <td>{r.name}</td><td>{r.role}</td><td>{r.checkIn}</td><td>{r.checkOut}</td>
                      <td>
                        <span className={`badge ${r.status.includes("Leave") ? "badge-leave" : r.status === "Late" ? "badge-late" : "badge-ok"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}