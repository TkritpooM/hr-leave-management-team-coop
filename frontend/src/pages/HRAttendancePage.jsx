// src/pages/HRAttendancePage.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./HRAttendancePage.css";
import moment from "moment";
import "moment/locale/th";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import {
  alertConfirm,
  alertError,
  alertSuccess,
  alertInfo,
} from "../utils/sweetAlert";

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

// 🔥 Helper แปลงวันทำงานจาก "mon,tue" -> [1, 2]
const parseWorkingDays = (str) => {
  if (!str) return [1, 2, 3, 4, 5]; // Default Mon-Fri
  const dayMap = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

// 🔥 ปรับปรุง QuotaCard ให้แสดงยอดทบสะสมเหมือนของ Worker
function QuotaCard({ title, usedDays, totalDays, carriedOverDays, t }) {
  const used = num(usedDays);
  const currentTotal = num(totalDays);
  const carried = num(carriedOverDays);

  // สิทธิ์รวม = สิทธิ์ปีปัจจุบัน + ยอดทบ
  const totalEffective = currentTotal + carried;
  const remaining = Math.max(0, totalEffective - used);
  const percent =
    totalEffective > 0 ? clamp((used / totalEffective) * 100, 0, 100) : 0;

  return (
    <div className="quota-card">
      <div className="quota-top">
        <div
          className="quota-title-group"
          style={{ display: "flex", flexDirection: "column", gap: "4px" }}
        >
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
              {t("pages.hrAttendancePage.carriedOverBadge", {
                days: carried,
                defaultValue: `+${carried} Carried Over`,
              })}
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

        <div
          className="qm highlight"
          style={{ background: "rgba(30, 64, 175, 0.05)" }}
        >
          <div className="qm-label">{t("pages.hrAttendancePage.available")}</div>
          <div className="qm-value">{totalEffective}</div>
        </div>

        <div
          className="qm success"
          style={{ background: "rgba(22, 163, 74, 0.05)" }}
        >
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

  // ✅ locale สำหรับ moment / date-fns / toLocaleString
  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en")
      .toLowerCase()
      .trim();
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

  // 🔥 State สำหรับเก็บวันทำงาน (Array ตัวเลข) และวันหยุดพิเศษ
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [specialHolidays, setSpecialHolidays] = useState([]);

  // Leave modal & Preview
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
  });

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchPolicy = async () => {
    try {
      const res = await axios.get(
        "http://localhost:8000/api/admin/attendance-policy",
        getAuthHeader()
      );
      if (res.data.policy) {
        setPolicy(res.data.policy);
        if (res.data.policy.workingDays) {
          setWorkingDays(parseWorkingDays(res.data.policy.workingDays));
        }
        setSpecialHolidays(res.data.policy.specialHolidays || []);
      }
    } catch (err) {
      console.error("Fetch policy error", err);
    }
  };

  // 1) Attendance Data
  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/timerecord/my",
        getAuthHeader()
      );
      const records = response.data.records || [];
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
    } catch (err) {
      console.error(err);
    }
  };

  // 2) Leave History Data
  const fetchLeaveHistory = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/leave/my",
        getAuthHeader()
      );
      setLeaveHistory(response.data.requests || []);
    } catch (err) {
      console.error(err);
    }
  };

  // 3) Quota Data
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/leave/quota/my",
        getAuthHeader()
      );
      const qs = response.data.quotas || [];
      setQuotas(qs);
      if (qs.length > 0 && !leaveForm.leaveTypeId) {
        setLeaveForm((prev) => ({
          ...prev,
          leaveTypeId: qs[0].leaveTypeId.toString(),
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 4) Late Summary
  const fetchLateSummary = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8000/api/timerecord/late/summary",
        getAuthHeader()
      );
      setLateSummary({
        lateCount: response.data.lateCount,
        lateLimit: response.data.lateLimit,
      });
    } catch (err) {
      console.error(err);
    }
  };

  // 🔥 5) Real-time Preview สำหรับวันลาจริง
  useEffect(() => {
    if (leaveForm.startDate && leaveForm.endDate) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await axios.get(
            "http://localhost:8000/api/leave/calculate-days",
            {
              params: {
                startDate: leaveForm.startDate,
                endDate: leaveForm.endDate,
                startDuration: "Full",
                endDuration: "Full",
              },
              ...getAuthHeader(),
            }
          );
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
    fetchPolicy();
    fetchAttendanceData();
    fetchLeaveHistory();
    fetchQuotaData();
    fetchLateSummary();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckIn = async () => {
    try {
      await axios.post(
        "http://localhost:8000/api/timerecord/check-in",
        {},
        getAuthHeader()
      );
      await alertSuccess(
        t("pages.hrAttendancePage.alert.successTitle"),
        t("pages.hrAttendancePage.alert.checkInSuccess")
      );
      fetchAttendanceData();
      fetchLateSummary();
    } catch (err) {
      alertError(
        t("pages.hrAttendancePage.alert.checkInFailedTitle"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.somethingWentWrong")
      );
    }
  };

  const handleCheckOut = async () => {
    if (!policy || !policy.endTime) {
      return alertError(
        t("common.error", "Error"),
        t("pages.hrAttendancePage.alert.unableLoadPolicy")
      );
    }

    const [pEndHour, pEndMin] = policy.endTime.split(":").map(Number);
    const nowMoment = moment();
    const endMoment = moment()
      .hour(pEndHour)
      .minute(pEndMin)
      .second(0)
      .millisecond(0);

    if (nowMoment.isBefore(endMoment)) {
      return alertError(
        t("pages.hrAttendancePage.alert.notTimeCheckOutTitle"),
        t("pages.hrAttendancePage.alert.policyCheckOutFrom", {
          time: policy.endTime,
        })
      );
    }

    try {
      await axios.post(
        "http://localhost:8000/api/timerecord/check-out",
        {},
        getAuthHeader()
      );
      await alertSuccess(
        t("pages.hrAttendancePage.alert.successTitle"),
        t("pages.hrAttendancePage.alert.checkOutSuccess")
      );
      fetchAttendanceData();
    } catch (err) {
      alertError(
        t("pages.hrAttendancePage.alert.checkOutFailedTitle"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.somethingWentWrong")
      );
    }
  };

  const handleCancelLeave = async (requestId) => {
    const ok = await alertConfirm(
      t("pages.hrAttendancePage.alert.confirmCancelTitle"),
      t("pages.hrAttendancePage.alert.confirmCancelMsg"),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      const res = await axios.patch(
        `http://localhost:8000/api/leave/${requestId}/cancel`,
        {},
        getAuthHeader()
      );
      if (res.data.success) {
        await alertSuccess(
          t("pages.hrAttendancePage.alert.successTitle"),
          t("pages.hrAttendancePage.alert.cancelLeaveSuccess")
        );
        fetchLeaveHistory();
        fetchQuotaData();
      } else {
        alertError(
          t("pages.hrAttendancePage.alert.unableCancelTitle"),
          res.data.message || t("pages.hrAttendancePage.alert.somethingWentWrong")
        );
      }
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        t("pages.hrAttendancePage.alert.connectServerFailed")
      );
    }
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

      const res = await axios.post(
        "http://localhost:8000/api/leave/request",
        formData,
        {
          headers: {
            ...getAuthHeader().headers,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (res.data.success) {
        await alertSuccess(
          t("pages.hrAttendancePage.alert.successTitle"),
          t("pages.hrAttendancePage.alert.leaveSubmitSuccess")
        );
        setIsLeaveModalOpen(false);
        fetchQuotaData();
        fetchLeaveHistory();
        setLeaveForm({
          leaveTypeId: quotas[0]?.leaveTypeId.toString() || "",
          startDate: "",
          endDate: "",
          detail: "",
        });
        setSelectedFile(null);
      } else {
        alertInfo(
          t("pages.hrAttendancePage.alert.failedTitle"),
          res.data.message || t("pages.hrAttendancePage.alert.somethingWentWrong")
        );
      }
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message ||
          t("pages.hrAttendancePage.alert.somethingWentWrong")
      );
    }
  };

  const formatTime = (d) =>
    d
      ? new Date(d).toLocaleTimeString(uiLocale, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  const formatDate = (s) =>
    s
      ? new Date(s).toLocaleDateString(uiLocale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "-";

  const formatNowDateTime = (d) =>
    d.toLocaleString(uiLocale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const isBeforeEndTime = useMemo(() => {
    if (!policy?.endTime) return false;
    const [h, m] = policy.endTime.split(":").map(Number);
    return moment().isBefore(moment().hour(h).minute(m));
  }, [policy?.endTime]);

  // 🔥 Helper Function: เช็คว่าเป็นวันทำงานหรือไม่ (ใช้ใน DatePicker filterDate)
  const isWorkingDate = (date) => {
    const day = date.getDay(); // 0-6
    const dateStr = moment(date).format("YYYY-MM-DD");

    // 1. เช็คว่าเป็นวันทำงานตาม Policy ไหม?
    const isWorkDay = workingDays.includes(day);

    // 2. เช็คว่าเป็นวันหยุดพิเศษไหม?
    const isSpecialHoliday = specialHolidays.includes(dateStr);

    // ต้องเป็นวันทำงาน และ ไม่ใช่วันหยุดพิเศษ ถึงจะเลือกได้
    return isWorkDay && !isSpecialHoliday;
  };

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">
            {t("pages.hrAttendancePage.hello")},{" "}
            {user.firstName || t("pages.hrAttendancePage.hrFallback")}
          </h1>

          <p className="worker-datetime">{formatNowDateTime(now)}</p>
        </div>

        <div className="worker-header-right">
          <div className="clock-box">{formatTime(now)}</div>
        </div>
      </header>

      <div className="late-warning">
        <span>
          {t("pages.hrAttendancePage.lateThisMonth")}{" "}
          <strong>
            {lateSummary.lateCount} / {lateSummary.lateLimit}
          </strong>
        </span>
      </div>

      <section className="action-row">
        <div className="action-card">
          <h3>{t("pages.hrAttendancePage.checkIn")}</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>

          <button
            className="btn-checkin"
            onClick={handleCheckIn}
            disabled={!!checkedInAt}
          >
            {checkedInAt
              ? t("pages.hrAttendancePage.checkedIn")
              : t("pages.hrAttendancePage.checkInNow")}
          </button>
        </div>

        <div className="action-card">
          <h3>{t("pages.hrAttendancePage.checkOut")}</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>

          <button
            className="btn-checkout"
            onClick={handleCheckOut}
            disabled={!checkedInAt || !!checkedOutAt || isBeforeEndTime}
            style={
              isBeforeEndTime && checkedInAt && !checkedOutAt
                ? { opacity: 0.5, cursor: "not-allowed" }
                : {}
            }
          >
            {isBeforeEndTime && checkedInAt && !checkedOutAt
              ? t("pages.hrAttendancePage.waitUntil", { time: policy.endTime })
              : t("pages.hrAttendancePage.checkOutBtn")}
          </button>
        </div>

        <div className="action-card">
          <h3>{t("pages.hrAttendancePage.leave")}</h3>
          <p className="action-time">{t("pages.hrAttendancePage.manageLeaves")}</p>
          <button className="btn-leave" onClick={() => setIsLeaveModalOpen(true)}>
            {t("pages.hrAttendancePage.requestLeave")}
          </button>
        </div>
      </section>

      <h2 className="section-subtitle">
        {t("pages.hrAttendancePage.yourLeaveBalanceIncludingCarryOver")}
      </h2>

      <section className="quota-grid">
        {quotas.length > 0 ? (
          quotas.map((q) => (
            <QuotaCard
              key={q.quotaId}
              title={q.leaveType?.typeName || t("common.leave", "Leave")}
              usedDays={q.usedDays}
              totalDays={q.totalDays}
              carriedOverDays={q.carriedOverDays}
              t={t}
            />
          ))
        ) : (
          <div className="quota-empty">{t("common.loadingQuotas")}</div>
        )}
      </section>

      <section className="history-section">
        <h2>{t("pages.hrAttendancePage.yourPersonalTimeHistory")}</h2>

        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>{t("pages.hrAttendancePage.date")}</th>
                <th>{t("pages.hrAttendancePage.in")}</th>
                <th>{t("pages.hrAttendancePage.out")}</th>
                <th>{t("pages.hrAttendancePage.status")}</th>
              </tr>
            </thead>

            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="4" className="empty">
                    {t("pages.hrAttendancePage.noAttendanceRecords")}
                  </td>
                </tr>
              ) : (
                history.slice(0, 10).map((row) => (
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
                          : t("common.status.onTime", "On Time")}
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
              <tr>
                <th>{t("pages.hrAttendancePage.type")}</th>
                <th>{t("pages.hrAttendancePage.dateRange")}</th>
                <th>{t("pages.hrAttendancePage.days")}</th>
                <th>{t("pages.hrAttendancePage.status")}</th>
                <th style={{ textAlign: "center" }}>
                  {t("pages.hrAttendancePage.action")}
                </th>
              </tr>
            </thead>

            <tbody>
              {leaveHistory.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty">
                    {t("pages.hrAttendancePage.noLeaveHistoryYet")}
                  </td>
                </tr>
              ) : (
                leaveHistory.slice(0, 10).map((req) => (
                  <tr key={req.requestId}>
                    <td>
                      <strong>{req.leaveType?.typeName}</strong>
                    </td>

                    <td>
                      {moment(req.startDate).locale(mLocale).format("DD MMM")}{" "}
                      -{" "}
                      {moment(req.endDate).locale(mLocale).format("DD MMM YYYY")}
                    </td>

                    <td>
                      {t("pages.hrAttendancePage.daysCount", {
                        count: req.totalDaysRequested,
                      })}
                    </td>

                    <td>
                      <span className={`status-badge status-${normStatus(req.status)}`}>
                        {t(`common.requestStatus.${normStatus(req.status)}`, req.status)}
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

      {/* 🔥 Modal: Request Leave (Datepicker with Filter) */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div
              className="modal-head-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
              }}
            >
              <h3 style={{ margin: 0 }}>{t("pages.hrAttendancePage.requestLeave")}</h3>

              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#666",
                }}
                aria-label={t("common.close", "Close")}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>{t("pages.hrAttendancePage.leaveType")}</label>
              <select
                name="leaveTypeId"
                value={leaveForm.leaveTypeId}
                onChange={handleLeaveChange}
                required
              >
                {quotas.map((q) => {
                  const remain =
                    num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays);
                  return (
                    <option key={q.leaveTypeId} value={q.leaveTypeId}>
                      {q.leaveType?.typeName}{" "}
                      {t("pages.hrAttendancePage.remainingDaysInOption", {
                        remaining: remain,
                      })}
                    </option>
                  );
                })}
              </select>

              <div className="date-row">
                <label>
                  {t("pages.hrAttendancePage.startDate")}
                  <DatePicker
                    selected={leaveForm.startDate ? new Date(leaveForm.startDate) : null}
                    onChange={(date) => {
                      const dStr = moment(date).format("YYYY-MM-DD");
                      handleLeaveChange({ target: { name: "startDate", value: dStr } });
                    }}
                    minDate={new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={datePickerLocale}
                    placeholderText={t("pages.hrAttendancePage.datePlaceholder")}
                    className="wa-datepicker-input"
                    required
                  />
                </label>

                <label>
                  {t("pages.hrAttendancePage.endDate")}
                  <DatePicker
                    selected={leaveForm.endDate ? new Date(leaveForm.endDate) : null}
                    onChange={(date) => {
                      const dStr = moment(date).format("YYYY-MM-DD");
                      handleLeaveChange({ target: { name: "endDate", value: dStr } });
                    }}
                    minDate={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    locale={datePickerLocale}
                    placeholderText={t("pages.hrAttendancePage.datePlaceholder")}
                    className="wa-datepicker-input"
                    required
                  />
                </label>
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
                      <strong>
                        {t("pages.hrAttendancePage.daysCount", { count: previewDays })}
                      </strong>
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
                <span className="field-label">
                  {t("pages.hrAttendancePage.attachmentOptional")}
                </span>

                <div className="file-upload">
                  <input
                    type="file"
                    id="attachment"
                    hidden
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                  />
                  <label htmlFor="attachment" className="file-upload-btn">
                    {t("pages.hrAttendancePage.chooseFile")}
                  </label>

                  <span className={`file-upload-name ${selectedFile ? "active" : ""}`}>
                    {selectedFile
                      ? selectedFile.name
                      : t("pages.hrAttendancePage.noFileSelected")}
                  </span>
                </div>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="outline-btn"
                  onClick={() => setIsLeaveModalOpen(false)}
                >
                  {t("common.cancel", "Cancel")}
                </button>

                <button type="submit" className="primary-btn">
                  {t("pages.hrAttendancePage.submitRequest")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
