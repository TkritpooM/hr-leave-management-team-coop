import React, { useEffect, useMemo, useState } from "react";
import "./HRAttendancePolicy.css";
import { alertConfirm, alertSuccess, alertError } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from 'date-fns/locale';

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const defaultPolicy = {
  startTime: "09:00",
  endTime: "18:00",
  graceMinutes: 5,
  workingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  specialHolidays: [],
  leaveGapDays: 0, // ค่าเริ่มต้นของนโยบายระยะห่างการลา
};

const clampInt = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

export default function HRAttendancePolicy() {
  const [policy, setPolicy] = useState(defaultPolicy);
  const [holidayInput, setHolidayInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        const res = await axiosClient.get("/admin/attendance-policy");
        const data = res.data.policy;
        
        // แปลง "mon,tue" จาก DB เป็น Object {mon: true, tue: true}
        const daysArr = data.workingDays ? data.workingDays.split(",") : [];
        const daysObj = {};
        DAYS.forEach(d => daysObj[d.key] = daysArr.includes(d.key));

        setPolicy({ 
          ...data, 
          workingDays: daysObj,
          specialHolidays: data.specialHolidays || [],
          leaveGapDays: data.leaveGapDays || 0
        });
      } catch (err) {
        console.error("Load policy error", err);
      }
    };
    fetchPolicy();
  }, []);

  const workingSummary = useMemo(() => {
    const on = DAYS.filter((d) => policy.workingDays?.[d.key]).map((d) => d.label);
    return on.length ? on.join(", ") : "—";
  }, [policy.workingDays]);

  const save = async () => {
    const ok = await alertConfirm(
      "Save Attendance Policy",
      "This will update work policy and leave restrictions used by the system.",
      "Save"
    );
    if (!ok) return;

    try {
      setSaving(true);
      const daysStr = Object.keys(policy.workingDays)
        .filter(key => policy.workingDays[key])
        .join(",");

      await axiosClient.put("/admin/attendance-policy", {
        startTime: policy.startTime,
        endTime: policy.endTime,
        graceMinutes: policy.graceMinutes,
        workingDays: daysStr,
        leaveGapDays: policy.leaveGapDays,
        specialHolidays: policy.specialHolidays
      });
      
      await alertSuccess("Saved", "Policy updated in database!");
    } catch (e) {
      console.error(e);
      await alertError("Error", "Failed to save to database.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    const ok = await alertConfirm(
      "Reset to Default",
      "This will reset all policy values to default.",
      "Reset"
    );
    if (!ok) return;
    try {
      const daysStr = "mon,tue,wed,thu,fri";
      await axiosClient.put("/admin/attendance-policy", {
        ...defaultPolicy,
        workingDays: daysStr,
        specialHolidays: []
      });
      setPolicy(defaultPolicy);
      await alertSuccess("Reset", "Policy reset to default in database.");
    } catch (e) {
      await alertError("Error", "Cannot reset policy.");
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
          <h1 className="hrp-title">Attendance Settings</h1>
          <p className="hrp-sub">
            Configure work start/end time, leave restrictions, and company holidays.
          </p>
        </div>

        <div className="hrp-actions">
          <button className="btn outline" type="button" onClick={reset} disabled={saving}>
            Reset
          </button>
          <button className="btn primary" type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="hrp-grid">
        {/* 1. Work Policy Section */}
        <section className="hrp-card">
          <h3 className="hrp-card-title">Work Policy</h3>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>Start time</label>
              <input
                type="time"
                value={policy.startTime}
                onChange={(e) => setPolicy((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>

            <div className="hrp-field">
              <label>End time (Check-out)</label>
              <input
                type="time"
                value={policy.endTime}
                onChange={(e) => setPolicy((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="hrp-row">
            <div className="hrp-field">
              <label>Late after (grace minutes)</label>
              <input
                type="number"
                min={0}
                max={180}
                value={policy.graceMinutes}
                onChange={(e) => setPolicy((p) => ({ ...p, graceMinutes: clampInt(e.target.value, 0, 180) }))}
              />
            </div>
            <div className="hrp-field" style={{ opacity: 0, pointerEvents: 'none' }}>
               <label>Space</label>
               <input type="text" readOnly />
            </div>
          </div>

          <div className="hrp-divider" />

          <div className="hrp-field">
            <label>Working days</label>
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
            <div className="hrp-hint">Currently: <strong>{workingSummary}</strong></div>
          </div>
        </section>

        {/* 2. Leave Gap Policy Section (ตำแหน่งเดิมของ Special Holidays) */}
        <section className="hrp-card">
          <h3 className="hrp-card-title">Leave Gap Policy</h3>
          <p className="hrp-sub2">
            Set a mandatory minimum rest period between leave requests to ensure workforce availability.
          </p>

          <div className="hrp-field" style={{ marginTop: '20px' }}>
            <label>Minimum days between leave requests</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="number"
                min={0}
                max={30}
                style={{ width: '100px' }}
                value={policy.leaveGapDays || 0}
                onChange={(e) => setPolicy((p) => ({ ...p, leaveGapDays: clampInt(e.target.value, 0, 30) }))}
              />
              <span style={{ color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Days</span>
            </div>
            <div className="hrp-hint" style={{ marginTop: '12px' }}>
              Example: If set to 3, an employee must wait 3 days after an approved leave before taking another.
            </div>
          </div>
        </section>

        {/* 3. Special Holidays Section (ตำแหน่งเดิมของ Shift) */}
        <section className="hrp-card">
          <h3 className="hrp-card-title">Special Holidays</h3>
          <div className="hrp-holiday-row">
            <DatePicker
              selected={holidayInput ? new Date(holidayInput) : null}
              onChange={(date) => setHolidayInput(date.toISOString().split('T')[0])}
              dateFormat="yyyy-MM-dd"
              locale={enUS}
              placeholderText="Select Holiday Date"
              className="hrp-holiday-input"
            />
            <button className="btn outline" type="button" onClick={addHoliday}>Add</button>
          </div>

          {(!policy.specialHolidays || policy.specialHolidays.length === 0) ? (
            <div className="hrp-empty">No holidays added.</div>
          ) : (
            <div className="hrp-holiday-list">
              {policy.specialHolidays.map((d) => (
                <div className="hrp-holiday" key={d}>
                  <span className="hrp-holiday-date">{d}</span>
                  <button className="hrp-holiday-x" type="button" onClick={() => removeHoliday(d)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}