import React, { useMemo, useState, useEffect } from "react";
import moment from "moment";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { FiPlus, FiSave, FiRefreshCw, FiCalendar } from "react-icons/fi";
import "./HRDashboard.css";
import DailyDetailModal from "../components/DailyDetailModal";
import Pagination from "../components/Pagination";
import axiosClient from "../api/axiosClient";
import { alertConfirm, alertError } from "../utils/sweetAlert";

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

const leaveTypeClass = (typeName = "") => {
  const t = String(typeName || "").toLowerCase();
  if (t.includes("sick")) return "leave-badge sick";
  if (t.includes("personal")) return "leave-badge personal";
  if (t.includes("vacation")) return "leave-badge vacation";
  return "leave-badge";
};

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
        while (curr.isSameOrBefore(last, "day")) {
          const ds = curr.format("YYYY-MM-DD");
          if (!mapping[ds]) mapping[ds] = [];
          mapping[ds].push({
            name: `${leave.employee.firstName} ${leave.employee.lastName}`,
            typeName: leave.leaveType?.typeName || "Leave",
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

      // Calculate Totals for Summary Cards
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
      setLeaveChartData(leaveChartData);
      setPerfectEmployees(perfectEmployees);
    } catch (err) {
      alertError("Error", "ไม่สามารถดึงข้อมูลรายงานได้");
    } finally { setLoading(false); }
  };

  /* ===== Handlers ===== */

  const handleExportPerformance = () => {
    if (employeeReport.length === 0) return alertError("Error", "ไม่มีข้อมูลสำหรับ Export");
    
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
    
    // Auto End of Month: เมื่อเลือกวันเริ่ม ให้เซตวันจบเป็นสิ้นเดือนนั้น
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
      alertError("ผิดพลาด", "ไม่สามารถดึงข้อมูลได้");
    } finally { setLoading(false); }
  };

  /* ===== Effects ===== */
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
      checkIn: r.checkInTime ? moment(r.checkInTime).format("HH:mm") : "-",
      checkOut: r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "-",
      status: r.isLate ? "Late" : "On Time",
    }));
    const leave = leaveRequests.map((l) => ({
      id: `leave-${l.requestId}`,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      role: l.employee.role,
      checkIn: "-", checkOut: "-",
      status: `Leave (${l.leaveType.typeName})`,
    }));
    return [...att, ...leave];
  }, [attendanceRecords, leaveRequests]);

  return (
    <div className="page-card hr-dashboard">
      <header className="hr-header">
        <div>
          <h1 className="hr-title">HR Dashboard</h1>
          <p className="hr-subtitle">จัดการเวลาเข้างานและข้อมูลการลาพนักงาน</p>
        </div>
        <div className="hr-header-right">
          <div className="pill date-pill">วันที่เลือก: {moment(selectedDate).format("DD MMM YYYY")}</div>
        </div>
      </header>

      <div className="hr-tabs">
        {["overview", "reports", "audit"].map((t) => (
          <button key={t} className={`btn small ${tab === t ? "primary" : "outline"}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
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
              <button className="btn outline small" onClick={() => setSelectedDate(todayStr)}>Go to Today</button>
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
                            {leaves.length > 2 && <span className="more-badge">+{leaves.length - 2}</span>}
                          </div>
                          <div className="cal-leave-list">
                            {leaves.slice(0, 2).map((x, i) => (
                              <div key={i} className={`leave-pill ${leaveTypeClass(x.typeName)}`} title={x.name}>{x.name}</div>
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
              <h3>บันทึกพนักงานประจำวัน</h3>
              <button className="btn outline small" onClick={fetchDailyRecords} disabled={loading}>Refresh</button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Role</th><th>Time In</th><th>Time Out</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {dayRecords.length === 0 ? (
                    <tr><td colSpan="5" className="empty">ไม่พบข้อมูลสำหรับวันนี้</td></tr>
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
           <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "end" }}>
              <div><h3>HR Reports</h3><p>วิเคราะห์ผลงานและสถิติการเข้างานรายบุคคล</p></div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                <button className="btn primary small" onClick={fetchReport} disabled={loading}>Run Report</button>
                <button className="btn outline small" onClick={handleExportPerformance} disabled={employeeReport.length === 0}>
                  <FiSave /> Export CSV
                </button>
              </div>
           </div>

           <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 20 }}>
              <Card title="Present" value={reportSummary.present} tone="green" />
              <Card title="On Leave" value={reportSummary.leave} tone="blue" />
              <Card title="Late" value={reportSummary.late} tone="red" />
              <Card title="Absent" value={reportSummary.absent} tone="gray" />
              <Card title="Late Rate" value={`${reportSummary.lateRate}%`} tone="amber" />
           </div>

           <div className="table-wrap" style={{ marginTop: 25 }}>
              <div style={{ padding: "15px", fontWeight: "bold", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                ตารางสรุปผลงานพนักงานรายบุคคล
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>พนักงาน</th>
                    <th style={{ textAlign: "center" }}>มาทำงาน (วัน)</th>
                    <th style={{ textAlign: "center" }}>มาสาย (ครั้ง)</th>
                    <th style={{ textAlign: "center" }}>ลา (วัน)</th>
                    <th style={{ textAlign: "center" }}>ขาดงาน (วัน)</th>
                    <th style={{ textAlign: "center" }}>Late Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeReport.length === 0 ? (
                    <tr><td colSpan="6" className="empty">กรุณากด Run Report เพื่อดูข้อมูล</td></tr>
                  ) : (
                    employeeReport.map(emp => (
                      <tr key={emp.employeeId}>
                        <td><strong>{emp.name}</strong></td>
                        <td style={{ textAlign: "center" }}>{emp.presentCount}</td>
                        <td style={{ textAlign: "center" }} className={emp.lateCount > 0 ? "text-danger" : ""}>{emp.lateCount}</td>
                        <td style={{ textAlign: "center" }}>{emp.leaveCount}</td>
                        <td style={{ textAlign: "center" }} className={emp.absentCount > 0 ? "text-danger" : ""}>{emp.absentCount}</td>
                        <td style={{ textAlign: "center" }}>
                            <span className={`badge ${emp.lateRate > 20 ? "badge-late" : "badge-ok"}`}>{emp.lateRate}%</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
           </div>

           <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: 20, marginTop: 25 }}>
              {/* พนักงานดีเด่น */}
              <div className="card-custom" style={{ padding: 20, border: "1px solid #e5e7eb" }}>
                <h5 style={{ color: "#16a34a", marginBottom: 15 }}>🏆 พนักงานดีเด่น (Perfect Attendance)</h5>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {perfectEmployees.length > 0 ? perfectEmployees.map(emp => (
                    <div key={emp.employeeId} className="d-flex justify-content-between p-2 bg-light rounded shadow-sm">
                      <span className="fw-500">{emp.name}</span>
                      <span className="badge bg-success">ดีเยี่ยม</span>
                    </div>
                  )) : <p className="text-center text-muted py-4">ไม่มีข้อมูลในช่วงนี้</p>}
                </div>
              </div>

              {/* กราฟสัดส่วนการลา */}
              <div className="card-custom" style={{ padding: 20, border: "1px solid #e5e7eb" }}>
                <h5 style={{ marginBottom: 15 }}>📊 สัดส่วนประเภทการลา</h5>
                <div style={{ width: "100%", height: 250 }}>
                  {leaveChartData.length > 0 ? (
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={leaveChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {leaveChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || "#3b82f6"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-center text-muted py-5">ไม่มีข้อมูลการลา</p>}
                </div>
              </div>
           </div>
        </section>
      )}

      <DailyDetailModal isOpen={dailyModalOpen} onClose={() => setDailyModalOpen(false)} date={selectedDate} data={dailyData} />
    </div>
  );
}

/* --- Sub-components --- */
function Card({ title, value, tone }) {
  const themes = {
    green: { bg: "#f0fdf4", border: "#22c55e", fg: "#166534" },
    blue: { bg: "#eff6ff", border: "#3b82f6", fg: "#1e40af" },
    red: { bg: "#fef2f2", border: "#ef4444", fg: "#991b1b" },
    amber: { bg: "#fffbeb", border: "#f59e0b", fg: "#92400e" },
    gray: { bg: "#f8fafc", border: "#e2e8f0", fg: "#334155" },
  };
  const p = themes[tone];
  return (
    <div style={{ background: p.bg, borderLeft: `4px solid ${p.border}`, borderRadius: 12, padding: 15 }}>
      <div style={{ color: p.fg, fontWeight: 700, fontSize: 13 }}>{title}</div>
      <div style={{ color: p.fg, fontWeight: 900, fontSize: 24 }}>{value}</div>
    </div>
  );
}