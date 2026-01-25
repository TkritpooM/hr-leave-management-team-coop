import React, { useEffect, useMemo, useState } from "react";
import "./HRAttendancePolicy.css";
import { alertConfirm, alertSuccess, alertError } from "../utils/sweetAlert";
import { useAuth } from "../context/AuthContext";
import axiosClient from "../api/axiosClient";
import "react-datepicker/dist/react-datepicker.css";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { FiCalendar, FiX } from "react-icons/fi";
import DatePicker from "react-datepicker";
import { enUS, th as thLocale, ja as jaLocale } from "date-fns/locale";
import HolidayManagerModal from "../components/HolidayManagerModal";

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
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const canManage = isAdmin || user?.permissions?.includes('manage_attendance_policy');

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
          {canManage && (
            <>
              <button className="btn outline" type="button" onClick={reset} disabled={saving}>
                {t("common.reset")}
              </button>
              <button className="btn primary" type="button" onClick={save} disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="hrp-grid">
        <div className="hrp-col-left">
          <section className="hrp-card hrp-work-policy">
            <h3 className="hrp-card-title">{t("pages.attendancePolicy.workPolicyTitle")}</h3>

            <div className="hrp-row">
              <div className="hrp-field">
                <label>{t("pages.attendancePolicy.startTime")}</label>
                <input
                  type="time"
                  value={policy.startTime}
                  disabled={!canManage}
                  onChange={(e) => setPolicy((p) => ({ ...p, startTime: e.target.value }))}
                />
              </div>

              <div className="hrp-field">
                <label>{t("pages.attendancePolicy.endTime")}</label>
                <input
                  type="time"
                  min={policy.startTime}
                  value={policy.endTime}
                  disabled={!canManage}
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
                  disabled={!canManage}
                  onChange={(e) => handleBreakStartChange(e.target.value)}
                />
              </div>

              <div className="hrp-field">
                <label>{t("pages.attendancePolicy.breakend")}</label>
                <input
                  type="time"
                  min={policy.breakStartTime}
                  value={policy.breakEndTime}
                  disabled={!canManage}
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
                  disabled={!canManage}
                  onChange={(e) => setPolicy((p) => ({ ...p, graceMinutes: clampInt(e.target.value, 0, 180) }))}
                />
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
                      disabled={!canManage}
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

          <section className="hrp-card hrp-leave-gap">
            <h3 className="hrp-card-title">{t("pages.attendancePolicy.leaveGapTitle")}</h3>
            <div className="hrp-content-row">
              <div className="hrp-gap-control">
                <p className="hrp-sub2">{t("pages.attendancePolicy.leaveGapDesc")}</p>
                <div className="hrp-field-row">
                  <label>{t("pages.attendancePolicy.leaveGapLabel")}</label>
                  <div className="hrp-input-group">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={policy.leaveGapDays || 0}
                      disabled={!canManage}
                      onChange={(e) => setPolicy((p) => ({ ...p, leaveGapDays: clampInt(e.target.value, 0, 30) }))}
                    />
                    <span>{t("pages.attendancePolicy.days")}</span>
                  </div>
                </div>
              </div>
              <div className="policy-tips compact">
                <h4 className="tips-title">
                  <span className="dot"></span>
                  {t("pages.attendancePolicy.tipsTitle")}
                </h4>
                <ul className="tips-list">
                  <li>{t("pages.attendancePolicy.tip1")}</li>
                  <li>{t("pages.attendancePolicy.tip2")}</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="hrp-col-right">
          <section className="hrp-card hrp-special-holidays full-height">
            <div className="hrp-header-row">
              <h3 className="hrp-card-title">
                {t("pages.attendancePolicy.specialHolidaysTitle")}
              </h3>
              {canManage && (
                <button className="btn outline small icon-btn" onClick={() => setShowHolidayModal(true)}>
                  <FiCalendar /> {t("pages.attendancePolicy.manageHolidays")}
                </button>
              )}
            </div>

            <div className="policy-filter-bar compact">
              <div className="filter-inputs">
                <DatePicker
                  selected={filterStart}
                  onChange={(date) => setFilterStart(date)}
                  dateFormat="yyyy-MM-dd"
                  locale={datePickerLocale}
                  className="wa-datepicker-input"
                  placeholderText={t("common.startDate")}
                />
                <span className="sep">-</span>
                <DatePicker
                  selected={filterEnd}
                  onChange={(date) => setFilterEnd(date)}
                  dateFormat="yyyy-MM-dd"
                  locale={datePickerLocale}
                  className="wa-datepicker-input"
                  placeholderText={t("common.endDate")}
                  minDate={filterStart || undefined}
                />
              </div>
              {(filterStart || filterEnd) && (
                <button
                  type="button"
                  className="policy-filter-clear"
                  onClick={() => {
                    setFilterStart(null);
                    setFilterEnd(null);
                  }}
                >
                  <FiX />
                </button>
              )}
            </div>

            <div className="hrp-holiday-container">
              {!policy.specialHolidays || policy.specialHolidays.length === 0 ? (
                <div className="hrp-empty-state">
                  <div className="empty-icon">🏖️</div>
                  <p>{t("pages.attendancePolicy.noHolidays")}</p>
                </div>
              ) : (
                <>
                  {filteredHolidays.length === 0 ? (
                    <div className="hrp-empty-state">
                      <p>{t("pages.attendancePolicy.noHolidaysInRange")}</p>
                    </div>
                  ) : (
                    <div className="hrp-holiday-list-scroll">
                      {filteredHolidays.map((entry) => {
                        const [d, desc] = entry.split("|");
                        const mDate = moment(d);
                        return (
                          <div key={entry} className="hrp-holiday-item">
                            <div className="date-badge">
                              <span className="month">{mDate.format("MMM")}</span>
                              <span className="day">{mDate.format("DD")}</span>
                            </div>

                            <div className="holiday-info">
                              <div className="holiday-name">
                                {desc || t("pages.attendancePolicy.companyHoliday")}
                              </div>
                              <div className="holiday-meta">{mDate.format("dddd, YYYY")}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
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


