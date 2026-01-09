// src/pages/HRDashboard.jsx
import React, { useMemo, useState, useEffect } from "react";
import moment from "moment";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  FiRefreshCw,
  FiCalendar,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiFileText,
  FiTrendingUp,
  FiSave,
} from "react-icons/fi";
import "./HRDashboard.css";
import DailyDetailModal from "../components/DailyDetailModal";
import Pagination from "../components/Pagination";
import axiosClient from "../api/axiosClient";
import { alertError } from "../utils/sweetAlert";
import AuditLogPanel from "../components/AuditLogPanel";
import { useTranslation } from "react-i18next";

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

// 🔥 Helper: "mon,tue" -> [1,2]
const parseWorkingDays = (str) => {
  if (!str) return [1, 2, 3, 4, 5]; // Default Mon-Fri
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

export default function HRDashboard() {
  const { t } = useTranslation();

  const [tab, setTab] = useState("overview");
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));

  // Data States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [monthLeaveMap, setMonthLeaveMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [specialHolidays, setSpecialHolidays] = useState([]);

  // 🔥 Working days (default Mon-Fri, then override by API)
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);

  // Reports States
  const [rangeStart, setRangeStart] = useState(toISODate(new Date(viewYear, viewMonth, 1)));
  const [rangeEnd, setRangeEnd] = useState(toISODate(new Date(viewYear, viewMonth + 1, 0)));
  const [reportSummary, setReportSummary] = useState({
    present: 0,
    leave: 0,
    late: 0,
    absent: 0,
    total: 0,
    lateRate: 0,
  });

  const [employeeReport, setEmployeeReport] = useState([]);
  const [leaveChartData, setLeaveChartData] = useState([]);
  const [perfectEmployees, setPerfectEmployees] = useState([]);

  // Pagination & Modals
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dailyModalOpen, setDailyModalOpen] = useState(false);
  const [dailyData, setDailyData] = useState(null);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);
  const [reportPagination, setReportPagination] = useState({ total: 0, totalPages: 0 });

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayStr = toISODate(new Date());

  /* ===== API Calls ===== */

  // ✅ Calendar data (leave + holidays + working days)
  const fetchCalendarData = async () => {
    try {
      const start = toISODate(new Date(viewYear, viewMonth, 1));
      const end = toISODate(new Date(viewYear, viewMonth + 1, 0));

      const [leaveRes, policyRes] = await Promise.all([
        axiosClient.get(`/leave/admin/all?startDate=${start}&endDate=${end}`),
        axiosClient.get(`/admin/attendance-policy`),
      ]);

      const approved = leaveRes.data.requests?.filter((r) => r.status === "Approved") || [];
      const holidays = policyRes.data.policy?.specialHolidays || [];

      if (policyRes.data.policy?.workingDays) {
        const days = parseWorkingDays(policyRes.data.policy.workingDays);
        setWorkingDays(days);
      }
      setSpecialHolidays(holidays);

      const mapping = {};

      // 1) special holidays first (highest priority)
      holidays.forEach((hDate) => {
        const ds = moment(hDate).format("YYYY-MM-DD");
        if (!mapping[ds]) mapping[ds] = [];
        mapping[ds].push({
          name: t("pages.hrDashboard.companyHoliday"),
          isHoliday: true,
          colorCode: "#64748b",
        });
      });

      // 2) approved leaves
      approved.forEach((leave) => {
        let curr = moment(leave.startDate).startOf("day");
        const last = moment(leave.endDate).startOf("day");
        const typeColor = leave.leaveType?.colorCode || "#3b82f6";

        while (curr.isSameOrBefore(last, "day")) {
          const ds = curr.format("YYYY-MM-DD");
          if (!mapping[ds]) mapping[ds] = [];
          mapping[ds].push({
            name: `${leave.employee.firstName} ${leave.employee.lastName}`,
            typeName: leave.leaveType?.typeName || t("common.leave"),
            colorCode: typeColor,
            isHoliday: false,
          });
          curr.add(1, "day");
        }
      });

      setMonthLeaveMap(mapping);
    } catch (err) {
      console.error("Calendar Data Error:", err);
    }
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
    } catch (err) {
      console.error("Daily Records Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async (targetPage = 1) => {
    setLoading(true);
    try {
      const res = await axiosClient.get(
        `/timerecord/report/performance?startDate=${rangeStart}&endDate=${rangeEnd}&page=${targetPage}&limit=${reportPageSize}`
      );
      const { individualReport, leaveChartData, pagination } = res.data.data;

      const summary = individualReport.reduce(
        (acc, emp) => ({
          present: acc.present + emp.presentCount,
          late: acc.late + emp.lateCount,
          leave: acc.leave + emp.leaveCount,
          absent: acc.absent + emp.absentCount,
        }),
        { present: 0, late: 0, leave: 0, absent: 0 }
      );

      setReportSummary({
        ...summary,
        total: summary.present + summary.leave + summary.absent,
        lateRate: summary.present > 0 ? Math.round((summary.late / summary.present) * 100) : 0,
      });

      setEmployeeReport(individualReport);
      setLeaveChartData(leaveChartData);
      setReportPagination(pagination);
      setReportPage(targetPage);
    } catch (err) {
      alertError(t("common.error"), t("pages.hrDashboard.unableToFetchReport"));
    } finally {
      setLoading(false);
    }
  };

  /* ===== Handlers ===== */
  const handleExportPerformance = () => {
    if (employeeReport.length === 0) return alertError(t("common.error"), t("pages.hrDashboard.noDataToExport"));

    let csv = `${t("pages.hrDashboard.csv.employeeName")},${t("pages.hrDashboard.csv.presentDays")},${t(
      "pages.hrDashboard.csv.lateTimes"
    )},${t("pages.hrDashboard.csv.leaveDays")},${t("pages.hrDashboard.csv.absentDays")},${t(
      "pages.hrDashboard.csv.lateRate"
    )}\n`;

    employeeReport.forEach((emp) => {
      csv += `"${emp.name}",${emp.presentCount},${emp.lateCount},${emp.leaveCount},${emp.absentCount},${emp.lateRate}%\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `performance_report_${rangeStart}_to_${rangeEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const openDailyDetail = async (dateStr) => {
    try {
      setLoading(true);
      const res = await axiosClient.get(`/timerecord/daily-detail?date=${dateStr}`);
      const isSpecial = specialHolidays.includes(dateStr);
      const updatedData = {
        ...res.data.data,
        isSpecialHoliday: isSpecial,
      };
      setDailyData(updatedData);
      setSelectedDate(dateStr);
      setDailyModalOpen(true);
    } catch (err) {
      alertError(t("common.error"), t("pages.hrDashboard.unableToLoadData"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeReport.length > 0) fetchReport(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPageSize]);

  useEffect(() => {
    fetchCalendarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth]);

  useEffect(() => {
    fetchDailyRecords();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const dayRecords = useMemo(() => {
    const att = attendanceRecords.map((r) => ({
      id: `att-${r.recordId}`,
      name: `${r.employee.firstName} ${r.employee.lastName}`,
      role: r.employee.role,
      checkIn: r.checkInTime ? moment(r.checkInTime).format("HH:mm") : "--:--",
      checkOut: r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "--:--",
      statusKey: r.isLate ? "late" : "onTime",
      statusText: r.isLate ? t("common.status.late") : t("common.status.onTime"),
    }));

    const leave = leaveRequests.map((l) => ({
      id: `leave-${l.requestId}`,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      role: l.employee.role,
      checkIn: "--:--",
      checkOut: "--:--",
      statusKey: "leave",
      statusText: t("common.leaveWithType", { type: l.leaveType?.typeName || t("common.leave") }),
    }));

    return [...att, ...leave];
  }, [attendanceRecords, leaveRequests, t]);

  const TAB_META = [
    { key: "overview", label: t("pages.hrDashboard.tabs.overview") },
    { key: "reports", label: t("pages.hrDashboard.tabs.performanceReports") },
    { key: "audit", label: t("pages.hrDashboard.tabs.auditLog") },
  ];

  const WEEKDAYS = [
    t("common.daysShort.sun"),
    t("common.daysShort.mon"),
    t("common.daysShort.tue"),
    t("common.daysShort.wed"),
    t("common.daysShort.thu"),
    t("common.daysShort.fri"),
    t("common.daysShort.sat"),
  ];

  return (
    <div className="page-card hr-dashboard">
      <header className="hr-header">
        <div>
          <h1 className="hr-title">{t("pages.hrDashboard.Management Dashboard")}</h1>
          <p className="hr-subtitle">
            {t("pages.hrDashboard.Oversee employee attendance, leaves and company holidays")}
          </p>
        </div>

        <div className="hr-header-right">
          <div className="pill date-pill">
            <FiCalendar />
            {t("pages.hrDashboard.selectedDateLabel")}: {moment(selectedDate).format("DD MMM YYYY")}
          </div>
        </div>
      </header>

      <div className="hr-tabs">
        {TAB_META.map((x) => (
          <button
            key={x.key}
            className={`btn small ${tab === x.key ? "primary" : "outline"}`}
            onClick={() => setTab(x.key)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <section className="dashboard-section calendar-section">
            <div className="calendar-top">
              <div className="calendar-title-group">
                <button className="nav-btn" onClick={() => setViewMonth((p) => (p === 0 ? 11 : p - 1))} aria-label={t("common.previous")}>
                  ‹
                </button>
                <h2 className="month-label">{moment(new Date(viewYear, viewMonth, 1)).format("MMMM YYYY")}</h2>
                <button className="nav-btn" onClick={() => setViewMonth((p) => (p === 11 ? 0 : p + 1))} aria-label={t("common.next")}>
                  ›
                </button>
              </div>

              <button className="btn outline small today-btn" onClick={() => setSelectedDate(todayStr)}>
                {t("pages.hrDashboard.goToToday")}
              </button>
            </div>

            <div className="calendar">
              <div className="calendar-head">
                {WEEKDAYS.map((d) => (
                  <div className="cal-cell head" key={d}>
                    {d}
                  </div>
                ))}
              </div>

              <div className="calendar-body">
                {weeks.map((week, wIdx) => (
                  <React.Fragment key={wIdx}>
                    {week.map((d) => {
                      const iso = toISODate(d);
                      const items = monthLeaveMap[iso] || [];

                      const dayOfWeek = d.getDay();
                      const isWorkingDay = workingDays.includes(dayOfWeek);

                      let cellClass = "cal-cell";
                      if (d.getMonth() !== viewMonth) cellClass += " muted";
                      if (!isWorkingDay) cellClass += " non-working";
                      if (iso === selectedDate) cellClass += " selected";

                      return (
                        <div key={iso} className={cellClass} onClick={() => openDailyDetail(iso)}>
                          <div className="cal-date-row">
                            <span className="cal-date">{d.getDate()}</span>
                            {items.length > 2 && <span className="more-count-badge">+{items.length - 2}</span>}
                          </div>

                          <div className="cal-leave-list">
                            {items.slice(0, 2).map((x, i) => (
                              <div
                                key={i}
                                className={`leave-pill ${x.isHoliday ? "holiday-pill" : ""}`}
                                style={{
                                  backgroundColor: x.colorCode,
                                  color: "#fff",
                                  textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                                  fontWeight: x.isHoliday ? "700" : "400",
                                }}
                                title={
                                  x.isHoliday
                                    ? t("pages.hrDashboard.companyHoliday")
                                    : `${x.name} - ${x.typeName}`
                                }
                              >
                                {x.isHoliday ? t("pages.hrDashboard.holidayShort") : x.name}
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
              <h3>{t("pages.hrDashboard.Daily Attendance Records")}</h3>
              <button className="btn outline small" onClick={fetchDailyRecords} disabled={loading}>
                <FiRefreshCw className={loading ? "spin" : ""} />
                {t("pages.hrDashboard.Refresh")}
              </button>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("pages.hrDashboard.Employee")}</th>
                    <th>{t("pages.hrDashboard.Role")}</th>
                    <th>{t("pages.hrDashboard.In")}</th>
                    <th>{t("pages.hrDashboard.Out")}</th>
                    <th>{t("pages.hrDashboard.Status")}</th>
                  </tr>
                </thead>

                <tbody>
                  {dayRecords.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty">
                        {t("pages.hrDashboard.noRecordsForDate")}
                      </td>
                    </tr>
                  ) : (
                    dayRecords
                      .slice((page - 1) * pageSize, page * pageSize)
                      .map((r) => (
                        <tr key={r.id}>
                          <td className="fw-500">{r.name}</td>
                          <td className="text-muted">{r.role}</td>
                          <td>{r.checkIn}</td>
                          <td>{r.checkOut}</td>
                          <td>
                            <span
                              className={`badge ${
                                r.statusKey === "leave"
                                  ? "badge-leave"
                                  : r.statusKey === "late"
                                  ? "badge-late"
                                  : "badge-ok"
                              }`}
                            >
                              {r.statusText}
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Pagination
                total={dayRecords.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </section>
        </>
      )}

      {tab === "reports" && (
        <section className="dashboard-section">
          <div className="section-header reports-header">
            <div>
              <h3>{t("pages.hrDashboard.HR Analytics")}</h3>
              <p>{t("pages.hrDashboard.Detailed performance and attendance trends")}</p>
            </div>

            <div className="reports-controls">
              <div className="input-group">
                <label>{t("pages.hrDashboard.Start:")}</label>
                <input
                  type="date"
                  value={rangeStart}
                  max={todayStr}
                  onChange={(e) => {
                    setRangeStart(e.target.value);
                    setRangeEnd(moment(e.target.value).endOf("month").format("YYYY-MM-DD"));
                  }}
                />
              </div>

              <div className="input-group">
                <label>{t("pages.hrDashboard.End:")}</label>
                <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
              </div>

              <button className="btn primary small" onClick={() => fetchReport(1)} disabled={loading}>
                {t("pages.hrDashboard.Run Report")}
              </button>

              <button className="btn outline small" onClick={handleExportPerformance} disabled={employeeReport.length === 0}>
                <FiSave />
                {t("pages.hrDashboard.Export CSV")}
              </button>
            </div>
          </div>

          <div className="stats-grid">
            <Card title={t("pages.hrDashboard.Present")} value={reportSummary.present} tone="green" icon={<FiCheckCircle />} />
            <Card title={t("pages.hrDashboard.On Leave")} value={reportSummary.leave} tone="blue" icon={<FiFileText />} />
            <Card title={t("pages.hrDashboard.Late")} value={reportSummary.late} tone="red" icon={<FiClock />} />
            <Card title={t("pages.hrDashboard.Absent")} value={reportSummary.absent} tone="gray" icon={<FiXCircle />} />
            <Card title={t("pages.hrDashboard.Late Rate")} value={`${reportSummary.lateRate}%`} tone="amber" icon={<FiTrendingUp />} />
          </div>

          <div className="table-wrap" style={{ marginTop: 25 }}>
            <div className="table-header-title">{t("pages.hrDashboard.Employee Performance Summary")}</div>

            <table className="table">
              <thead>
                <tr>
                  <th>{t("pages.hrDashboard.Employee")}</th>
                  <th className="text-center">{t("pages.hrDashboard.Days Present")}</th>
                  <th className="text-center">{t("pages.hrDashboard.Times Late")}</th>
                  <th className="text-center">{t("pages.hrDashboard.Days Leave")}</th>
                  <th className="text-center">{t("pages.hrDashboard.Days Absent")}</th>
                  <th className="text-center">{t("pages.hrDashboard.Rate")}</th>
                </tr>
              </thead>

              <tbody>
                {employeeReport.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty">
                      {t("pages.hrDashboard.clickRunReportHint")}
                    </td>
                  </tr>
                ) : (
                  employeeReport.map((emp) => (
                    <tr key={emp.employeeId}>
                      <td>
                        <strong>{emp.name}</strong>
                      </td>
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

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <Pagination
              total={reportPagination.total}
              page={reportPage}
              pageSize={reportPageSize}
              onPageChange={fetchReport}
              onPageSizeChange={setReportPageSize}
            />
          </div>

          <div className="charts-container">
            <div className="report-card">
              <h5 className="card-title">{t("pages.hrDashboard.topPerformance")}</h5>
              <div className="perfect-list">
                {perfectEmployees.length > 0 ? (
                  perfectEmployees.map((emp) => (
                    <div key={emp.employeeId} className="perfect-item">
                      <span className="fw-500">{emp.name}</span>
                      <span className="badge badge-ok">{t("pages.hrDashboard.excellent")}</span>
                    </div>
                  ))
                ) : (
                  <p className="empty-msg">{t("common.noDataAvailable")}</p>
                )}
              </div>
            </div>

            <div className="report-card">
              <h5 className="card-title">{t("pages.hrDashboard.leaveDistribution")}</h5>
              <div className="chart-box">
                {leaveChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={leaveChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {leaveChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || "#3b82f6"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="empty-msg">{t("pages.hrDashboard.noLeaveDataFound")}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "audit" && <AuditLogPanel />}

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
        <div className="stat-label" style={{ color: p.fg }}>
          {title}
        </div>
        <div className="stat-value" style={{ color: p.fg }}>
          {value}
        </div>
      </div>
      <div className="stat-icon" style={{ color: p.border }}>
        {icon}
      </div>
    </div>
  );
}
