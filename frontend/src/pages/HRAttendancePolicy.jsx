import React, { useEffect, useMemo, useState } from "react";
import "./HRAttendancePolicy.css";
import { alertConfirm, alertSuccess, alertError } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import moment from "moment"; // เพิ่ม moment เพื่อช่วยจัดการเรื่องเวลา [+1 hr]

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
  const { t } = useTranslation();

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
  const [holidayInput, setHolidayInput] = useState("");
  const [saving, setSaving] = useState(false);

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
        console.error("Load policy error", err);
      }
    };
    fetchPolicy();
  }, [DAYS]);

  const workingSummary = useMemo(() => {
    const on = DAYS.filter((d) => policy.workingDays?.[d.key]).map((d) => d.label);
    return on.length ? on.join(", ") : "—";
  }, [policy.workingDays, DAYS]);

  // ✅ แก้ไข: Logic การเปลี่ยนเวลาเริ่มพัก และบังคับเวลาจบพัก +1 ชม.
  const handleBreakStartChange = (val) => {
    const newBreakEnd = moment(val, "HH:mm").add(1, "hours").format("HH:mm");
    setPolicy((p) => ({ 
      ...p, 
      breakStartTime: val, 
      breakEndTime: newBreakEnd // อัปเดตให้หลัง 1 ชม. อัตโนมัติ
    }));
  };

  const save = async () => {
    // START TIME < BREAK START < BREAK END < END TIME
    if (policy.breakStartTime <= policy.startTime) {
      return alertError(t("common.error"), "เวลาเริ่มพัก (Break Start) ต้องอยู่หลังเวลาเริ่มงาน (Start Time)");
    }
    if (policy.breakEndTime <= policy.breakStartTime) {
      return alertError(t("common.error"), "เวลาจบพัก (Break End) ต้องอยู่หลังเวลาเริ่มพัก (Break Start)");
    }
    if (policy.endTime <= policy.breakEndTime) {
      return alertError(t("common.error"), "เวลาเลิกงาน (End Time) ต้องอยู่หลังเวลาจบพัก (Break End)");
    }

    const ok = await alertConfirm(t("pages.attendancePolicy.saveTitle"), t("pages.attendancePolicy.saveDesc"), t("common.save"));
    if (!ok) return;

    try {
      setSaving(true);
      const daysStr = Object.keys(policy.workingDays || {}).filter((key) => policy.workingDays[key]).join(",");

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
    const ok = await alertConfirm(t("pages.attendancePolicy.resetTitle"), t("pages.attendancePolicy.resetDesc"), t("common.reset"));
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

  const addHoliday = () => {
    const d = holidayInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    setPolicy((p) => {
      const set = new Set(p.specialHolidays || []);
      set.add(d);
      return { ...p, specialHolidays: Array.from(set).sort() };
    });
    setHolidayInput("");
  };

  const removeHoliday = (d) => {
    setPolicy((p) => ({ ...p, specialHolidays: (p.specialHolidays || []).filter((x) => x !== d) }));
  };

  return (
    <div className="page-card hr-policy">
      <div className="hrp-head">
        <div>
          <h1 className="hrp-title">{t("pages.attendancePolicy.title")}</h1>
          <p className="hrp-sub">{t("pages.attendancePolicy.subtitle")}</p>
        </div>
        <div className="hrp-actions">
          <button className="btn outline" type="button" onClick={reset} disabled={saving}>{t("common.reset")}</button>
          <button className="btn primary" type="button" onClick={save} disabled={saving}>{saving ? t("common.saving") : t("common.save")}</button>
        </div>
      </div>

      <div className="hrp-grid">
        <section className="hrp-card">
          <h3 className="hrp-card-title">{t("pages.attendancePolicy.workPolicyTitle")}</h3>
          <div className="hrp-row">
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.startTime")}</label>
              <input type="time" value={policy.startTime} onChange={(e) => setPolicy((p) => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.endTime")}</label>
              {/* ✅ บังคับให้ End Time ต้องหลัง Start Time */}
              <input type="time" min={policy.startTime} value={policy.endTime} onChange={(e) => setPolicy((p) => ({ ...p, endTime: e.target.value }))} />
            </div>
          </div>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>เวลาเริ่มพัก (Break Start)</label>
              <input type="time" value={policy.breakStartTime} onChange={(e) => handleBreakStartChange(e.target.value)} />
            </div>
            <div className="hrp-field">
              <label>เวลาจบพัก (Break End)</label>
              {/* ✅ บังคับไม่ให้เลือกเวลาก่อนหน้า Break Start */}
              <input type="time" min={policy.breakStartTime} value={policy.breakEndTime} onChange={(e) => setPolicy((p) => ({ ...p, breakEndTime: e.target.value }))} />
            </div>
          </div>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>{t("pages.attendancePolicy.graceMinutes")}</label>
              <input type="number" min={0} max={180} value={policy.graceMinutes} onChange={(e) => setPolicy((p) => ({ ...p, graceMinutes: clampInt(e.target.value, 0, 180) }))} />
            </div>
            <div className="hrp-field" style={{ opacity: 0, pointerEvents: "none" }}><label>{t("common.space")}</label><input type="text" readOnly /></div>
          </div>

          <div className="hrp-divider" />
          <div className="hrp-field">
            <label>{t("pages.attendancePolicy.workingDays")}</label>
            <div className="hrp-days">
              {DAYS.map((d) => (
                <label className="hrp-day" key={d.key}>
                  <input type="checkbox" checked={!!policy.workingDays?.[d.key]} onChange={(e) => setPolicy((p) => ({ ...p, workingDays: { ...p.workingDays, [d.key]: e.target.checked } }))} />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
            <div className="hrp-hint">{t("pages.attendancePolicy.currently")}: <strong>{workingSummary}</strong></div>
          </div>
        </section>

        <section className="hrp-card">
          <h3 className="hrp-card-title">{t("pages.attendancePolicy.leaveGapTitle")}</h3>
          <p className="hrp-sub2">{t("pages.attendancePolicy.leaveGapDesc")}</p>
          <div className="hrp-field" style={{ marginTop: "20px" }}>
            <label>{t("pages.attendancePolicy.leaveGapLabel")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input type="number" min={0} max={30} style={{ width: "100px" }} value={policy.leaveGapDays || 0} onChange={(e) => setPolicy((p) => ({ ...p, leaveGapDays: clampInt(e.target.value, 0, 30) }))} />
              <span style={{ color: "#64748b", fontSize: "14px", fontWeight: "500" }}>{t("pages.attendancePolicy.days")}</span>
            </div>
            <div className="hrp-hint" style={{ marginTop: "12px" }}>{t("pages.attendancePolicy.leaveGapExample")}</div>
          </div>
        </section>

        <section className="hrp-card">
          <h3 className="hrp-card-title">{t("pages.attendancePolicy.specialHolidaysTitle")}</h3>
          <div className="hrp-holiday-row">
            <DatePicker
              selected={holidayInput ? new Date(`${holidayInput}T00:00:00`) : null}
              onChange={(date) => {
                if (!date) {
                  setHolidayInput("");
                  return;
                }
                // ✅ แก้ไข: ใช้การดึงส่วนประกอบวันที่โดยตรงแทน ISOString เพื่อป้องกันวันที่ลดลง 1 วัน
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                setHolidayInput(`${year}-${month}-${day}`);
              }}
              dateFormat="yyyy-MM-dd"
              locale={enUS}
              placeholderText={t("pages.attendancePolicy.selectHolidayDate")}
              className="hrp-holiday-input"
            />
            <button className="btn outline" type="button" onClick={addHoliday}>{t("common.add")}</button>
          </div>
          {!policy.specialHolidays || policy.specialHolidays.length === 0 ? (
            <div className="hrp-empty">{t("pages.attendancePolicy.noHolidays")}</div>
          ) : (
            <div className="hrp-holiday-list">
              {policy.specialHolidays.map((d) => (
                <div className="hrp-holiday" key={d}>
                  <span className="hrp-holiday-date">{d}</span>
                  <button className="hrp-holiday-x" type="button" onClick={() => removeHoliday(d)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}