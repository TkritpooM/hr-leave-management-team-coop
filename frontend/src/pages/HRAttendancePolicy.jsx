import React, { useEffect, useMemo, useState } from "react";
import "./HRAttendancePolicy.css";
import { alertConfirm, alertSuccess, alertError, alertInput } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import "react-datepicker/dist/react-datepicker.css";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { FiCalendar, FiChevronLeft, FiChevronRight, FiTrash2, FiFilter, FiX } from "react-icons/fi";
import DatePicker from "react-datepicker";
import { enUS, th as thLocale, ja as jaLocale } from "date-fns/locale";

const defaultPolicy = {
  startTime: "09:00",
  endTime: "18:00",
  breakStartTime: "12:00",
  breakEndTime: "13:00",
  graceMinutes: 5,
  workingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  specialHolidays: [],
  leaveGapDays: 0,
};

const clampInt = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

export default function HRAttendancePolicy() {
  const { t, i18n } = useTranslation();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
    if (lng.startsWith("th")) return "th";
    if (lng.startsWith("ja")) return "ja";
    return "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  const datePickerLocale = mLocale === "th" ? thLocale : mLocale === "ja" ? jaLocale : enUS;

  const DAYS = useMemo(
    () => [
      { key: "mon", label: t("common.days.mon") },
      { key: "tue", label: t("common.days.tue") },
      { key: "wed", label: t("common.days.wed") },
      { key: "thu", label: t("common.days.thu") },
      { key: "fri", label: t("common.days.fri") },
      { key: "sat", label: t("common.days.sat") },
      { key: "sun", label: t("common.days.sun") },
    ],
    [t]
  );

  const [policy, setPolicy] = useState(defaultPolicy);
  const [saving, setSaving] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);

  // ✅ Filter States (เหมือน modal: Date | null)
  const [filterStart, setFilterStart] = useState(null);
  const [filterEnd, setFilterEnd] = useState(null);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const res = await axiosClient.get("/admin/attendance-policy");
        const data = res.data.policy;

        const daysArr = data.workingDays ? data.workingDays.split(",") : [];
        const daysObj = {};
        DAYS.forEach((d) => (daysObj[d.key] = daysArr.includes(d.key)));

        setPolicy({
          ...data,
          workingDays: daysObj,
          specialHolidays: data.specialHolidays || [],
          leaveGapDays: data.leaveGapDays || 0,
        });
      } catch (err) {
        console.error(t("pages.attendancePolicy.console.loadError"), err);
      }
    };
    fetchPolicy();
  }, [DAYS, t]);

  const workingSummary = useMemo(() => {
    const on = DAYS.filter((d) => policy.workingDays?.[d.key]).map((d) => d.label);
    return on.length ? on.join(", ") : t("common.dash");
  }, [policy.workingDays, DAYS, t]);

  const filteredHolidays = useMemo(() => {
    let list = [...(policy.specialHolidays || [])];

    const startStr = filterStart ? moment(filterStart).format("YYYY-MM-DD") : "";
    const endStr = filterEnd ? moment(filterEnd).format("YYYY-MM-DD") : "";

    if (startStr) list = list.filter((h) => h.split("|")[0] >= startStr);
    if (endStr) list = list.filter((h) => h.split("|")[0] <= endStr);

    return list.sort();
  }, [policy.specialHolidays, filterStart, filterEnd]);

  // ✅ Logic การเปลี่ยนเวลาเริ่มพัก และบังคับเวลาจบพัก +1 ชม.
  const handleBreakStartChange = (val) => {
    const newBreakEnd = moment(val, "HH:mm").add(1, "hours").format("HH:mm");
    setPolicy((p) => ({
      ...p,
      breakStartTime: val,
      breakEndTime: newBreakEnd,
    }));
  };

  const save = async () => {
    if (policy.breakStartTime <= policy.startTime) {
      return alertError(t("common.error"), t("pages.attendancePolicy.errors.breakStartAfterStart"));
    }
    if (policy.breakEndTime <= policy.breakStartTime) {
      return alertError(t("common.error"), t("pages.attendancePolicy.errors.breakEndAfterBreakStart"));
    }
    if (policy.endTime <= policy.breakEndTime) {
      return alertError(t("common.error"), t("pages.attendancePolicy.errors.endAfterBreakEnd"));
    }

    const ok = await alertConfirm(
      t("pages.attendancePolicy.saveTitle"),
      t("pages.attendancePolicy.saveDesc"),
      t("common.save")
    );
    if (!ok) return;

    try {
      setSaving(true);
      const daysStr = Object.keys(policy.workingDays || {})
        .filter((key) => policy.workingDays[key])
        .join(",");

      await axiosClient.put("/admin/attendance-policy", {
        startTime: policy.startTime,
        endTime: policy.endTime,
        breakStartTime: policy.breakStartTime,
        breakEndTime: policy.breakEndTime,
        graceMinutes: policy.graceMinutes,
        workingDays: daysStr,
        leaveGapDays: policy.leaveGapDays,
        specialHolidays: policy.specialHolidays,
      });

      await alertSuccess(t("common.saved"), t("pages.attendancePolicy.savedSuccess"));
    } catch (e) {
      console.error(e);
      await alertError(t("common.error"), t("pages.attendancePolicy.savedFail"));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await alertConfirm(
      t("pages.attendancePolicy.resetTitle"),
      t("pages.attendancePolicy.resetDesc"),
      t("common.reset")
    );
    if (!ok) return;

    try {
      const daysStr = "mon,tue,wed,thu,fri";
      await axiosClient.put("/admin/attendance-policy", { ...defaultPolicy, workingDays: daysStr, specialHolidays: [] });
      setPolicy(defaultPolicy);
      await alertSuccess(t("common.reset"), t("pages.attendancePolicy.resetSuccess"));
    } catch (e) {
      await alertError(t("common.error"), t("pages.attendancePolicy.resetFail"));
    }
  };

  const handleSaveHolidays = (newHolidays) => {
    setPolicy((p) => ({ ...p, specialHolidays: newHolidays }));
    setShowHolidayModal(false);
  };

  return (
    <div className="page-card hr-policy">
      <div className="hrp-head">
        <div>
          <h1 className="hrp-title">{t("pages.attendancePolicy.title")}</h1>
          <p className="hrp-sub">{t("pages.attendancePolicy.subtitle")}</p>
        </div>
        <div className="hrp-actions">
          <button className="btn outline" type="button" onClick={reset} disabled={saving}>
            {t("common.reset")}
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      <div className="hrp-grid">
        <section className="hrp-card">
          <h3 className="hrp-card-title">{t("pages.attendancePolicy.workPolicyTitle")}</h3>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.startTime")}</label>
              <input
                type="time"
                value={policy.startTime}
                onChange={(e) => setPolicy((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>

            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.endTime")}</label>
              <input
                type="time"
                min={policy.startTime}
                value={policy.endTime}
                onChange={(e) => setPolicy((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.breakstart")}</label>
              <input
                type="time"
                value={policy.breakStartTime}
                onChange={(e) => handleBreakStartChange(e.target.value)}
              />
            </div>

            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.breakend")}</label>
              <input
                type="time"
                min={policy.breakStartTime}
                value={policy.breakEndTime}
                onChange={(e) => setPolicy((p) => ({ ...p, breakEndTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.graceMinutes")}</label>
              <input
                type="number"
                min={0}
                max={180}
                value={policy.graceMinutes}
                onChange={(e) => setPolicy((p) => ({ ...p, graceMinutes: clampInt(e.target.value, 0, 180) }))}
              />
            </div>

            <div className="hrp-field" style={{ opacity: 0, pointerEvents: "none" }}>
              <label>{t("common.space")}</label>
              <input type="text" readOnly />
            </div>
          </div>

          <div className="hrp-divider" />

          <div className="hrp-field">
            <label>{t("pages.attendancePolicy.workingDays")}</label>
            <div className="hrp-days">
              {DAYS.map((d) => (
                <label className="hrp-day" key={d.key}>
                  <input
                    type="checkbox"
                    checked={!!policy.workingDays?.[d.key]}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        workingDays: { ...p.workingDays, [d.key]: e.target.checked },
                      }))
                    }
                  />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>

            <div className="hrp-hint">
              {t("pages.attendancePolicy.currently")}: <strong>{workingSummary}</strong>
            </div>
          </div>
        </section>

        <section className="hrp-card">
          <h3 className="hrp-card-title">{t("pages.attendancePolicy.leaveGapTitle")}</h3>
          <p className="hrp-sub2">{t("pages.attendancePolicy.leaveGapDesc")}</p>

          <div className="hrp-field" style={{ marginTop: "20px" }}>
            <label>{t("pages.attendancePolicy.leaveGapLabel")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="number"
                min={0}
                max={30}
                style={{ width: "100px" }}
                value={policy.leaveGapDays || 0}
                onChange={(e) => setPolicy((p) => ({ ...p, leaveGapDays: clampInt(e.target.value, 0, 30) }))}
              />
              <span style={{ color: "#64748b", fontSize: "14px", fontWeight: "500" }}>
                {t("pages.attendancePolicy.days")}
              </span>
            </div>

            <div className="hrp-hint" style={{ marginTop: "12px" }}>
              {t("pages.attendancePolicy.leaveGapExample")}
            </div>
          </div>

          <div className="hrp-divider" style={{ margin: "24px 0" }} />

          <div className="policy-tips">
            <h4
              style={{
                fontSize: "0.95rem",
                color: "#334155",
                marginBottom: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#3b82f6",
                }}
              ></span>
              {t("pages.attendancePolicy.tipsTitle")}
            </h4>

            <ul style={{ margin: 0, paddingLeft: "16px", color: "#64748b", fontSize: "0.85rem", lineHeight: "1.6" }}>
              <li>{t("pages.attendancePolicy.tip1")}</li>
              <li>{t("pages.attendancePolicy.tip2")}</li>
              <li>{t("pages.attendancePolicy.tip3")}</li>
            </ul>
          </div>
        </section>

        <section className="hrp-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 className="hrp-card-title" style={{ margin: 0 }}>
              {t("pages.attendancePolicy.specialHolidaysTitle")}
            </h3>
            <button className="btn outline small" onClick={() => setShowHolidayModal(true)}>
              <FiCalendar /> {t("pages.attendancePolicy.manageHolidays")}
            </button>
          </div>

          {/* ✅ Filter: เปลี่ยนเป็น DatePicker เหมือนใน HRAttendancePage modal */}
          <div className="policy-filter-bar">
            <div className="policy-filter-label">
              <FiFilter /> <span>{t("common.filter")}:</span>
            </div>

            <DatePicker
              selected={filterStart}
              onChange={(date) => setFilterStart(date)}
              dateFormat="yyyy-MM-dd"
              locale={datePickerLocale}
              className="wa-datepicker-input"
              placeholderText={t("common.datePlaceholder")}
            />

            <span className="policy-filter-sep">-</span>

            <DatePicker
              selected={filterEnd}
              onChange={(date) => setFilterEnd(date)}
              dateFormat="yyyy-MM-dd"
              locale={datePickerLocale}
              className="wa-datepicker-input"
              placeholderText={t("common.datePlaceholder")}
              minDate={filterStart || undefined}
            />

            {(filterStart || filterEnd) && (
              <button
                type="button"
                className="policy-filter-clear"
                onClick={() => {
                  setFilterStart(null);
                  setFilterEnd(null);
                }}
              >
                <FiX /> {t("common.clear")}
              </button>
            )}
          </div>

          {!policy.specialHolidays || policy.specialHolidays.length === 0 ? (
            <div className="hrp-empty">{t("pages.attendancePolicy.noHolidays")}</div>
          ) : (
            <>
              {filteredHolidays.length === 0 ? (
                <div className="hrp-empty" style={{ padding: "20px" }}>
                  {t("pages.attendancePolicy.noHolidaysInRange")}
                </div>
              ) : (
                <div
                  className="hrp-holiday-grid"
                  style={{
                    display: "grid",
                    gap: "12px",
                    maxHeight: "400px",
                    overflowY: "auto",
                    paddingRight: "4px",
                  }}
                >
                  {filteredHolidays.map((entry) => {
                    const [d, desc] = entry.split("|");
                    const mDate = moment(d);
                    return (
                      <div
                        key={entry}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          background: "#f8fafc",
                          padding: "12px",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#fff",
                            border: "1px solid #cbd5e1",
                            borderRadius: "10px",
                            width: "50px",
                            height: "54px",
                            boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.65rem",
                              textTransform: "uppercase",
                              color: "#64748b",
                              fontWeight: "700",
                            }}
                          >
                            {mDate.format("MMM")}
                          </span>
                          <span style={{ fontSize: "1.1rem", fontWeight: "700", color: "#0f172a", lineHeight: "1" }}>
                            {mDate.format("DD")}
                          </span>
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.95rem", fontWeight: "600", color: "#334155" }}>
                            {desc || t("pages.attendancePolicy.companyHoliday")}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{mDate.format("dddd, YYYY")}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <HolidayManagerModal
        isOpen={showHolidayModal}
        onClose={() => setShowHolidayModal(false)}
        initialHolidays={policy.specialHolidays}
        onSave={handleSaveHolidays}
      />
    </div>
  );
}

function HolidayManagerModal({ isOpen, onClose, initialHolidays, onSave }) {
  const { t } = useTranslation();
  const [viewDate, setViewDate] = useState(moment());
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setHolidays([...(initialHolidays || [])]);
      setViewDate(moment());
    }
  }, [isOpen, initialHolidays]);

  const calendarDays = useMemo(() => {
    const start = viewDate.clone().startOf("month").startOf("week");
    const end = viewDate.clone().endOf("month").endOf("week");
    const days = [];
    let day = start.clone();

    let count = 0;
    while (day.isSameOrBefore(end) && count < 42) {
      days.push(day.clone());
      day.add(1, "day");
      count++;
    }
    return days;
  }, [viewDate]);

  const toggleDay = async (d) => {
    const dateStr = d.format("YYYY-MM-DD");
    const existingIndex = holidays.findIndex((h) => h.split("|")[0] === dateStr);

    if (existingIndex >= 0) {
      const currentDesc = holidays[existingIndex].split("|")[1] || "";
      const val = await alertInput(
        t("pages.attendancePolicy.editHoliday"),
        t("pages.attendancePolicy.holidayDesc"),
        currentDesc
      );

      if (val === undefined) return;

      const newEntry = `${dateStr}|${val}`;
      setHolidays((prev) => {
        const copy = [...prev];
        copy[existingIndex] = newEntry;
        return copy;
      });
    } else {
      // Add immediately with empty description
      setHolidays((prev) => [...prev, `${dateStr}|`]);
    }
  };

  const removeHoliday = (e, dateStr) => {
    e.stopPropagation();
    setHolidays((prev) => prev.filter((h) => h.split("|")[0] !== dateStr));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "600px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head-row">
          <h3>{t("pages.attendancePolicy.manageHolidays")}</h3>
          <button className="close-x" onClick={onClose}>
            &times;
          </button>
        </div>

        <div
          className="calendar-top"
          style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <button className="nav-btn" onClick={() => setViewDate((d) => d.clone().subtract(1, "month"))}>
            <FiChevronLeft />
          </button>
          <h4 style={{ margin: 0 }}>{viewDate.format("MMMM YYYY")}</h4>
          <button className="nav-btn" onClick={() => setViewDate((d) => d.clone().add(1, "month"))}>
            <FiChevronRight />
          </button>
        </div>

        <div
          className="calendar-grid"
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px", marginBottom: "20px" }}
        >
          {[
            t("common.daysShort.sun"),
            t("common.daysShort.mon"),
            t("common.daysShort.tue"),
            t("common.daysShort.wed"),
            t("common.daysShort.thu"),
            t("common.daysShort.fri"),
            t("common.daysShort.sat"),
          ].map((d) => (
            <div
              key={d}
              style={{ textAlign: "center", fontSize: "0.8rem", color: "#64748b", fontWeight: "600", padding: "5px" }}
            >
              {d}
            </div>
          ))}

          {calendarDays.map((d) => {
            const dateStr = d.format("YYYY-MM-DD");
            const entry = holidays.find((h) => h.split("|")[0] === dateStr);
            const isCurrentMonth = d.month() === viewDate.month();

            return (
              <div
                key={dateStr}
                onClick={() => toggleDay(d)}
                style={{
                  height: "60px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  background: entry ? "#eff6ff" : isCurrentMonth ? "#fff" : "#f8fafc",
                  borderColor: entry ? "#3b82f6" : "#e2e8f0",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  opacity: isCurrentMonth ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: entry ? "bold" : "normal",
                      color: entry ? "#2563eb" : "#1e293b",
                    }}
                  >
                    {d.date()}
                  </span>
                  {entry && <FiTrash2 size={12} color="#ef4444" onClick={(e) => removeHoliday(e, dateStr)} />}
                </div>
                {entry && (
                  <div
                    style={{
                      fontSize: "0.65rem",
                      color: "#3b82f6",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {entry.split("|")[1]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: "10px",
            background: "#f8fafc",
            borderRadius: "8px",
            fontSize: "0.85rem",
            color: "#64748b",
            marginBottom: "20px",
          }}
        >
          {t("pages.attendancePolicy.clickDayHint")}
        </div>

        <div className="modal-actions">
          <button className="btn outline" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" onClick={() => onSave(holidays)}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
