import React, { useMemo, useState, useEffect } from "react";
import moment from "moment";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { FiRefreshCw, FiCalendar, FiCheckCircle, FiXCircle, FiClock, FiFileText, FiTrendingUp, FiSave } from "react-icons/fi";
import "./HRDashboard.css";
import DailyDetailModal from "../components/DailyDetailModal";
import Pagination from "../components/Pagination";
import axiosClient from "../api/axiosClient";
import { alertError } from "../utils/sweetAlert";

/* ===== Helpers ===== */
const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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
  const [tab, setTab] = useState("overview");
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));

  // Data States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [monthLeaveMap, setMonthLeaveMap] = useState({});
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  // Reports States
  const [rangeStart, setRangeStart] = useState(toISODate(new Date(viewYear, viewMonth, 1)));
  const [rangeEnd, setRangeEnd] = useState(toISODate(new Date(viewYear, viewMonth + 1, 0)));
  const [reportSummary, setReportSummary] = useState({ present: 0, leave: 0, late: 0, absent: 0, total: 0, lateRate: 0 });
  
  // Reports Data
  const [employeeReport, setEmployeeReport] = useState([]);
  const [leaveChartData, setLeaveChartData] = useState([]);
  const [perfectEmployees, setPerfectEmployees] = useState([]);

  // Pagination & Modals
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [dailyData, setDailyData] = useState(null);

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = toISODate(new Date());

  /* ===== API Calls ===== */
  const fetchMonthLeaves = async () => {
    try {
      const start = toISODate(new Date(viewYear, viewMonth, 1));
      const end = toISODate(new Date(viewYear, viewMonth + 1, 0));
      const res = await axiosClient.get(`/leave/admin/all?startDate=${start}&endDate=${end}`);
      const approved = res.data.requests?.filter((r) => r.status === "Approved") || [];
      const mapping = {};

      approved.forEach((leave) => {
        let curr = moment(leave.startDate).startOf("day");
        const last = moment(leave.endDate).startOf("day");
        
        // 🔥 จุดสำคัญ: ดึงสีจาก leaveType มาใช้ (ถ้าไม่มีให้ใช้สีฟ้า Default)
        const typeColor = leave.leaveType?.colorCode || "#3b82f6";
        const typeName = leave.leaveType?.typeName || "Leave";

        while (curr.isSameOrBefore(last, "day")) {
          const ds = curr.format("YYYY-MM-DD");
          if (!mapping[ds]) mapping[ds] = [];
          mapping[ds].push({
            name: `${leave.employee.firstName} ${leave.employee.lastName}`,
            typeName: typeName,
            colorCode: typeColor, // ✅ ส่งสีเข้าไปใน Object นี้
          });
          curr.add(1, "day");
        }
      });
      setMonthLeaveMap(mapping);
    } catch (err) { console.error("Month Leaves Error:", err); }
  };

  const fetchDailyRecords = async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes] = await Promise.all([
        axiosClient.get(`/timerecord/all?startDate=${selectedDate}&endDate=${selectedDate}`),
        axiosClient.get(`/leave/admin/all?startDate=${selectedDate}&endDate=${selectedDate}`),
      ]);
      setAttendanceRecords(attRes.data.records || []);
      setLeaveRequests(leaveRes.data.requests?.filter((r) => r.status === "Approved") || []);
    } catch (err) { console.error("Daily Records Error:", err);
    } finally { setLoading(false); }
  };

  const fetchChartData = async () => {
    try {
      const res = await axiosClient.get("/timerecord/stats/late-monthly");
      setChartData(res.data.data || []);
    } catch (err) { console.error("Stats Error:", err); }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get(`/timerecord/report/performance?startDate=${rangeStart}&endDate=${rangeEnd}`);
      const { individualReport, leaveChartData, perfectEmployees } = res.data.data;

      const summary = individualReport.reduce((acc, emp) => ({
        present: acc.present + emp.presentCount,
        late: acc.late + emp.lateCount,
        leave: acc.leave + emp.leaveCount,
        absent: acc.absent + emp.absentCount
      }), { present: 0, late: 0, leave: 0, absent: 0 });

      setReportSummary({
        ...summary,
        total: summary.present + summary.leave + summary.absent,
        lateRate: summary.present > 0 ? Math.round((summary.late / summary.present) * 100) : 0
      });

      setEmployeeReport(individualReport);
      setLeaveChartData(leaveChartData); // ข้อมูลนี้ควรมีสี (color) ติดมาด้วยจาก Backend
      setPerfectEmployees(perfectEmployees);
    } catch (err) {
      alertError("Error", "Unable to fetch report data.");
    } finally { setLoading(false); }
  };

  /* ===== Handlers ===== */
  const handleExportPerformance = () => {
    if (employeeReport.length === 0) return alertError("Error", "No data to export.");
    let csv = 'Employee Name,Present (Days),Late (Times),Leave (Days),Absent (Days),Late Rate\n';
    employeeReport.forEach(emp => {
      csv += `"${emp.name}",${emp.presentCount},${emp.lateCount},${emp.leaveCount},${emp.absentCount},${emp.lateRate}%\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `performance_report_${rangeStart}_to_${rangeEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleStartDateChange = (e) => {
    const newStart = e.target.value;
    setRangeStart(newStart);
    const endOfMonth = moment(newStart).endOf('month').format("YYYY-MM-DD");
    setRangeEnd(endOfMonth);
  };

  const openDailyDetail = async (dateStr) => {
    try {
      setLoading(true);
      const res = await axiosClient.get(`/timerecord/daily-detail?date=${dateStr}`);
      setDailyData(res.data.data);
      setSelectedDate(dateStr);
      setDailyModalOpen(true);
    } catch (err) {
      alertError("Error", "Unable to load data.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchMonthLeaves();
    fetchChartData();
  }, [viewYear, viewMonth]);

  useEffect(() => {
    fetchDailyRecords();
    setPage(1);
  }, [selectedDate]);

  const dayRecords = useMemo(() => {
    const att = attendanceRecords.map((r) => ({
      id: `att-${r.recordId}`,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      role: r.employee.role,
      checkIn: r.checkInTime ? moment(r.checkInTime).format("HH:mm") : "--:--",
      checkOut: r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "--:--",
      status: r.isLate ? "Late" : "On Time",
    }));
    const leave = leaveRequests.map((l) => ({
      id: `leave-${l.requestId}`,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      role: l.employee.role,
      checkIn: "--:--", checkOut: "--:--",
      status: `Leave (${l.leaveType.typeName})`,
      // ถ้าอยากให้ Badge ในตารางมีสีด้วย ก็ดึง l.leaveType.colorCode มาใช้ตรงนี้ได้นะคะ
    }));
    return [...att, ...leave];
  }, [attendanceRecords, leaveRequests]);

  return (
    <div className="page-card hr-dashboard">
      <header className="hr-header">
        <div>
          <h1 className="hr-title">Management Dashboard</h1>
          <p className="hr-subtitle">Oversee employee attendance and leave requests</p>
        </div>
        <div className="hr-header-right">
          <div className="pill date-pill"><FiCalendar /> Selected: {moment(selectedDate).format("DD MMM YYYY")}</div>
        </div>
      </header>

      <div className="hr-tabs">
        {["overview", "reports"].map((t) => (
          <button key={t} className={`btn small ${tab === t ? "primary" : "outline"}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : "Performance Reports"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <section className="dashboard-section calendar-section">
            <div className="calendar-top">
              <div className="calendar-title-group">
                <button className="nav-btn" onClick={() => setViewMonth(prev => prev === 0 ? 11 : prev - 1)}>‹</button>
                <h2 className="month-label">{moment(new Date(viewYear, viewMonth, 1)).format("MMMM YYYY")}</h2>
                <button className="nav-btn" onClick={() => setViewMonth(prev => prev === 11 ? 0 : prev + 1)}>›</button>
              </div>
              <button className="btn outline small today-btn" onClick={() => setSelectedDate(todayStr)}>Go to Today</button>
            </div>

            <div className="calendar">
              <div className="calendar-head">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="cal-cell head" key={d}>{d}</div>)}
              </div>
              <div className="calendar-body">
                {weeks.map((week, wIdx) => (
                  <React.Fragment key={wIdx}>
                    {week.map((d) => {
                      const iso = toISODate(d);
                      const leaves = monthLeaveMap[iso] || [];
                      return (
                        <div
                          key={iso}
                          className={`cal-cell ${d.getMonth() !== viewMonth ? "muted" : ""} ${iso === selectedDate ? "selected" : ""}`}
                          onClick={() => openDailyDetail(iso)}
                        >
                          <div className="cal-date-row">
                            <span className="cal-date">{d.getDate()}</span>
                            {leaves.length > 2 && (<span className="more-count-badge">+{leaves.length - 2}</span>
                            )}
                          </div>
                          <div className="cal-leave-list">
                            {leaves.slice(0, 2).map((x, i) => (
                              <div 
                                key={i} 
                                className="leave-pill" 
                                style={{ 
                                  backgroundColor: x.colorCode, /* 🔥 ใช้สีจากฐานข้อมูล */
                                  color: '#fff', 
                                  // เพิ่มเงาให้ตัวหนังสืออ่านง่ายขึ้น
                                  textShadow: '0 1px 2px rgba(0,0,0,0.2)' 
                                }} 
                                title={`${x.name} - ${x.typeName}`}
                              >
                                {x.name}
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
          </section>

          <section className="dashboard-section details-section">
            <div className="section-header">
              <h3>Daily Attendance Records</h3>
              <button className="btn outline small" onClick={fetchDailyRecords} disabled={loading}><FiRefreshCw className={loading ? "spin" : ""} /> Refresh</button>
            </div>
            {/* ... (ส่วนตารางด้านล่างเหมือนเดิม) ... */}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Role</th><th>In</th><th>Out</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {dayRecords.length === 0 ? (
                    <tr><td colSpan="5" className="empty">No records found for this date.</td></tr>
                  ) : (
                    dayRecords.slice((page-1)*pageSize, page*pageSize).map((r) => (
                      <tr key={r.id}>
                        <td className="fw-500">{r.name}</td>
                        <td className="text-muted">{r.role}</td>
                        <td>{r.checkIn}</td>
                        <td>{r.checkOut}</td>
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
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Pagination total={dayRecords.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </div>
          </section>
        </>
      )}

      {tab === "reports" && (
        <section className="dashboard-section">
            <div className="section-header reports-header">
              <div><h3>HR Analytics</h3><p>Detailed performance and attendance trends</p></div>
              <div className="reports-controls">
                <div className="input-group">
                  <label>Start:</label>
                  <input type="date" value={rangeStart} max={todayStr} onChange={handleStartDateChange} />
                </div>
                <div className="input-group">
                  <label>End:</label>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </div>
                <button className="btn primary small" onClick={fetchReport} disabled={loading}>Run Report</button>
                <button className="btn outline small" onClick={handleExportPerformance} disabled={employeeReport.length === 0}>
                  <FiSave /> Export CSV
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <Card title="Present" value={reportSummary.present} tone="green" icon={<FiCheckCircle />} />
              <Card title="On Leave" value={reportSummary.leave} tone="blue" icon={<FiFileText />} />
              <Card title="Late" value={reportSummary.late} tone="red" icon={<FiClock />} />
              <Card title="Absent" value={reportSummary.absent} tone="gray" icon={<FiXCircle />} />
              <Card title="Late Rate" value={`${reportSummary.lateRate}%`} tone="amber" icon={<FiTrendingUp />} />
            </div>

            {/* ... (ส่วนตาราง Reports เหมือนเดิม) ... */}
             <div className="table-wrap" style={{ marginTop: 25 }}>
              <div className="table-header-title">Employee Performance Summary</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="text-center">Days Present</th>
                    <th className="text-center">Times Late</th>
                    <th className="text-center">Days Leave</th>
                    <th className="text-center">Days Absent</th>
                    <th className="text-center">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeReport.length === 0 ? (
                    <tr><td colSpan="6" className="empty">Click "Run Report" to load analytics.</td></tr>
                  ) : (
                    employeeReport.map(emp => (
                      <tr key={emp.employeeId}>
                        <td><strong>{emp.name}</strong></td>
                        <td className="text-center">{emp.presentCount}</td>
                        <td className="text-center text-danger">{emp.lateCount}</td>
                        <td className="text-center">{emp.leaveCount}</td>
                        <td className="text-center text-danger">{emp.absentCount}</td>
                        <td className="text-center">
                            <span className={`badge ${emp.lateRate > 20 ? "badge-late" : "badge-ok"}`}>{emp.lateRate}%</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="charts-container">
              <div className="report-card">
                <h5 className="card-title">🏆 Top Performance (Perfect Attendance)</h5>
                <div className="perfect-list">
                  {perfectEmployees.length > 0 ? perfectEmployees.map(emp => (
                    <div key={emp.employeeId} className="perfect-item">
                      <span className="fw-500">{emp.name}</span>
                      <span className="badge badge-ok">EXCELLENT</span>
                    </div>
                  )) : <p className="empty-msg">No data available for this period.</p>}
                </div>
              </div>

              <div className="report-card">
                <h5 className="card-title">📊 Leave Distribution</h5>
                <div className="chart-box">
                  {leaveChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={leaveChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {leaveChartData.map((entry, index) => (
                            /* 🔥 จุดสำคัญ: กราฟวงกลมก็ควรดึงสีมาแสดงด้วย */
                            <Cell key={`cell-${index}`} fill={entry.color || "#3b82f6"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="empty-msg">No leave data found.</p>}
                </div>
              </div>
            </div>
        </section>
      )}

      <DailyDetailModal isOpen={dailyModalOpen} onClose={() => setDailyModalOpen(false)} date={selectedDate} data={dailyData} />
    </div>
  );
}

function Card({ title, value, tone, icon }) {
  const themes = {
    green: { bg: "#f0fdf4", border: "#22c55e", fg: "#166534" },
    blue: { bg: "#eff6ff", border: "#3b82f6", fg: "#1e40af" },
    red: { bg: "#fef2f2", border: "#ef4444", fg: "#991b1b" },
    amber: { bg: "#fffbeb", border: "#f59e0b", fg: "#92400e" },
    gray: { bg: "#f8fafc", border: "#e2e8f0", fg: "#334155" },
  };
  const p = themes[tone];
  return (
    <div className="stat-card" style={{ background: p.bg, borderLeft: `4px solid ${p.border}` }}>
      <div className="stat-content">
        <div className="stat-label" style={{ color: p.fg }}>{title}</div>
        <div className="stat-value" style={{ color: p.fg }}>{value}</div>
      </div>
      <div className="stat-icon" style={{ color: p.border }}>{icon}</div>
    </div>
  );
}