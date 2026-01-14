// src/pages/WorkerCalendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerCalendar.css";
import WorkerDateModal from "../components/WorkerModal";
import { useTranslation } from "react-i18next";

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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

// 🔥 Helper Function แปลง "mon,tue" -> [1, 2]
const parseWorkingDays = (str) => {
  if (!str) return [1, 2, 3, 4, 5]; // Default Mon-Fri
  const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return str
    .split(",")
    .map((d) => dayMap[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
};

export default function WorkerCalendar() {
  const { t, i18n } = useTranslation();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(toISODate(new Date()));

  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDailyData, setSelectedDailyData] = useState(null);

  const [specialHolidays, setSpecialHolidays] = useState([]);

  // 🔥 State เก็บวันทำงาน (Array ตัวเลข)
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchMonthData = async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes, policyRes] = await Promise.all([
        axios.get("http://localhost:8000/api/timerecord/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/leave/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/admin/attendance-policy", getAuthHeader()),
      ]);

      setAttendance(attRes.data.records || []);
      setLeaves(leaveRes.data.requests || []);

      const policy = policyRes.data.policy;

      // 🔥 แปลงค่าจาก String เป็น Array
      if (policy?.workingDays) {
        const days = parseWorkingDays(policy.workingDays);
        setWorkingDays(days);
      }

      setSpecialHolidays(policy?.specialHolidays || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData();
  }, []);

  // map attendance by date
  const attByDate = useMemo(() => {
    const map = {};
    attendance.forEach((r) => {
      const d = (r.workDate || "").slice(0, 10);
      if (!d) return;
      map[d] = r;
    });
    return map;
  }, [attendance]);

  // map leaves by date range
  const leaveByDate = useMemo(() => {
    const map = {};
    leaves
      .filter((l) => l.status !== "Rejected" && l.status !== "Cancelled")
      .forEach((l) => {
        let cur = moment(l.startDate).startOf("day");
        const end = moment(l.endDate).startOf("day");

        while (cur.isSameOrBefore(end, "day")) {
          const key = cur.format("YYYY-MM-DD");
          if (!map[key]) map[key] = [];

          const approvedByName = l?.approvedByHR
            ? `${l.approvedByHR.firstName || ""} ${l.approvedByHR.lastName || ""}`.trim()
            : "";

          const isStartDay = cur.isSame(moment(l.startDate), "day");
          const isEndDay = cur.isSame(moment(l.endDate), "day");

          map[key].push({
            type: "leave",
            leaveType: l.leaveType?.typeName || t("common.leave", "Leave"),
            colorCode: l.leaveType?.colorCode || "#3b82f6",
            status: l.status,
            reason: l.reason || "-",
            startDate: l.startDate,
            endDate: l.endDate,
            startDuration: l.startDuration,
            endDuration: l.endDuration,
            isStartDay,
            isEndDay,
            approvedByHR: l.approvedByHR || null,
            approvedByName,
            approvalDate: l.approvalDate || null,
          });

          cur.add(1, "day");
        }
      });
    return map;
  }, [leaves, t]);

  // ✅ แสดงชื่อเดือนตามภาษา
  const monthName = useMemo(() => {
    return moment({ year: viewYear, month: viewMonth, day: 1 }).locale(mLocale).format("MMMM");
  }, [viewYear, viewMonth, mLocale]);

  const weekdays = useMemo(
    () => [
      t("pages.workerCalendar.weekdays.sun"),
      t("pages.workerCalendar.weekdays.mon"),
      t("pages.workerCalendar.weekdays.tue"),
      t("pages.workerCalendar.weekdays.wed"),
      t("pages.workerCalendar.weekdays.thu"),
      t("pages.workerCalendar.weekdays.fri"),
      t("pages.workerCalendar.weekdays.sat"),
    ],
    [t]
  );

  const goPrevMonth = () => {
    const m = viewMonth - 1;
    if (m < 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth(m);
  };

  const goNextMonth = () => {
    const m = viewMonth + 1;
    if (m > 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth(m);
  };

  // Function จัดการเมื่อกดวันที่
  const handleDateClick = (isoDate) => {
    setSelectedDate(isoDate);

    const att = attByDate[isoDate];
    const lvs = leaveByDate[isoDate] || [];
    const leave = lvs.length > 0 ? lvs[0] : null;

    const todayStr = toISODate(new Date());
    const isFuture = isoDate > todayStr;
    const dayOfWeek = moment(isoDate).day();

    const isWorkingDay = workingDays.includes(dayOfWeek);
    const holidayEntry = specialHolidays.find(h => h.split("|")[0] === isoDate);
    const isHoliday = !!holidayEntry;

    let modalData = null;

    if (isHoliday) {
      modalData = {
        type: "holiday",
        status: t("pages.workerCalendar.modal.holiday.status"),
        reason: (holidayEntry.split("|")[1]) || t("pages.workerCalendar.modal.holiday.reason"),
      };
    } else if (leave) {
      modalData = {
        type: "leave",
        status: leave.status,
        employeeName: t("pages.workerCalendar.modal.common.you"),
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        startDuration: leave.startDuration,
        endDuration: leave.endDuration,
        isStartDay: leave.isStartDay,
        isEndDay: leave.isEndDay,
        approvedByName: leave.approvedByName || "",
        approvedByHR: leave.approvedByHR || null,
        approvalDate: leave.approvalDate || null,
        reason: leave.reason,
      };
    } else if (!isWorkingDay) {
      modalData = {
        type: "weekend",
        status: t("pages.workerCalendar.modal.weekend.status"),
        reason: t("pages.workerCalendar.modal.weekend.reason"),
      };
    } else if (isFuture) {
      modalData = {
        type: "future",
        status: t("pages.workerCalendar.modal.future.status"),
        reason: t("pages.workerCalendar.modal.future.reason"),
      };
    } else if (att) {
      modalData = {
        type: "attendance",
        status: att.isLate
          ? t("pages.workerCalendar.tags.late")
          : t("pages.workerCalendar.tags.normal"),
        employeeName: t("pages.workerCalendar.modal.common.you"),
        checkIn: att.checkInTime,
        checkOut: att.checkOutTime,
        reason: "-",
      };
    } else {
      modalData = {
        type: "nodata",
        status: t("pages.workerCalendar.modal.noData.status"),
        employeeName: t("pages.workerCalendar.modal.common.you"),
        reason: t("pages.workerCalendar.modal.noData.reason"),
      };
    }

    setSelectedDailyData(modalData);
    setModalOpen(true);
  };

  return (
    <div className="page-card wc">
      <header className="wc-head">
        <div>
          <h1 className="wc-title">{t("pages.workerCalendar.title")}</h1>
          <p className="wc-sub">
            {t("pages.workerCalendar.subtitle")}
            {loading ? ` • ${t("common.loading")}` : ""}
          </p>
        </div>

        <div className="wc-top-actions">
          <button className="nav-btn" onClick={goPrevMonth} type="button" aria-label={t("pages.workerCalendar.prevMonth")}>
            ‹
          </button>

          <div className="month-label">
            {monthName} {viewYear}
          </div>

          <button className="nav-btn" onClick={goNextMonth} type="button" aria-label={t("pages.workerCalendar.nextMonth")}>
            ›
          </button>

          <button
            className="btn outline small"
            onClick={() => handleDateClick(toISODate(new Date()))}
            type="button"
          >
            {t("pages.workerCalendar.today")}
          </button>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar-head">
          {weekdays.map((d, idx) => (
            <div className="cal-cell head" key={`${d}-${idx}`}>
              {d}
            </div>
          ))}
        </div>

        <div className="calendar-body">
          {weeks.flat().map((d) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === viewMonth;
            const att = attByDate[iso];
            const lvs = leaveByDate[iso] || [];

            // 🔥 Logic เช็ควันทำงานเพื่อใส่สีเทา
            const dayOfWeek = d.getDay();
            const isWorkingDay = workingDays.includes(dayOfWeek);

            let cellClass = "cal-cell";
            if (!inMonth) cellClass += " muted";
            if (!isWorkingDay) cellClass += " non-working";
            if (iso === selectedDate) cellClass += " selected";

            return (
              <div key={iso} className={cellClass} onClick={() => handleDateClick(iso)}>
                <div className="cal-date-row">
                  <div className="cal-date">{d.getDate()}</div>
                </div>

                <div className="wc-tags">
                  {att && (
                    <span className={`wc-tag ${att.isLate ? "late" : "ok"}`}>
                      {att.isLate ? t("pages.workerCalendar.tags.late") : t("pages.workerCalendar.tags.present")}
                    </span>
                  )}

                  {lvs.map((lv, idx) => (
                    <span
                      key={idx}
                      className="wc-tag leave"
                      style={{
                        backgroundColor: lv.colorCode,
                        color: "#fff",
                        fontSize: "10px",
                        padding: "2px 4px",
                        display: "block",
                        marginTop: "2px",
                      }}
                    >
                      {lv.leaveType}
                    </span>
                  ))}

                  {(() => {
                    const holiday = specialHolidays.find(h => h.split("|")[0] === iso);
                    if (holiday) {
                      const hDesc = holiday.split("|")[1];
                      return (
                        <span
                          className="wc-tag"
                          style={{
                            backgroundColor: "#64748b",
                            color: "#fff",
                            fontSize: "10px",
                            padding: "2px 4px",
                            display: "block",
                            marginTop: "2px",
                          }}
                        >
                          {hDesc || t("pages.workerCalendar.companyHoliday")}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WorkerDateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        date={selectedDate}
        data={selectedDailyData}
      />
    </div>
  );
}
