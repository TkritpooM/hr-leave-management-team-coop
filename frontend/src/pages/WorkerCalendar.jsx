// src/pages/WorkerCalendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerCalendar.css";
import WorkerDateModal from "../components/WorkerModal";

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

export default function WorkerCalendar() {
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

  const weeks = useMemo(
    () => getMonthMatrix(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

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
      axios.get("http://localhost:8000/api/admin/attendance-policy", getAuthHeader()), // ✅ ดึงวันหยุด
    ]);
    setAttendance(attRes.data.records || []);
    setLeaves(leaveRes.data.requests || []);
    setSpecialHolidays(policyRes.data.policy?.specialHolidays || []); // ✅ เก็บวันหยุด
  } catch (e) { console.error(e); }
  finally { setLoading(false); }
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

  // map leaves by date range (✅ เพิ่ม approvedBy/approvalDate)
  const leaveByDate = useMemo(() => {
    const map = {};
    leaves
      .filter((l) => l.status !== "Rejected")
      .forEach((l) => {
        let cur = moment(l.startDate).startOf("day");
        const end = moment(l.endDate).startOf("day");

        while (cur.isSameOrBefore(end, "day")) {
          const key = cur.format("YYYY-MM-DD");
          if (!map[key]) map[key] = [];

          const approvedByName = l?.approvedByHR
            ? `${l.approvedByHR.firstName || ""} ${l.approvedByHR.lastName || ""}`.trim()
            : "";

          map[key].push({
            type: "leave",
            leaveType: l.leaveType?.typeName || "Leave",
            colorCode: l.leaveType?.colorCode || "#3b82f6",
            status: l.status,
            reason: l.reason || "-",
            startDate: l.startDate,
            endDate: l.endDate,

            // ✅ NEW: ใครอนุมัติ + เวลาอนุมัติ (ต้องให้ backend ส่ง approvedByHR มาด้วย)
            approvedByHR: l.approvedByHR || null,
            approvedByName,
            approvalDate: l.approvalDate || null,
          });

          cur.add(1, "day");
        }
      });
    return map;
  }, [leaves]);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", {
    month: "long",
  });

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

    let modalData = null;

    const isHoliday = specialHolidays.includes(isoDate);

    if (isHoliday) {
    modalData = {
      type: "holiday",
      status: "Company Holiday",
      reason: "This is a pre-announced company non-working day.",
    };
  } else if (leave) {
      // ✅ leave
      modalData = {
        type: "leave",
        status: leave.status,
        employeeName: "You",
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,

        // ✅ NEW
        approvedByName: leave.approvedByName || "",
        approvedByHR: leave.approvedByHR || null,
        approvalDate: leave.approvalDate || null,
      };
    } else if (att) {
      // attendance
      modalData = {
        type: "attendance",
        status: att.isLate ? "Late" : "Normal",
        employeeName: "You",
        checkIn: att.checkInTime,
        checkOut: att.checkOutTime,
        reason: "-",
      };
    } else {
      // no data
      modalData = {
        type: "nodata",
        status: "No Data",
        employeeName: "You",
        reason: "-",
      };
    }

    setSelectedDailyData(modalData);
    setModalOpen(true);
  };

  return (
    <div className="page-card wc">
      <header className="wc-head">
        <div>
          <h1 className="wc-title">My Calendar</h1>
          <p className="wc-sub">
            Attendance + Leave (monthly view){loading ? " • Loading..." : ""}
          </p>
        </div>
        <div className="wc-top-actions">
          <button className="nav-btn" onClick={goPrevMonth} type="button">
            ‹
          </button>
          <div className="month-label">
            {monthName} {viewYear}
          </div>
          <button className="nav-btn" onClick={goNextMonth} type="button">
            ›
          </button>
          <button
            className="btn outline small"
            onClick={() => handleDateClick(toISODate(new Date()))}
            type="button"
          >
            Today
          </button>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar-head">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div className="cal-cell head" key={d}>
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

            return (
              <div
                key={iso}
                className={`cal-cell ${!inMonth ? "muted" : ""} ${
                  iso === selectedDate ? "selected" : ""
                }`}
                onClick={() => handleDateClick(iso)}
              >
                <div className="cal-date-row">
                  <div className="cal-date">{d.getDate()}</div>
                </div>

                <div className="wc-tags">
                  {att && (
                    <span className={`wc-tag ${att.isLate ? "late" : "ok"}`}>
                      {att.isLate ? "Late" : "Present"}
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

                  {specialHolidays.includes(iso) && (
                    <span 
                      className="wc-tag" 
                      style={{ 
                        backgroundColor: "#64748b", // สีเทาเข้มเพื่อให้ดูต่างจากการลา
                        color: "#fff",
                        fontSize: "10px",
                        padding: "2px 4px",
                        display: "block",
                        marginTop: "2px"
                      }}
                    >
                      Company Holiday
                    </span>
                  )}
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
