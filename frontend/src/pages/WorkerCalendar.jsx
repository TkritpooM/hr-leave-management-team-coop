// src/pages/WorkerCalendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerCalendar.css";
// import Pagination from "../components/Pagination"; // ไม่ได้ใช้แล้วค่ะ
import WorkerDateModal from "../components/WorkerModal"; // ชื่อไฟล์ใหม่

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

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

  const weeks = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchMonthData = async () => {
    setLoading(true);
    try {
      const [attRes, leaveRes] = await Promise.all([
        axios.get("http://localhost:8000/api/timerecord/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/leave/my", getAuthHeader()),
      ]);

      setAttendance(attRes.data.records || []);
      setLeaves(leaveRes.data.requests || []);
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
      .filter((l) => l.status !== "Rejected")
      .forEach((l) => {
        let cur = moment(l.startDate).startOf("day");
        const end = moment(l.endDate).startOf("day");

        while (cur.isSameOrBefore(end, "day")) {
          const key = cur.format("YYYY-MM-DD");
          if (!map[key]) map[key] = [];
          map[key].push({
            type: "leave", // ระบุ type ให้ชัดเจนสำหรับ Modal
            leaveType: l.leaveType?.typeName || "Leave",
            status: l.status,
            reason: l.reason || "-",
            // เพิ่ม Start/End จริงของ Request เพื่อไปโชว์ใน Modal
            startDate: l.startDate,
            endDate: l.endDate
          });
          cur.add(1, "day");
        }
      });
    return map;
  }, [leaves]);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString("en-US", { month: "long" });

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
    const leave = lvs.length > 0 ? lvs[0] : null; // ดึงรายการลาแรก (ถ้ามี)

    let modalData = null;

    if (leave) {
      // กรณีวันลา
      modalData = {
        type: 'leave',
        status: leave.status,
        employeeName: "You", // หรือดึงชื่อจาก Context/Profile ถ้ามี
        leaveType: leave.leaveType,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason
      };
    } else if (att) {
      // กรณีวันทำงานปกติ
      modalData = {
        type: 'attendance',
        status: att.isLate ? 'Late' : 'Normal',
        employeeName: "You",
        checkIn: att.checkInTime,
        checkOut: att.checkOutTime,
        reason: "-"
      };
    } else {
      // กรณีไม่มีข้อมูล
      modalData = {
        type: 'nodata',
        status: 'No Data',
        employeeName: "You",
        reason: "-"
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
          <p className="wc-sub">Attendance + Leave (monthly view)</p>
        </div>
        <div className="wc-top-actions">
          <button className="nav-btn" onClick={goPrevMonth} type="button">‹</button>
          <div className="month-label">{monthName} {viewYear}</div>
          <button className="nav-btn" onClick={goNextMonth} type="button">›</button>
          <button className="btn outline small" onClick={() => handleDateClick(toISODate(new Date()))} type="button">
            Today
          </button>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar-head">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div className="cal-cell head" key={d}>{d}</div>
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
                className={`cal-cell ${!inMonth ? "muted" : ""} ${iso === selectedDate ? "selected" : ""}`}
                onClick={() => handleDateClick(iso)} // เปลี่ยนมาใช้ฟังก์ชันใหม่
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
                  {lvs.length > 0 && (
                    <span className="wc-tag leave">Leave {lvs.length}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* เรียกใช้ Modal แทน Section Detail เดิม */}
      <WorkerDateModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        date={selectedDate}
        data={selectedDailyData}
      />
      
    </div>
  );
}