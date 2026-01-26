// src/pages/HRAttendancePage.jsx
import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import "./HRAttendancePage.css";
import moment from "moment";
import "moment/locale/th";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS, th as thLocale } from "date-fns/locale";
import { useTranslation } from "react-i18next";

// Helper Functions
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
const normStatus = (s) => String(s || "").trim().toLowerCase();

const parseWorkingDays = (str) => {
  if (str === null || str === undefined) return [1, 2, 3, 4, 5];
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

// ✅ Normalize i18n meta from backend (prevent {{var}} not replaced)
const normalizeI18nMeta = (raw = {}) => {
  const pendingDays = raw.pendingDays ?? raw.pending ?? raw.pending_days ?? raw.pendingDay ?? raw.pending_day;
  const available = raw.available ?? raw.remaining ?? raw.availableDays ?? raw.available_days ?? raw.remainingDays ?? raw.remaining_days;
  const requestedDays = raw.requestedDays ?? raw.requested ?? raw.request_days ?? raw.requested_days;

  return {
    ...raw,
    pendingDays: pendingDays !== undefined ? num(pendingDays) : undefined,
    available: available !== undefined ? num(available) : undefined,
    requestedDays: requestedDays !== undefined ? num(requestedDays) : undefined,
  };
};

// ✅ Translate backend message (key or plain text)
const translateApiMessage = (t, msgKeyOrText, rawMeta) => {
  if (!msgKeyOrText) return "";
  const meta = normalizeI18nMeta(rawMeta || {});
  return t(msgKeyOrText, { ...meta, defaultValue: msgKeyOrText });
};

function QuotaCard({ title, usedDays, totalDays, carriedOverDays, t }) {
  const used = num(usedDays);
  const currentTotal = num(totalDays);
  const carried = num(carriedOverDays);
  const totalEffective = currentTotal + carried;
  const remaining = Math.max(0, totalEffective - used);
  const percent = totalEffective > 0 ? clamp((used / totalEffective) * 100, 0, 100) : 0;

  return (
    <div className="quota-card">
      <div className="quota-top">
        <div className="quota-title-group" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h4 className="quota-title">{title}</h4>
          {carried > 0 && (
            <span
              className="carried-badge"
              style={{
                background: "#ecfdf5",
                color: "#10b981",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
                fontWeight: "800",
                border: "1px solid #d1fae5",
                width: "fit-content",
              }}
            >
              {t("pages.hrAttendancePage.carriedOverBadge", { days: carried, defaultValue: `+${carried} Carried Over` })}
            </span>
          )}
        </div>
        <span className="quota-chip">{Math.round(percent)}%</span>
      </div>

      <div className="quota-metrics">
        <div className="qm">
          <div className="qm-label">{t("pages.hrAttendancePage.used")}</div>
          <div className="qm-value">{used}</div>
        </div>

        <div className="qm highlight" style={{ background: "rgba(30, 64, 175, 0.05)" }}>
          <div className="qm-label">{t("pages.hrAttendancePage.available")}</div>
          <div className="qm-value">{totalEffective}</div>
        </div>

        <div className="qm success" style={{ background: "rgba(22, 163, 74, 0.05)" }}>
          <div className="qm-label">{t("pages.hrAttendancePage.remaining")}</div>
          <div className="qm-value">{remaining}</div>
        </div>
      </div>

      <div className="quota-bar">
        <div className="quota-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function HRAttendancePage() {
  const { t, i18n } = useTranslation();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  const uiLocale = mLocale === "th" ? "th-TH" : "en-GB";
  const datePickerLocale = mLocale === "th" ? thLocale : enUS;

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });
  const [policy, setPolicy] = useState({ endTime: "18:00" });
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [specialHolidays, setSpecialHolidays] = useState([]);
  const todayStr = moment().format("YYYY-MM-DD");
  const [isHalfDayAfternoon, setIsHalfDayAfternoon] = useState(false);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
    startDuration: "Full",
    endDuration: "Full",
  });

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

  const fetchData = async () => {
    try {
      const header = getAuthHeader();

      // 1. Policy
      try {
        const pRes = await axios.get("http://localhost:8000/api/admin/attendance-policy", header);
        if (pRes.data.policy) {
          setPolicy(pRes.data.policy);
          if (pRes.data.policy.workingDays !== undefined)
            setWorkingDays(parseWorkingDays(pRes.data.policy.workingDays));
          setSpecialHolidays(pRes.data.policy.specialHolidays || []);
        }
      } catch (err) {
        console.error("Policy fetch error:", err);
      }

      // 2. Attendance
      try {
        const attRes = await axios.get("http://localhost:8000/api/timerecord/my", header);
        const records = attRes.data.records || [];
        setHistory(records);

        const todayRecord = records.find((r) => {
          if (!r.workDate) return false;
          return moment(r.workDate).isSame(moment(), "day");
        });

        if (todayRecord) {
          if (todayRecord.checkInTime) setCheckedInAt(todayRecord.checkInTime);
          if (todayRecord.checkOutTime) setCheckedOutAt(todayRecord.checkOutTime);
        }
      } catch (err) {
        console.error("Attendance fetch error:", err);
      }

      // 3. Leaves & Quotas
      try {
        const [leaveRes, qRes] = await Promise.all([
          axios.get("http://localhost:8000/api/leave/my", header),
          axios.get("http://localhost:8000/api/leave/quota/my", header)
        ]);

        const requests = leaveRes.data.requests || [];
        setLeaveHistory(requests);

        const hasHalfDayAfternoon = requests.some(
          (req) =>
            req.status === "Approved" &&
            moment(req.startDate).isSameOrBefore(moment(), "day") &&
            moment(req.endDate).isSameOrAfter(moment(), "day") &&
            ((moment(req.endDate).isSame(moment(), "day") && req.endDuration === "HalfAfternoon") ||
              (moment(req.startDate).isSame(moment(), "day") &&
                req.startDuration === "HalfAfternoon" &&
                moment(req.startDate).isSame(req.endDate, "day")))
        );
        setIsHalfDayAfternoon(hasHalfDayAfternoon);

        const qs = qRes.data.quotas || [];
        setQuotas(qs);
        if (qs.length > 0 && !leaveForm.leaveTypeId) {
          setLeaveForm((prev) => ({ ...prev, leaveTypeId: qs[0].leaveTypeId.toString() }));
        }
      } catch (err) {
        console.error("Leave/Quota fetch error:", err);
      }

      // 4. Late Summary
      try {
        const lateRes = await axios.get("http://localhost:8000/api/timerecord/late/summary", header);
        setLateSummary({ lateCount: lateRes.data.lateCount, lateLimit: lateRes.data.lateLimit });
      } catch (err) {
        console.error("Late summary fetch error:", err);
      }

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (leaveForm.startDate && leaveForm.endDate) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await axios.get("http://localhost:8000/api/leave/calculate-days", {
            params: {
              startDate: leaveForm.startDate,
              endDate: leaveForm.endDate,
              startDuration: leaveForm.startDuration,
              endDuration: leaveForm.endDuration,
            },
            ...getAuthHeader(),
          });
          setPreviewDays(res.data.totalDays || 0);
        } catch {
          setPreviewDays(0);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPreviewDays(0);
    }
  }, [leaveForm.startDate, leaveForm.endDate, leaveForm.startDuration, leaveForm.endDuration]);

  const handleAttendance = async (type) => {
    if (type === "out") {
      if (!policy?.endTime || !policy?.breakStartTime) return;
      const targetTimeStr = isHalfDayAfternoon ? policy.breakStartTime : policy.endTime;
      const [h, m] = targetTimeStr.split(":").map(Number);
      if (moment().isBefore(moment().hour(h).minute(m).second(0))) {
        return alertError(
          t("pages.hrAttendancePage.alert.notTimeCheckOutTitle"),
          t("pages.hrAttendancePage.alert.policyCheckOutFrom", { time: targetTimeStr })
        );
      }
    }

    try {
      await axios.post(`http://localhost:8000/api/timerecord/check-${type}`, {}, getAuthHeader());
      await alertSuccess(
        t("pages.hrAttendancePage.alert.successTitle"),
        t(`pages.hrAttendancePage.alert.check${type === "in" ? "In" : "Out"}Success`)
      );
      fetchData();
    } catch (err) {
      const msgKeyOrText = err.response?.data?.message;
      const meta = err.response?.data?.meta || err.response?.data?.data || {};
      const msg = msgKeyOrText ? translateApiMessage(t, msgKeyOrText, meta) : t("pages.hrAttendancePage.alert.somethingWentWrong");

      alertError(t(`pages.hrAttendancePage.alert.check${type === "in" ? "In" : "Out"}FailedTitle`), msg);
    }
  };

  const handleCancelLeave = async (id) => {
    const ok = await alertConfirm(
      t("pages.hrAttendancePage.alert.confirmCancelTitle"),
      t("pages.hrAttendancePage.alert.confirmCancelMsg"),
      t("common.confirm")
    );
    if (!ok) return;

    try {
      const res = await axios.patch(`http://localhost:8000/api/leave/${id}/cancel`, {}, getAuthHeader());
      if (res.data.success) {
        await alertSuccess(t("pages.hrAttendancePage.alert.successTitle"), t("pages.hrAttendancePage.alert.cancelLeaveSuccess"));
        fetchData();
      }
    } catch {
      alertError(t("common.error"), t("pages.hrAttendancePage.alert.connectServerFailed"));
    }
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "startDate") {
        if (!prev.endDate || value > prev.endDate) newState.endDate = value;
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
      formData.append("startDuration", leaveForm.startDuration);
      formData.append("endDuration", leaveForm.endDuration);
      formData.append("reason", leaveForm.detail);
      if (selectedFile) formData.append("attachment", selectedFile);

      const res = await axios.post("http://localhost:8000/api/leave/request", formData, {
        headers: { ...getAuthHeader().headers, "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        await alertSuccess(t("pages.hrAttendancePage.alert.successTitle"), t("pages.hrAttendancePage.alert.leaveSubmitSuccess"));
        setIsLeaveModalOpen(false);
        setLeaveForm({
          leaveTypeId: quotas[0]?.leaveTypeId.toString() || "",
          startDate: "",
          endDate: "",
          detail: "",
          startDuration: "Full",
          endDuration: "Full",
        });
        setSelectedFile(null);
        fetchData();
      } else {
        const msgKeyOrText = res.data?.message;
        const meta = res.data?.meta || res.data?.data || {};
        const msg = msgKeyOrText ? translateApiMessage(t, msgKeyOrText, meta) : t("pages.hrAttendancePage.alert.somethingWentWrong");
        alertInfo(t("pages.hrAttendancePage.alert.failedTitle"), msg);
      }
    } catch (err) {
      const msgKeyOrText = err.response?.data?.message;
      const meta = err.response?.data?.meta || err.response?.data?.data || {};
      const msg = msgKeyOrText ? translateApiMessage(t, msgKeyOrText, meta) : t("pages.hrAttendancePage.alert.somethingWentWrong");
      alertError(t("common.error"), msg);
    }
  };

  // ✅ Use moment for robust formatting
  const formatTime = (d) => {
    if (!d) return "--:--";
    const m = moment(d);
    return m.isValid() ? m.format("HH:mm") : "--:--";
  };
  const formatDate = (s) =>
    s ? moment(s).format("DD MMM YYYY") : "-";

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const isBeforeEndTime = useMemo(() => {
    if (!policy?.endTime || !policy?.breakStartTime) return false;
    const targetTimeStr = isHalfDayAfternoon ? policy.breakStartTime : policy.endTime;
    const [h, m] = targetTimeStr.split(":").map(Number);
    const targetMoment = moment().hour(h).minute(m).second(0);
    return moment().isBefore(targetMoment);
  }, [policy, isHalfDayAfternoon]);

  const isWorkingDate = (date) => {
    const day = date.getDay();
    const dateStr = moment(date).format("YYYY-MM-DD");
    return workingDays.includes(day) && !specialHolidays.includes(dateStr);
  };

  const isFullDayLeave = useMemo(() => {
    if (!todayStr || !leaveHistory) return false;
    return leaveHistory.some(
      (req) =>
        req.status === "Approved" &&
        moment(req.startDate).isSameOrBefore(todayStr, "day") &&
        moment(req.endDate).isSameOrAfter(todayStr, "day") &&
        (req.startDuration === "Full" || (req.startDuration === "HalfMorning" && req.endDuration === "HalfAfternoon"))
    );
  }, [leaveHistory, todayStr]);

  const isTodaySpecialHoliday = useMemo(() => {
    return specialHolidays.includes(todayStr);
  }, [specialHolidays, todayStr]);

  const isAfterWorkHours = useMemo(() => {
    if (!policy?.endTime) return false;
    const [h, m] = policy.endTime.split(":").map(Number);
    const endMoment = moment().hour(h).minute(m).second(0);
    return moment().isAfter(endMoment);
  }, [policy.endTime]);

  const isTooEarly = useMemo(() => {
    if (!policy?.startTime) return false;
    const startTimeMoment = moment(`${todayStr} ${policy.startTime}`, "YYYY-MM-DD HH:mm");
    const earliestAllowed = startTimeMoment.clone().subtract(4, "hours");
    return moment(now).isBefore(earliestAllowed);
  }, [now, policy.startTime]);

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">
            {t("pages.hrAttendancePage.hello")}, {user.firstName || t("pages.hrAttendancePage.hrFallback")}
          </h1>
          <p className="worker-datetime">
            {now.toLocaleString(uiLocale, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
        </div>
      </header>

      <div className="late-warning">
        <span>
          {t("pages.hrAttendancePage.lateThisMonth")} <strong>{lateSummary.lateCount} / {lateSummary.lateLimit}</strong>
        </span>
      </div>

      <section className="action-row">
        {[
          {
            label: "checkIn",
            time: checkedInAt,
            disabled:
              !!checkedInAt ||
              isFullDayLeave ||
              isTodaySpecialHoliday ||
              (isAfterWorkHours && !checkedInAt) ||
              isTooEarly,
            handler: () => handleAttendance("in"),
            btnText: isFullDayLeave
              ? "On Leave"
              : isTodaySpecialHoliday
                ? "Holiday"
                : isAfterWorkHours && !checkedInAt
                  ? "Time Expired"
                  : isTooEarly
                    ? "Too Early"
                    : checkedInAt
                      ? "checkedIn"
                      : "checkInNow",
          },
          { label: "checkOut", time: checkedOutAt, disabled: !checkedInAt || !!checkedOutAt || isBeforeEndTime, handler: () => handleAttendance("out"), btnText: "checkOutBtn" },
        ].map((action, idx) => (
          <div className="action-card" key={idx}>
            <h3>{t(`pages.hrAttendancePage.${action.label}`)}</h3>
            <p className="action-time">{formatTime(action.time)}</p>
            <button
              className={`btn-${action.label.toLowerCase()}`}
              onClick={action.handler}
              disabled={action.disabled}
              style={idx === 1 && isBeforeEndTime && checkedInAt && !checkedOutAt ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {idx === 1 && isBeforeEndTime && checkedInAt && !checkedOutAt
                ? t("pages.hrAttendancePage.waitUntil", { time: isHalfDayAfternoon ? policy.breakStartTime : policy.endTime })
                : t(`pages.hrAttendancePage.${action.btnText}`)}
            </button>
          </div>
        ))}
        <div className="action-card">
          <h3>{t("pages.hrAttendancePage.leave")}</h3>
          <p className="action-time">{t("pages.hrAttendancePage.manageLeaves")}</p>
          <button className="btn-leave" onClick={() => setIsLeaveModalOpen(true)}>
            {t("pages.hrAttendancePage.requestLeave")}
          </button>
        </div>
      </section>

      <h2 className="section-subtitle">{t("pages.hrAttendancePage.yourLeaveBalanceIncludingCarryOver")}</h2>
      <section className="quota-grid">
        {quotas.map((q) => (
          <QuotaCard
            key={q.quotaId}
            title={q.leaveType?.typeName || t("common.leave")}
            usedDays={q.usedDays}
            totalDays={q.totalDays}
            carriedOverDays={q.carriedOverDays}
            t={t}
          />
        ))}
      </section>

      <section className="history-section">
        <h2>{t("pages.hrAttendancePage.yourPersonalTimeHistory")}</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>{["date", "in", "out", "status"].map((h) => <th key={h}>{t(`pages.hrAttendancePage.${h}`)}</th>)}</tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty">{t("pages.hrAttendancePage.noAttendanceRecords")}</td>
                </tr>
              ) : (
                history.slice(0, 10).map((row) => (
                  <tr key={row.recordId}>
                    <td>{formatDate(row.workDate)}</td>
                    <td>{formatTime(row.checkInTime)}</td>
                    <td>{formatTime(row.checkOutTime)}</td>
                    <td>
                      <span className={`status-badge ${row.isLate ? "status-late" : "status-ok"}`}>
                        {row.isLate ? t("common.status.late") : t("common.status.onTime")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="history-section" style={{ marginTop: "30px" }}>
        <h2>{t("pages.hrAttendancePage.yourPersonalLeaveHistory")}</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>{["type", "dateRange", "days", "status", "action"].map((h) => <th key={h}>{t(`pages.hrAttendancePage.${h}`)}</th>)}</tr>
            </thead>
            <tbody>
              {leaveHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty">{t("pages.hrAttendancePage.noLeaveHistoryYet")}</td>
                </tr>
              ) : (
                leaveHistory.slice(0, 10).map((req) => (
                  <tr key={req.requestId}>
                    <td><strong>{req.leaveType?.typeName}</strong></td>
                    <td>
                      {moment(req.startDate).locale(mLocale).format("DD MMM")} - {moment(req.endDate).locale(mLocale).format("DD MMM YYYY")}
                    </td>
                    <td>{t("pages.hrAttendancePage.daysCount", { count: req.totalDaysRequested })}</td>
                    <td>
                      <span className={`status-badge status-${normStatus(req.status)}`}>
                        {t(`common.requestStatus.${normStatus(req.status)}`, { defaultValue: req.status })}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {normStatus(req.status) === "pending" && (
                        <button
                          className="btn-leave"
                          style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "#ef4444",
                            border: "1px solid rgba(239, 68, 68, 0.2)",
                            boxShadow: "none",
                          }}
                          onClick={() => handleCancelLeave(req.requestId)}
                        >
                          {t("pages.hrAttendancePage.cancel")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isLeaveModalOpen && ReactDOM.createPortal(
        <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>{t("pages.hrAttendancePage.requestLeave")}</h3>
              <button
                aria-label={t("common.close")}
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#666" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>{t("pages.hrAttendancePage.leaveType")}</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName} ({t("pages.hrAttendancePage.remainingDaysInOption", { remaining: num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays) })})
                  </option>
                ))}
              </select>

              <div className="date-row">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label>{t("pages.hrAttendancePage.startDate")}</label>
                  <DatePicker
                    selected={leaveForm.startDate ? new Date(leaveForm.startDate) : null}
                    onChange={(date) => handleLeaveChange({ target: { name: "startDate", value: moment(date).format("YYYY-MM-DD") } })}
                    minDate={new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={datePickerLocale}
                    className="wa-datepicker-input"
                    required
                  />
                  <select
                    value={leaveForm.startDuration}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, startDuration: e.target.value }))}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "14px", height: "44px" }}
                  >
                    <option value="Full">{t("pages.hrAttendancePage.duration.full")}</option>
                    <option value="HalfMorning">{t("pages.hrAttendancePage.duration.halfMorning")}</option>
                    <option value="HalfAfternoon">{t("pages.hrAttendancePage.duration.halfAfternoon")}</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label>{t("pages.hrAttendancePage.endDate")}</label>
                  <DatePicker
                    selected={leaveForm.endDate ? new Date(leaveForm.endDate) : null}
                    onChange={(date) => handleLeaveChange({ target: { name: "endDate", value: moment(date).format("YYYY-MM-DD") } })}
                    minDate={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={datePickerLocale}
                    className="wa-datepicker-input"
                    required
                  />
                  <select
                    value={leaveForm.endDuration}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, endDuration: e.target.value }))}
                    disabled={leaveForm.startDate === leaveForm.endDate && leaveForm.startDuration !== "Full"}
                    style={{
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "14px",
                      height: "44px",
                      opacity: leaveForm.startDate === leaveForm.endDate && leaveForm.startDuration !== "Full" ? 0.5 : 1,
                    }}
                  >
                    <option value="Full">{t("pages.hrAttendancePage.duration.full")}</option>
                    <option value="HalfMorning">{t("pages.hrAttendancePage.duration.halfMorning")}</option>
                    <option value="HalfAfternoon">{t("pages.hrAttendancePage.duration.halfAfternoon")}</option>
                  </select>
                </div>
              </div>

              {leaveForm.startDate && leaveForm.endDate && (
                <div
                  className="leave-preview-info"
                  style={{
                    gridColumn: "1 / -1",
                    background: "#f0f9ff",
                    border: "1px solid #bae6fd",
                    padding: "12px",
                    borderRadius: "12px",
                    color: "#0369a1",
                    fontSize: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <FiCalendar />
                    <span>
                      {t("pages.hrAttendancePage.actualLeaveDaysLabel")}{" "}
                      <strong>{t("pages.hrAttendancePage.daysCount", { count: previewDays })}</strong>
                    </span>
                  </div>
                  <p style={{ fontSize: "11px", color: "#0ea5e9", margin: "4px 0 0" }}>
                    {t("pages.hrAttendancePage.weekendsHolidaysExcluded")}
                  </p>
                </div>
              )}

              <label className="full">
                {t("pages.hrAttendancePage.detail")}
                <textarea
                  name="detail"
                  rows="3"
                  value={leaveForm.detail}
                  onChange={handleLeaveChange}
                  placeholder={t("common.reason")}
                />
              </label>

              <label className="full">
                <span className="field-label">{t("pages.hrAttendancePage.attachmentOptional")}</span>
                <div className="file-upload">
                  <input type="file" id="attachment" hidden onChange={(e) => setSelectedFile(e.target.files[0])} />
                  <label htmlFor="attachment" className="file-upload-btn">{t("pages.hrAttendancePage.chooseFile")}</label>
                  <span className={`file-upload-name ${selectedFile ? "active" : ""}`}>
                    {selectedFile ? selectedFile.name : t("pages.hrAttendancePage.noFileSelected")}
                  </span>
                </div>
              </label>

              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => setIsLeaveModalOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button type="submit" className="primary-btn">
                  {t("pages.hrAttendancePage.submitRequest")}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
