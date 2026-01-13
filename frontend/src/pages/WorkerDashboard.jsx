// src/pages/WorkerDashboard.jsx
import React, { useEffect, useState, useMemo } from "react";
import "moment/locale/th"; // เพิ่มการ import locale ภาษาไทย
import axiosClient from "../api/axiosClient";
import { useNavigate } from "react-router-dom";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import "./WorkerDashboard.css";
import { alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";
import moment from "moment";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

/* ===== Helpers ===== */
const todayStr = moment().format("YYYY-MM-DD"); // ✅ ประกาศไว้ด้านบนสุดเพื่อให้เข้าถึงได้ทั่วไฟล์

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

const parseWorkingDays = (str) => {
  if (!str) return [1, 2, 3, 4, 5];
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

/* ===== Components ===== */
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
  useEffect(() => {
    // เปลี่ยนภาษาของ moment ให้ตรงกับ i18next
    moment.locale(i18n.language);
  }, [i18n.language]);
  const navigate = useNavigate();


  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });
  const [policy, setPolicy] = useState({
    endTime: "18:00",
    breakStartTime: "12:00",
  });
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [specialHolidays, setSpecialHolidays] = useState([]);

  // ✅ New States for Button Logic
  const [isHalfDayAfternoon, setIsHalfDayAfternoon] = useState(false);
  const [isFullDayLeave, setIsFullDayLeave] = useState(false);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
    startDuration: "Full", // ✅ Support Half-day
    endDuration: "Full",
  });

  // ✅ helper: translate backend message (key or plain text) + meta
  const translateBackendMessage = (msgKeyOrText, meta) => {
    if (!msgKeyOrText) return t("pages.hrAttendancePage.alert.somethingWentWrong");
    return t(msgKeyOrText, { ...(meta || {}), defaultValue: msgKeyOrText });
  };

  const fetchDashboardData = async () => {
    try {
      const [attRes, policyRes, leaveRes] = await Promise.all([
        axiosClient.get("/timerecord/my"),
        axiosClient.get("/admin/attendance-policy"),
        axiosClient.get("/leave/my"), // ✅ ดึงใบลาของตนเองมาเช็คกะทำงาน
      ]);

      if (policyRes.data.policy) {
        setPolicy(policyRes.data.policy);
        if (policyRes.data.policy.workingDays)
          setWorkingDays(parseWorkingDays(policyRes.data.policy.workingDays));
        setSpecialHolidays(policyRes.data.policy.specialHolidays || []);
      }

      const records = attRes.data.records || [];
      setHistory(records);
      const todayRecord = records.find(
        (r) => r.workDate && r.workDate.startsWith(todayStr)
      );
      if (todayRecord) {
        if (todayRecord.checkInTime)
          setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime)
          setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }

      // ✅ Logic: ตรวจสอบใบลาของวันนี้เพื่อคุมปุ่มกด
      const requests = leaveRes.data.requests || [];
      const approvedToday = requests.find(
        (req) =>
          req.status === "Approved" &&
          moment(req.startDate).isSameOrBefore(todayStr, "day") &&
          moment(req.endDate).isSameOrAfter(todayStr, "day")
      );

      if (approvedToday) {
        const isFull =
          approvedToday.startDuration === "Full" ||
          (approvedToday.startDuration === "HalfMorning" &&
            approvedToday.endDuration === "HalfAfternoon");
        setIsFullDayLeave(isFull);
        setIsHalfDayAfternoon(
          approvedToday.endDuration === "HalfAfternoon" ||
            (approvedToday.startDate === approvedToday.endDate &&
              approvedToday.startDuration === "HalfAfternoon")
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchQuotaData = async () => {
    try {
      const response = await axiosClient.get("/leave/quota/my");
      const qs = response.data.quotas || [];
      setQuotas(qs);
      if (qs.length > 0 && !leaveForm.leaveTypeId)
        setLeaveForm((prev) => ({ ...prev, leaveTypeId: qs[0].leaveTypeId }));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchQuotaData();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ✅ Updated Preview Calculation for Half-day
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
              startDuration: leaveForm.startDuration,
              endDuration: leaveForm.endDuration,
            },
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
  }, [
    leaveForm.startDate,
    leaveForm.endDate,
    leaveForm.startDuration,
    leaveForm.endDuration,
  ]);

  const handleCheckIn = async () => {
    try {
      await axiosClient.post("/timerecord/check-in", {});
      await alertSuccess(t("common.success"), t("pages.hrAttendancePage.alert.checkInSuccess"));
      fetchDashboardData();
    } catch (err) {
      const msgKeyOrText = err.response?.data?.message;
      const meta = err.response?.data?.meta || err.response?.data?.data || {};
      alertError(t("common.error"), translateBackendMessage(msgKeyOrText, meta));
    }
  };

  const handleCheckOut = async () => {
    // ✅ Logic 3.3 & 3.4: บล็อกการเช็คเอาท์ก่อนเวลา
    const targetTimeStr = isHalfDayAfternoon ? policy.breakStartTime : policy.endTime;
    const [h, m] = targetTimeStr.split(":").map(Number);
    if (moment().isBefore(moment().hour(h).minute(m).second(0))) {
      return alertError(
        t("pages.hrAttendancePage.alert.notTimeCheckOutTitle"),
        t("pages.hrAttendancePage.alert.policyCheckOutFrom", { time: targetTimeStr })
      );
    }

    try {
      await axiosClient.post("/timerecord/check-out", {});
      await alertSuccess(t("common.success"), t("pages.hrAttendancePage.alert.checkOutSuccess"));
      fetchDashboardData();
    } catch (err) {
      const msgKeyOrText = err.response?.data?.message;
      const meta = err.response?.data?.meta || err.response?.data?.data || {};
      alertError(t("common.error"), translateBackendMessage(msgKeyOrText, meta));
    }
  };

  const toISODate = (date) => {
    if (!date) return "";
    return moment(date).format("YYYY-MM-DD");
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm((prev) => {
      const newState = { ...prev, [name]: value };
      if (name === "startDate" && (!prev.endDate || value > prev.endDate))
        newState.endDate = value;
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
      formData.append("startDuration", leaveForm.startDuration); // ✅ ส่งระยะเวลาไปยัง Backend
      formData.append("endDuration", leaveForm.endDuration);
      formData.append("reason", leaveForm.detail);
      if (selectedFile) formData.append("attachment", selectedFile);

      const res = await axiosClient.post("/leave/request", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        await alertSuccess(t("common.success"), t("pages.hrAttendancePage.alert.leaveSubmitSuccess"));
        setIsLeaveModalOpen(false);
        setLeaveForm({
          leaveTypeId: quotas[0]?.leaveTypeId || "",
          startDate: "",
          endDate: "",
          detail: "",
          startDuration: "Full",
          endDuration: "Full",
        });
        fetchQuotaData();
      } else {
        // ✅ translate backend key + meta (if any)
        const msgKeyOrText = res.data?.message;
        const meta = res.data?.meta || res.data?.data || {};
        await alertInfo(t("common.ok"), translateBackendMessage(msgKeyOrText, meta));
      }
    } catch (err) {
      const msgKeyOrText = err.response?.data?.message;
      const meta = err.response?.data?.meta || err.response?.data?.data || {};
      alertError(t("common.error"), translateBackendMessage(msgKeyOrText, meta));
    }
  };

  const formatTime = (d) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const formatDate = (s) =>
    s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

  const isWorkingDate = (date) => {
    const day = date.getDay();
    const dateStr = toISODate(date);
    return workingDays.includes(day) && !specialHolidays.includes(dateStr);
  };

  const isTodaySpecialHoliday = useMemo(() => specialHolidays.includes(todayStr), [specialHolidays]);

  // ✅ 1. เพิ่มตัวแปรตรวจสอบเงื่อนไขเวลา (เลียนแบบหน้า HR)
  const isAfterWorkHours = useMemo(() => {
    if (!policy?.endTime) return false;
    const [h, m] = policy.endTime.split(":").map(Number);
    const endMoment = moment().hour(h).minute(m).second(0);
    return moment().isAfter(endMoment);
  }, [policy.endTime]);

  const isTooEarly = useMemo(() => {
    if (!policy?.startTime) return false;

    // สร้าง Moment ของเวลาเริ่มงานในวันนี้
    const startTimeMoment = moment(`${todayStr} ${policy.startTime}`, "YYYY-MM-DD HH:mm");

    // คำนวณเวลาที่เร็วที่สุดที่ยอมให้กดได้ (ลบออก 4 ชม.)
    const earliestAllowed = startTimeMoment.clone().subtract(4, "hours");

    return moment(now).isBefore(earliestAllowed);
  }, [now, policy.startTime]);

  // ✅ 2. Logic สำหรับปุ่ม Check-out ล็อก/ปลดล็อก (ปรับให้ละเอียดขึ้น)
  const isBeforeEndTime = useMemo(() => {
    if (!policy?.endTime || !policy?.breakStartTime) return false;
    const targetTimeStr = isHalfDayAfternoon ? policy.breakStartTime : policy.endTime;
    const [h, m] = targetTimeStr.split(":").map(Number);
    return moment().isBefore(moment().hour(h).minute(m).second(0));
  }, [policy, isHalfDayAfternoon]);

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">
            {t("pages.workerDashboard.hello")},{" "}
            {JSON.parse(localStorage.getItem("user") || "{}").firstName ||
              t("pages.workerDashboard.workerFallback")}
          </h1>
          <p className="worker-datetime">
            {now.toLocaleString(i18n.language === "th" ? "th-TH" : "en-GB")}
          </p>
        </div>
        <div className="clock-box">
          <FiClock /> {formatTime(now)}
        </div>
      </header>

      <div className="late-warning">
        <span>
          {t("pages.workerDashboard.lateThisMonthLabel")}{" "}
          <strong>
            {lateSummary.lateCount} / {lateSummary.lateLimit}
          </strong>{" "}
          {t("pages.workerDashboard.timesSuffix")}
        </span>
      </div>

      <section className="action-row">
        {/* ✅ Check In Button: Disabled on Holiday or Full Day Leave */}
        <div className="action-card">
          <h3>{t("pages.workerDashboard.Check In")}</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button
            className="btn-checkin"
            onClick={handleCheckIn}
            disabled={
              !!checkedInAt ||
              isFullDayLeave ||
              isTodaySpecialHoliday ||
              (isAfterWorkHours && !checkedInAt) ||
              isTooEarly
            }
          >
            {isFullDayLeave
              ? t("pages.workerDashboard.button.onLeave")
              : isTodaySpecialHoliday
              ? t("pages.workerDashboard.button.holiday")
              : isAfterWorkHours && !checkedInAt
              ? t("pages.workerDashboard.button.timeExpired")
              : isTooEarly
              ? t("pages.workerDashboard.button.tooEarly")
              : checkedInAt
              ? t("pages.workerDashboard.checkedIn")
              : t("pages.workerDashboard.Check In")}
          </button>
        </div>

        {/* ✅ Check Out Button: Unlock early if Half-afternoon leave */}
        <div className="action-card">
          <h3>{t("pages.workerDashboard.Check Out")}</h3>
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
              ? t("pages.hrAttendancePage.waitUntil", {
                  time: isHalfDayAfternoon ? policy.breakStartTime : policy.endTime,
                  defaultValue: `Wait until ${
                    isHalfDayAfternoon ? policy.breakStartTime : policy.endTime
                  }`,
                })
              : checkedOutAt
              ? t("pages.workerDashboard.checkedOut")
              : t("pages.workerDashboard.Check Out")}
          </button>
        </div>

        <div className="action-card">
          <h3>{t("pages.workerDashboard.Leave")}</h3>
          <p className="action-time">{t("pages.workerDashboard.Leave Request")}</p>
          <button className="btn-leave" onClick={() => setIsLeaveModalOpen(true)}>
            <FiPlusCircle /> {t("pages.workerDashboard.Create Leave Request")}
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

      {/* Attendance history */}
      <section className="history-section">
        <div className="history-head">
          <h2>{t("pages.workerDashboard.Attendance History (Recent)")}</h2>
          <button className="history-link" onClick={() => navigate("/worker/attendance")}>
            {t("pages.workerDashboard.viewAll")}
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
              {history.slice(0, 7).map((row) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Leave Modal */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsLeaveModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head-row">
              <h3>{t("pages.workerDashboard.Create Leave Request")}</h3>
              <button className="close-x" onClick={() => setIsLeaveModalOpen(false)}>
                &times;
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
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName} (
                    {t("pages.workerDashboard.remainingInOption", {
                      remaining:
                        num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays),
                    })}
                    )
                  </option>
                ))}
              </select>

              <div className="date-row">
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label>{t("pages.workerDashboard.startDate")}</label>
                  <DatePicker
                    selected={leaveForm.startDate ? new Date(leaveForm.startDate) : null}
                    onChange={(date) =>
                      handleLeaveChange({
                        target: { name: "startDate", value: toISODate(date) },
                      })
                    }
                    minDate={new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    className="wa-datepicker-input"
                    required
                    locale={i18n.language} // ✅ เพิ่มบรรทัดนี้ เพื่อให้ปฏิทินเปลี่ยนภาษา
                  />

                  <select
                    value={leaveForm.startDuration}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, startDuration: e.target.value }))}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ddd" }}
                  >
                    <option value="Full">{t("pages.workerDashboard.duration.full")}</option>
                    <option value="HalfMorning">{t("pages.workerDashboard.duration.halfMorning")}</option>
                    <option value="HalfAfternoon">{t("pages.workerDashboard.duration.halfAfternoon")}</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label>{t("pages.workerDashboard.endDate")}</label>
                  <DatePicker
                    selected={leaveForm.endDate ? new Date(leaveForm.endDate) : null}
                    onChange={(date) =>
                      handleLeaveChange({
                        target: { name: "endDate", value: toISODate(date) },
                      })
                    }
                    minDate={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                    filterDate={isWorkingDate}
                    dateFormat="yyyy-MM-dd"
                    className="wa-datepicker-input"
                    required
                     locale={i18n.language} // ✅ เพิ่มบรรทัดนี้ เพื่อให้ปฏิทินเปลี่ยนภาษา
                  />

                  <select
                    value={leaveForm.endDuration}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, endDuration: e.target.value }))}
                    disabled={leaveForm.startDate === leaveForm.endDate && leaveForm.startDuration !== "Full"}
                    style={{ padding: "8px", borderRadius: "8px", border: "1px solid #ddd" }}
                  >
                    <option value="Full">{t("pages.workerDashboard.duration.full")}</option>
                    <option value="HalfMorning">{t("pages.workerDashboard.duration.halfMorning")}</option>
                    <option value="HalfAfternoon">{t("pages.workerDashboard.duration.halfAfternoon")}</option>
                  </select>
                </div>
              </div>

              {leaveForm.startDate && leaveForm.endDate && (
                <div className="leave-preview-info">
                  <div className="preview-main">
                    <FiCalendar />
                    <span>
                      {t("pages.workerDashboard.daysToDeductFromQuota")}{" "}
                      <strong>
                        {previewDays} {t("pages.workerDashboard.daySuffix")}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              <label className="full">
                {t("pages.workerDashboard.reasonLabel")}
                <textarea
                  name="detail"
                  rows="3"
                  value={leaveForm.detail}
                  onChange={handleLeaveChange}
                  placeholder={t("common.placeholders.enterReason")}
                />
              </label>

              <label className="full">
                <span className="field-label">{t("pages.workerDashboard.ATTACHMENT (OPTIONAL)")}</span>
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
                  <span className={`file-upload-name ${selectedFile ? "active" : ""}`}>
                    {selectedFile ? selectedFile.name : t("pages.workerDashboard.noFileSelected")}
                  </span>
                </div>
              </label>

              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => setIsLeaveModalOpen(false)}>
                  {t("pages.workerDashboard.cancel")}
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
