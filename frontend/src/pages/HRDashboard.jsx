import React, { useMemo, useState, useEffect } from "react";
import moment from "moment";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
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
  if (t.includes("paid")) return "leave-badge paid";
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
  const [reportSummary, setReportSummary] = useState({ present: 0, leave: 0, late: 0, total: 0, lateRate: 0 });
  const [topLate, setTopLate] = useState([]);

  // Audit States
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditItems, setAuditItems] = useState([]);
  const [auditQuery, setAuditQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = toISODate(new Date());

  // Daily Modal
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [dailyData, setDailyData] = useState(null);

  // Reports
  const [employeeReport, setEmployeeReport] = useState([]);
  const [leaveChartData, setLeaveChartData] = useState([]);
  const [perfectEmployees, setPerfectEmployees] = useState([]);

  /* ===== API Calls ===== */

  // 1. ดึงข้อมูลการลาล่วงหน้าเพื่อแสดงบนปฏิทิน
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

  // 2. ดึงข้อมูลรายวัน (ตารางด้านล่าง) - แก้ไขตามที่สั่ง: คลิกแล้วแค่อัปเดตข้อมูล ไม่เปิด Modal
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

  // 3. ดึงสถิติกราฟ
  const fetchChartData = async () => {
    try {
      const res = await axiosClient.get("/timerecord/stats/late-monthly");
      setChartData(res.data.data || []);
    } catch (err) { console.error("Stats Error:", err); }
  };

  // 4. รายงาน (Tab Reports)
  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axiosClient.get(`/timerecord/report/performance?startDate=${rangeStart}&endDate=${rangeEnd}`);
      
      // 1. ดึงข้อมูลที่ได้จาก Backend
      const { individualReport, leaveChartData, perfectEmployees } = res.data.data;

      // 2. คำนวณสรุปยอดรวม (Summary) จากข้อมูลรายบุคคลที่ได้มา
      const totalPresent = individualReport.reduce((sum, emp) => sum + emp.presentCount, 0);
      const totalLate = individualReport.reduce((sum, emp) => sum + emp.lateCount, 0);
      const totalLeave = individualReport.reduce((sum, emp) => sum + emp.leaveCount, 0);
      const totalItems = totalPresent + totalLeave; // ยอดรวมรายการทั้งหมด
      const avgLateRate = totalPresent > 0 ? Math.round((totalLate / totalPresent) * 100) : 0;

      // 3. อัปเดต State สรุปยอดรวม (เพื่อให้ตัวเลขด้านบนไม่เป็น 0)
      setReportSummary({
        present: totalPresent,
        leave: totalLeave,
        late: totalLate,
        total: totalItems,
        lateRate: avgLateRate
      });

      // 4. อัปเดต State ข้อมูลส่วนอื่นๆ
      setEmployeeReport(individualReport);
      setLeaveChartData(leaveChartData);
      setPerfectEmployees(perfectEmployees);

    } catch (err) {
      console.error("Fetch Report Error:", err);
      alertError("Error", "ไม่สามารถดึงข้อมูลรายงานได้");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!(await alertConfirm("ยืนยันการส่งออก", "ดาวน์โหลดรายงานเป็น CSV?", "Export"))) return;
    try {
      const res = await axiosClient.get("/timerecord/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `report_${moment().format("YYYY-MM-DD")}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) { alertError("Error", "Export ล้มเหลว"); }
  };

  // Daily Details
  const openDailyDetail = async (dateStr) => {
    try {
      setLoading(true);
      // 1. เรียก API เส้นใหม่ที่เราสร้างไว้ใน Backend
      const res = await axiosClient.get(`/timerecord/daily-detail?date=${dateStr}`);
      
      // 2. เก็บข้อมูลที่ได้ลง State
      setDailyData(res.data.data);
      
      // 3. อัปเดตวันที่เลือกเพื่อให้ตารางด้านล่างอัปเดตด้วย (รักษาฟังก์ชันเดิม)
      setSelectedDate(dateStr);
      
      // 4. สั่งเปิด Modal สรุปยอด
      setDailyModalOpen(true);
    } catch (err) {
      console.error("Fetch Daily Detail Error:", err);
      alertError("ผิดพลาด", "ไม่สามารถดึงข้อมูลรายละเอียดรายวันได้");
    } finally {
      setLoading(false);
    }
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

  /* ===== Computed Data ===== */
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

  const daySummary = useMemo(() => ({
    totalPresent: attendanceRecords.length,
    totalLeave: leaveRequests.length,
    totalLate: attendanceRecords.filter((r) => r.isLate).length,
  }), [attendanceRecords, leaveRequests]);

  const pagedDayRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return dayRecords.slice(start, start + pageSize);
  }, [dayRecords, page, pageSize]);

  /* ===== Handlers ===== */
  const changeMonth = (offset) => {
    const newDate = moment(new Date(viewYear, viewMonth, 1)).add(offset, "months");
    setViewMonth(newDate.month());
    setViewYear(newDate.year());
  };

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
                <button className="nav-btn" onClick={() => changeMonth(-1)}>‹</button>
                <h2 className="month-label">{moment(new Date(viewYear, viewMonth, 1)).format("MMMM YYYY")}</h2>
                <button className="nav-btn" onClick={() => changeMonth(1)}>›</button>
              </div>
              <div className="calendar-actions">
                <button className="btn outline small" onClick={() => setSelectedDate(todayStr)}>Go to Today</button>
              </div>
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
                          onClick={() => openDailyDetail(iso)} // 🔥 เปลี่ยนเป็นแค่อัปเดตวันที่ ข้อมูลจะโหลดลงตารางอัตโนมัติ
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

          <section className="dashboard-section analytics-section" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "20px" }}>
            <div className="summary-group">
              <h3>สรุปรายวัน ({moment(selectedDate).format("DD MMM")})</h3>
              <SummaryCard title="Present" value={daySummary.totalPresent} color="#22c55e" bg="#f0fdf4" />
              <SummaryCard title="On Leave" value={daySummary.totalLeave} color="#3b82f6" bg="#eff6ff" />
              <SummaryCard title="Late" value={daySummary.totalLate} color="#ef4444" bg="#fef2f2" />
            </div>

            <div className="chart-container" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                <h3 style={{ margin: 0 }}>Monthly Late Statistics</h3>
                <button className="btn outline small" onClick={handleExport}>Export CSV</button>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "transparent" }} />
                  <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="dashboard-section details-section">
            <div className="section-header" style={{ display: "flex", justifyContent: "space-between" }}>
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
                    pagedDayRecords.map((r) => (
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
              <div><h3>HR Reports</h3><p>สรุปการเข้างานและอันดับคนมาสาย</p></div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                <button className="btn primary small" onClick={fetchReport}>Run</button>
              </div>
           </div>
           <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 15 }}>
              <Card title="Present" value={reportSummary.present} tone="green" />
              <Card title="On Leave" value={reportSummary.leave} tone="blue" />
              <Card title="Late" value={reportSummary.late} tone="red" />
              <Card title="Total" value={reportSummary.total} tone="gray" />
              <Card title="Late Rate" value={`${reportSummary.lateRate}%`} tone="amber" />
           </div>
           <div className="table-wrap" style={{ marginTop: 20 }}>
              <div style={{ padding: "12px", fontWeight: "bold", borderBottom: "1px solid #eee" }}>
                ตารางสรุปผลงานพนักงานรายบุคคล
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>พนักงาน</th>
                    <th style={{ textAlign: "center" }}>มาทำงาน (วัน)</th>
                    <th style={{ textAlign: "center" }}>มาสาย (ครั้ง)</th>
                    <th style={{ textAlign: "center" }}>ลา (วัน)</th>
                    <th style={{ textAlign: "center" }}>Late Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeReport.length === 0 ? (
                    <tr><td colSpan="5" className="empty">กรุณากด Run Report เพื่อดูข้อมูล</td></tr>
                  ) : (
                    employeeReport.map(emp => (
                      <tr key={emp.employeeId}>
                        <td><strong>{emp.name}</strong><br/><small className="text-muted">{emp.role}</small></td>
                        <td style={{ textAlign: "center" }}>{emp.presentCount}</td>
                        <td style={{ textAlign: "center" }}>
                            <span className={emp.lateCount > 0 ? "text-danger" : ""}>{emp.lateCount}</span>
                        </td>
                        <td style={{ textAlign: "center" }}>{emp.leaveCount}</td>
                        <td style={{ textAlign: "center" }}>
                            <span className={`badge ${emp.lateRate > 20 ? "badge-late" : "badge-ok"}`}>
                                {emp.lateRate}%
                            </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* --- ส่วนที่ 1: พนักงานดีเด่น & กราฟการลา --- */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", 
              gap: "20px", 
              marginTop: "25px" 
            }}>
              
              {/* ฝั่งซ้าย: พนักงานดีเด่น */}
              <div className="card-custom" style={{ padding: "20px", border: "1px solid #e5e7eb" }}>
                <h5 style={{ color: "#16a34a", marginBottom: "15px" }}>🏆 พนักงานดีเด่น (Perfect Attendance)</h5>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {perfectEmployees.length > 0 ? perfectEmployees.map(emp => (
                    <div key={emp.employeeId} className="d-flex justify-content-between p-2 bg-light rounded shadow-sm">
                      <span className="fw-500">{emp.name}</span>
                      <span className="badge bg-success">ดีเยี่ยม</span>
                    </div>
                  )) : <p className="text-center text-muted py-4">ไม่มีข้อมูลพนักงานดีเด่นในช่วงนี้</p>}
                </div>
              </div>

              {/* ฝั่งขวา: สรุปสัดส่วนการลา (Pie Chart Version) */}
              <div className="card-custom" style={{ padding: "20px", border: "1px solid #e5e7eb" }}>
                <h5 style={{ marginBottom: "15px" }}>📊 สัดส่วนประเภทการลา</h5>
                <div style={{ width: "100%", height: "250px" }}>
                  {leaveChartData.length > 0 ? (
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={leaveChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry) => `${entry.name}: ${entry.value}วัน`}
                        >
                          {/* กำหนดสีแยกตามประเภทการลา */}
                          {leaveChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? "#3b82f6" : index === 1 ? "#10b981" : "#f59e0b"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted py-5">ไม่มีข้อมูลการลา</p>
                  )}
                </div>
              </div>
            </div>
        </section>
      )}
      <DailyDetailModal 
        isOpen={dailyModalOpen} 
        onClose={() => setDailyModalOpen(false)} 
        date={selectedDate} 
        data={dailyData} 
      />
    </div>
  );
}

/* Sub-components (Cleaned up) */
function SummaryCard({ title, value, color, bg }) {
  return (
    <div style={{ background: bg, padding: "12px", borderRadius: "10px", borderLeft: `4px solid ${color}`, marginBottom: "8px" }}>
      <span style={{ color, fontWeight: 600, fontSize: "0.85rem" }}>{title}</span>
      <div style={{ fontSize: "1.6rem", fontWeight: "bold", color }}>{value}</div>
    </div>
  );
}

function Card({ title, value, tone }) {
  const p = {
    green: { bg: "#f0fdf4", border: "#22c55e", fg: "#166534" },
    blue: { bg: "#eff6ff", border: "#3b82f6", fg: "#1e40af" },
    red: { bg: "#fef2f2", border: "#ef4444", fg: "#991b1b" },
    amber: { bg: "#fffbeb", border: "#f59e0b", fg: "#92400e" },
    gray: { bg: "#f8fafc", border: "#e2e8f0", fg: "#334155" },
  }[tone];
  return (
    <div style={{ background: p.bg, borderLeft: `4px solid ${p.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ color: p.fg, fontWeight: 700, fontSize: 12 }}>{title}</div>
      <div style={{ color: p.fg, fontWeight: 900, fontSize: 22 }}>{value}</div>
    </div>
  );
}
