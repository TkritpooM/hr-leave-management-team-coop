// src/pages/WorkerDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import axiosClient from "../api/axiosClient";
import { useNavigate } from "react-router-dom";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import "./WorkerDashboard.css";
import { alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

// Helper Functions
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// 🔥 Helper แปลงวันทำงานจาก "mon,tue" -> [1, 2]
const parseWorkingDays = (str) => {
  if (!str) return [1, 2, 3, 4, 5]; // Default Mon-Fri
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

// Component: Leave quota card
function QuotaCard({ title, usedDays, totalDays, carriedOverDays }) {
  const { t } = useTranslation();

  const used = num(usedDays);
  const currentTotal = num(totalDays);
  const carried = num(carriedOverDays);

  const totalEffective = currentTotal + carried;
  const remaining = Math.max(0, totalEffective - used);
  const percent =
    totalEffective > 0 ? clamp((used / totalEffective) * 100, 0, 100) : 0;

  return (
    <div className="quota-card">
      <div className="quota-top">
        <div className="quota-title-group">
          <h4 className="quota-title">{title}</h4>
          {carried > 0 && (
            <span className="carried-badge">
              {t("pages.hrAttendancePage.carriedOverBadge", "+{{days}} Carried Over", {
                days: carried,
              })}
            </span>
          )}
        </div>
        <span className="quota-chip">{Math.round(percent)}%</span>
      </div>

      <div className="quota-metrics">
        <div className="qm">
          <div className="qm-label">{t("pages.workerDashboard.Used")}</div>
          <div className="qm-value">{used}</div>
        </div>

        <div className="qm highlight">
          <div className="qm-label">{t("pages.workerDashboard.Available")}</div>
          <div className="qm-value">{totalEffective}</div>
        </div>

        <div className="qm success">
          <div className="qm-label">{t("pages.workerDashboard.Remaining")}</div>
          <div className="qm-value">{remaining}</div>
        </div>
      </div>

      <div className="quota-bar">
        <div className="quota-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function WorkerDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });

  // Leave Modal & Preview States
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
  });

  // 🔥 State สำหรับเก็บวันทำงาน (Array ตัวเลข) และวันหยุดพิเศษ
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [specialHolidays, setSpecialHolidays] = useState([]);

  // 1) Fetch attendance & Policy
  const fetchDashboardData = async () => {
    try {
      const [attRes, policyRes] = await Promise.all([
        axiosClient.get("/timerecord/my"),
        axiosClient.get("/admin/attendance-policy"),
      ]);

      // Handle Attendance
      const records = attRes.data.records || [];
      setHistory(records);

      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = records.find(
        (r) => r.workDate && r.workDate.startsWith(todayStr)
      );
      if (todayRecord) {
        if (todayRecord.checkInTime)
          setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime)
          setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }

      // Handle Policy (แปลงวันทำงาน)
      if (policyRes.data.policy?.workingDays) {
        setWorkingDays(parseWorkingDays(policyRes.data.policy.workingDays));
      }
      setSpecialHolidays(policyRes.data.policy?.specialHolidays || []);
    } catch (err) {
      console.error(err);
    }
  };

  // 2) Fetch quotas
  const fetchQuotaData = async () => {
    try {
      const response = await axiosClient.get("/leave/quota/my");
      const qs = response.data.quotas || [];
      setQuotas(qs);
      if (qs.length > 0 && !leaveForm.leaveTypeId) {
        setLeaveForm((prev) => ({ ...prev, leaveTypeId: qs[0].leaveTypeId }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 3) Fetch late summary
  const fetchLateSummary = async () => {
    try {
      const response = await axiosClient.get("/timerecord/late/summary");
      setLateSummary({
        lateCount: response.data.lateCount,
        lateLimit: response.data.lateLimit,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // 4) Preview Calculation
  useEffect(() => {
    if (
      leaveForm.startDate &&
      leaveForm.endDate &&
      leaveForm.startDate <= leaveForm.endDate
    ) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await axiosClient.get("/leave/calculate-days", {
            params: {
              startDate: leaveForm.startDate,
              endDate: leaveForm.endDate,
              startDuration: "Full",
              endDuration: "Full",
            },
          });
          setPreviewDays(res.data.totalDays || 0);
        } catch (err) {
          setPreviewDays(0);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPreviewDays(0);
    }
  }, [leaveForm.startDate, leaveForm.endDate]);

  useEffect(() => {
    fetchDashboardData();
    fetchQuotaData();
    fetchLateSummary();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handlers
  const handleCheckIn = async () => {
    try {
      await axiosClient.post("/timerecord/check-in", {});
      await alertSuccess(
        t("pages.hrAttendancePage.alert.successTitle", "Success"),
        t("pages.hrAttendancePage.alert.checkInSuccess", "Check-in successful")
      );
      fetchDashboardData();
      fetchLateSummary();
    } catch (err) {
      alertError(
        t("pages.hrAttendancePage.alert.failedTitle", "Failed"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.checkInFailedTitle", "Check-in failed")
      );
    }
  };

  const handleCheckOut = async () => {
    try {
      await axiosClient.post("/timerecord/check-out", {});
      await alertSuccess(
        t("pages.hrAttendancePage.alert.successTitle", "Success"),
        t("pages.hrAttendancePage.alert.checkOutSuccess", "Check-out successful")
      );
      fetchDashboardData();
    } catch (err) {
      alertError(
        t("pages.hrAttendancePage.alert.failedTitle", "Failed"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.checkOutFailedTitle", "Check-out failed")
      );
    }
  };

  const toISODate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "startDate") {
        if (prev.endDate && value > prev.endDate) newState.endDate = value;
        if (!prev.endDate) newState.endDate = value;
      }
      if (name === "endDate") {
        if (prev.startDate && value < prev.startDate)
          newState.endDate = prev.startDate;
      }
      return newState;
    });
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("leaveTypeId", parseInt(leaveForm.leaveTypeId, 10));
      formData.append("startDate", leaveForm.startDate);
      formData.append("endDate", leaveForm.endDate);
      formData.append("reason", leaveForm.detail);
      if (selectedFile) formData.append("attachment", selectedFile);

      const res = await axiosClient.post("/leave/request", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        await alertSuccess(
          t("pages.hrAttendancePage.alert.successTitle", "Success"),
          t("pages.hrAttendancePage.alert.leaveSubmitSuccess", "Leave request submitted successfully.")
        );
        setIsLeaveModalOpen(false);
        setSelectedFile(null);
        setPreviewDays(0);
        setLeaveForm({
          leaveTypeId: quotas[0]?.leaveTypeId || "",
          startDate: "",
          endDate: "",
          detail: "",
        });
        fetchQuotaData();
      } else {
        await alertInfo(
          t("common.ok", "OK"),
          res.data.message ||
            t("pages.hrAttendancePage.alert.somethingWentWrong", "Something went wrong")
        );
      }
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.somethingWentWrong", "Something went wrong")
      );
    }
  };

  const formatTime = (d) =>
    d
      ? new Date(d).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  const formatDate = (s) =>
    s
      ? new Date(s).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  // 🔥 Helper Function: เช็คว่าเป็นวันทำงานหรือไม่ (ใช้ใน DatePicker filterDate)
  const isWorkingDate = (date) => {
    const day = date.getDay(); // 0-6
    const dateStr = toISODate(date);

    const isWorkDay = workingDays.includes(day);
    const isSpecialHoliday = specialHolidays.includes(dateStr);

    return isWorkDay && !isSpecialHoliday;
  };

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const recentHistory = useMemo(() => history.slice(0, 7), [history]);

  const nowText = now.toLocaleString(i18n.language === "th" ? "th-TH" : "en-GB", {
    hour12: false,
    timeZone: "Asia/Bangkok",
  });

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">
            {t("pages.workerDashboard.hello", "Hello")},{" "}
            {user.firstName || t("pages.workerDashboard.workerFallback", "Worker")}
          </h1>
          <p className="worker-datetime">{nowText}</p>
        </div>
        <div className="clock-box">
          <FiClock /> {formatTime(now)}
        </div>
      </header>

      <div className="late-warning">
        <span>
          {t("pages.workerDashboard.lateThisMonthLabel", "Late this month:")}{" "}
          <strong>
            {lateSummary.lateCount} / {lateSummary.lateLimit}
          </strong>{" "}
          {t("pages.workerDashboard.timesSuffix", "times")}
        </span>
      </div>

      <section className="action-row">
        <div className="action-card">
          <h3>{t("pages.workerDashboard.Check In")}</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button
            className="btn-checkin"
            onClick={handleCheckIn}
            disabled={!!checkedInAt}
          >
            {checkedInAt
              ? t("pages.workerDashboard.checkedIn", "Checked in")
              : t("pages.workerDashboard.Check In")}
          </button>
        </div>

        <div className="action-card">
          <h3>{t("pages.workerDashboard.Check Out")}</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>
          <button
            className="btn-checkout"
            onClick={handleCheckOut}
            disabled={!checkedInAt || !!checkedOutAt}
          >
            {checkedOutAt
              ? t("pages.workerDashboard.checkedOut", "Checked out")
              : t("pages.workerDashboard.Check Out")}
          </button>
        </div>

        <div className="action-card">
          <h3>{t("pages.workerDashboard.Leave")}</h3>
          <p className="action-time">{t("pages.workerDashboard.Leave Request")}</p>
          <button
            className="btn-leave"
            onClick={() => setIsLeaveModalOpen(true)}
          >
            <FiPlusCircle />
            {t("pages.workerDashboard.Create Leave Request")}
          </button>
        </div>
      </section>

      <h2 className="section-subtitle">
        {t("pages.workerDashboard.Your Leave Entitlements (including carried over days)")}
      </h2>

      <section className="quota-grid">
        {quotas.map((q) => (
          <QuotaCard
            key={q.quotaId}
            title={q.leaveType?.typeName}
            usedDays={q.usedDays}
            totalDays={q.totalDays}
            carriedOverDays={q.carriedOverDays}
          />
        ))}
      </section>

      <section className="history-section">
        <div className="history-head">
          <h2>{t("pages.workerDashboard.Attendance History (Recent)")}</h2>
          <button
            className="history-link"
            onClick={() => navigate("/worker/attendance")}
          >
            {t("pages.workerDashboard.viewAll", "View all")}
          </button>
        </div>

        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>{t("pages.workerDashboard.Date")}</th>
                <th>{t("pages.workerDashboard.Check In")}</th>
                <th>{t("pages.workerDashboard.Check Out")}</th>
                <th>{t("pages.workerDashboard.Status")}</th>
              </tr>
            </thead>
            <tbody>
              {recentHistory.map((row) => (
                <tr key={row.recordId}>
                  <td>{formatDate(row.workDate)}</td>
                  <td>{formatTime(row.checkInTime)}</td>
                  <td>{formatTime(row.checkOutTime)}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        row.isLate ? "status-late" : "status-ok"
                      }`}
                    >
                      {row.isLate
                        ? t("common.status.late", "Late")
                        : t("common.status.onTime", "On time")}
                    </span>
                  </td>
                </tr>
              ))}

              {recentHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      padding: "18px",
                      opacity: 0.7,
                    }}
                  >
                    {t("pages.workerDashboard.noAttendanceRecordsFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Leave Modal */}
      {isLeaveModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsLeaveModalOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head-row">
              <h3>{t("pages.workerDashboard.Create Leave Request")}</h3>
              <button
                className="close-x"
                onClick={() => setIsLeaveModalOpen(false)}
                aria-label={t("common.close", "Close")}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>{t("pages.workerDashboard.Leave Type")}</label>
              <select
                name="leaveTypeId"
                value={leaveForm.leaveTypeId}
                onChange={handleLeaveChange}
                required
              >
                {quotas.map((q) => {
                  const remaining =
                    num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays);

                  return (
                    <option key={q.leaveTypeId} value={q.leaveTypeId}>
                      {q.leaveType?.typeName}{" "}
                      {t(
                        "pages.workerDashboard.remainingInOption",
                        "(Remaining: {{remaining}} days)",
                        { remaining }
                      )}
                    </option>
                  );
                })}
              </select>

              <div className="date-row">
                <label>
                  {t("pages.workerDashboard.startDate", "Start date")}
                  <DatePicker
                    selected={
                      leaveForm.startDate ? new Date(leaveForm.startDate) : null
                    }
                    onChange={(date) => {
                      const dStr = toISODate(date);
                      handleLeaveChange({
                        target: { name: "startDate", value: dStr },
                      });
                    }}
                    minDate={new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={enUS}
                    placeholderText={t("pages.hrAttendancePage.datePlaceholder", "YYYY-MM-DD")}
                    className="wa-datepicker-input"
                    required
                  />
                </label>

                <label>
                  {t("pages.workerDashboard.endDate", "End date")}
                  <DatePicker
                    selected={leaveForm.endDate ? new Date(leaveForm.endDate) : null}
                    onChange={(date) => {
                      const dStr = toISODate(date);
                      handleLeaveChange({
                        target: { name: "endDate", value: dStr },
                      });
                    }}
                    minDate={
                      leaveForm.startDate
                        ? new Date(leaveForm.startDate)
                        : new Date()
                    }
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={enUS}
                    placeholderText={t("pages.hrAttendancePage.datePlaceholder", "YYYY-MM-DD")}
                    className="wa-datepicker-input"
                    required
                  />
                </label>
              </div>

              {leaveForm.startDate &&
                leaveForm.endDate &&
                leaveForm.startDate <= leaveForm.endDate && (
                  <div className="leave-preview-info">
                    <div className="preview-main">
                      <FiCalendar />{" "}
                      <span>
                        {t(
                          "pages.workerDashboard.daysToDeductFromQuota",
                          "Days to deduct from quota:"
                        )}{" "}
                        <strong>
                          {previewDays}{" "}
                          {t("pages.workerDashboard.daySuffix", "days")}
                        </strong>
                      </span>
                    </div>
                    <p className="mini-note">
                      {t("pages.workerDashboard.weekendsExcludedNote")}
                    </p>
                  </div>
                )}

              <label className="full">
                {t("pages.workerDashboard.reasonLabel", "Reason")}
                <textarea
                  name="detail"
                  rows="3"
                  value={leaveForm.detail}
                  onChange={handleLeaveChange}
                  placeholder={t("common.placeholders.enterReason")}
                />
              </label>

              <label className="full">
                <span className="field-label">
                  {t("pages.workerDashboard.ATTACHMENT (OPTIONAL)")}
                </span>
                <div className="file-upload">
                  <input
                    type="file"
                    id="attachment"
                    hidden
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                  />
                  <label htmlFor="attachment" className="file-upload-btn">
                    {t("pages.workerDashboard.Choose file")}
                  </label>
                  <span
                    className={`file-upload-name ${
                      selectedFile ? "active" : ""
                    }`}
                  >
                    {selectedFile
                      ? selectedFile.name
                      : t(
                          "pages.workerDashboard.noFileSelected",
                          "No file selected"
                        )}
                  </span>
                </div>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setIsLeaveModalOpen(false)}
                >
                  {t("pages.workerDashboard.cancel", "Cancel")}
                </button>
                <button type="submit" className="primary-btn">
                  {t("pages.workerDashboard.Submit Request")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
