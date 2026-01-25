import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  FiX,
  FiClock,
  FiCalendar,
  FiCheck,
  FiInfo,
  FiUserX,
  FiSunrise,
  FiCoffee,
} from "react-icons/fi";
import moment from "moment";
import "moment/locale/th";
import { useTranslation } from "react-i18next";

export default function DailyDetailModal({ isOpen, onClose, date, data, workingDays = [1, 2, 3, 4, 5] }) {
  const { t, i18n } = useTranslation();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const [activeTab, setActiveTab] = useState("present");

  const dateStatus = useMemo(() => {
    if (!date) return {};
    const selected = moment(date).startOf("day");
    const today = moment().startOf("day");
    const isFuture = selected.isAfter(today);
    const isWeekend = !workingDays.includes(selected.day());
    const isSpecialHoliday = data?.isSpecialHoliday || false;
    return { isFuture, isWeekend, isSpecialHoliday };
  }, [date, data, workingDays]);

  const { isFuture, isWeekend, isSpecialHoliday } = dateStatus;
  const isHoliday = isWeekend || isSpecialHoliday;

  useEffect(() => {
    if (isOpen) {
      if ((isHoliday || isFuture) && activeTab !== "present") {
        setActiveTab("present");
      }
    }
  }, [isOpen, date, isHoliday, isFuture, activeTab]);

  if (!isOpen || !data) return null;

  const { present = [], leaves = [], absent = [], summary = {} } = data;

  const tabPresentLabel = isHoliday
    ? t("components.dailyDetailModal.workingOT", "Working (OT)")
    : t("components.dailyDetailModal.present", "Present");

  // ✅ Helper: Render Shift Badge for Leave Tab
  const renderLeaveShiftBadge = (l) => {
    // 1. ตรวจสอบกรณีลาครึ่งเช้า (Morning)
    // เช็คทั้งกรณีลาวันเดียว (start=end) และกรณีวันเริ่มต้นของการลาต่อเนื่อง
    if (l.startDuration === "HalfMorning" || l.endDuration === "HalfMorning") {
      return (
        <span style={shiftBadgeStyle("#e0f2fe", "#0369a1")}>
          <FiSunrise size={12} /> {t("pages.hrAttendancePage.halfMorning", "Morning")}
        </span>
      );
    }

    // 2. ตรวจสอบกรณีลาครึ่งบ่าย (Afternoon)
    if (l.startDuration === "HalfAfternoon" || l.endDuration === "HalfAfternoon") {
      return (
        <span style={shiftBadgeStyle("#ffedd5", "#9a3412")}>
          <FiCoffee size={12} /> {t("pages.hrAttendancePage.halfAfternoon", "Afternoon")}
        </span>
      );
    }

    // 3. กรณีอื่นๆ หรือค่าที่เป็น 'Full' ให้แสดง Full Day
    return (
      <span style={shiftBadgeStyle("#f1f5f9", "#475569")}>
        {t("pages.hrAttendancePage.fullDay", "Full Day")}
      </span>
    );
  };

  return ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal daily-modal"
        style={{
          borderRadius: "16px",
          padding: "0",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", background: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "10px" }}>
                <FiCalendar style={{ color: "#64748b" }} />
                {t("components.dailyDetailModal.dailyDetailsFor", "Daily Details for")}{" "}
                {moment(date).locale(mLocale).format("DD MMM YYYY")}
              </h3>

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                {isFuture && <span style={statusBadgeStyle("#eff6ff", "#3b82f6")}>{t("components.dailyDetailModal.upcomingDate", "Upcoming Date")}</span>}
                {isSpecialHoliday && <span style={statusBadgeStyle("#fef2f2", "#ef4444")}>{t("components.dailyDetailModal.companyHoliday", "Company Holiday")}</span>}
                {isWeekend && <span style={statusBadgeStyle("#f8fafc", "#64748b")}>{t("components.dailyDetailModal.weekend", "Weekend")}</span>}
                {!isFuture && !isHoliday && <span style={statusBadgeStyle("#f0fdf4", "#22c55e")}>{t("components.dailyDetailModal.regularWorkingDay", "Regular Working Day")}</span>}
              </div>
            </div>

            <button className="close-x" onClick={onClose} style={{ background: "#f8fafc", borderRadius: "50%", padding: "5px", border: "none", cursor: "pointer" }} aria-label={t("common.close", "Close")}>
              <FiX />
            </button>
          </div>

          <div className="hr-tabs" style={{ marginTop: "20px", display: "flex", gap: "8px" }}>
            <TabButton active={activeTab === "present"} onClick={() => setActiveTab("present")} label={tabPresentLabel} count={summary.presentCount || 0} />
            {!isHoliday && !isFuture && (
              <>
                <TabButton active={activeTab === "leave"} onClick={() => setActiveTab("leave")} label={t("components.dailyDetailModal.onLeave", "On Leave")} count={summary.leaveCount || 0} />
                <TabButton active={activeTab === "absent"} onClick={() => setActiveTab("absent")} label={t("components.dailyDetailModal.absent", "Absent")} count={summary.absentCount || 0} isDanger={(summary.absentCount || 0) > 0} />
              </>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column" }}>
          {isHoliday && (summary.presentCount || 0) === 0 && activeTab === "present" ? (
            <HolidayEmptyState t={t} isWeekend={isWeekend} isSpecial={isSpecialHoliday} desc={data.specialHolidayDesc} />
          ) : (
            isFuture && activeTab === "present" && (summary.presentCount || 0) === 0 ? (
              <EmptyState message={t("components.dailyDetailModal.futureNoData", "No attendance data expected yet for this future date.")} icon={<FiSunrise size={48} />} />
            ) : (
              /* ✅ Fix: Show empty state for regular days with 0 present */
              !isHoliday && !isFuture && activeTab === "present" && present.length === 0 && (
                <EmptyState message={t("components.dailyDetailModal.noAttendance", "No check-in records found for this date.")} icon={<FiUserX size={48} />} />
              )
            )
          )}

          {/* ตารางคนมาทำงาน */}
          {activeTab === "present" && present.length > 0 && (
            <table className="table" style={{ borderCollapse: "separate", borderSpacing: "0" }}>
              <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
                <tr>
                  <th style={tableHeadStyle}>{t("components.dailyDetailModal.employee", "Employee")}</th>
                  <th style={tableHeadStyle}>{t("components.dailyDetailModal.checkIn", "Check In")}</th>
                  <th style={tableHeadStyle}>{t("components.dailyDetailModal.checkOut", "Check Out")}</th>
                  <th style={tableHeadStyle}>{t("components.dailyDetailModal.status", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {present.map((r) => (
                  <tr key={r.recordId}>
                    <td style={tableCellStyle}>
                      <strong>{r.employee.firstName} {r.employee.lastName}</strong>
                      {/* ✅ รายละเอียดกะทำงานกรณีลาครึ่งวัน */}
                      {r.halfDayStatus && (
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", fontWeight: "600" }}>
                          {r.halfDayStatus === 'MorningLeave' ? `(Afternoon Shift Only)` : `(Morning Shift Only)`}
                        </div>
                      )}
                    </td>
                    <td style={tableCellStyle}><FiClock size={14} /> {r.checkInTime ? moment(r.checkInTime).locale(mLocale).format("HH:mm") : "--:--"}</td>
                    <td style={tableCellStyle}>{r.checkOutTime ? moment(r.checkOutTime).locale(mLocale).format("HH:mm") : "--:--"}</td>
                    <td style={tableCellStyle}>
                      <span className={`badge ${r.isLate ? "badge-late" : "badge-ok"}`} style={{ fontSize: "0.75rem" }}>
                        {isHoliday ? t("components.dailyDetailModal.otWork", "OT Work") : r.isLate ? t("common.status.late", "Late") : t("common.status.onTime", "On Time")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* รายการลา พร้อมคอลัมน์ Shift ใหม่ */}
          {activeTab === "leave" && !isHoliday && !isFuture && (
            leaves.length > 0 ? (
              <table className="table" style={{ borderCollapse: "separate", borderSpacing: "0" }}>
                <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
                  <tr>
                    <th style={tableHeadStyle}>{t("components.dailyDetailModal.employee", "Employee")}</th>
                    <th style={tableHeadStyle}>{t("components.dailyDetailModal.leaveType", "Leave Type")}</th>
                    <th style={tableHeadStyle}>{t("Shift", "Shift")}</th>
                    <th style={tableHeadStyle}>{t("components.dailyDetailModal.approvedBy", "Approved By")}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.requestId}>
                      <td style={tableCellStyle}><strong>{l.employee.firstName} {l.employee.lastName}</strong></td>
                      <td style={tableCellStyle}>
                        <span style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: "20px", fontWeight: "800", backgroundColor: `${l.leaveType?.colorCode || "#3b82f6"}15`, color: l.leaveType?.colorCode || "#3b82f6", border: `1px solid ${l.leaveType?.colorCode || "#3b82f6"}30` }}>
                          {l.leaveType?.typeName || t("common.leave", "Leave")}
                        </span>
                      </td>
                      <td style={tableCellStyle}>{renderLeaveShiftBadge(l)}</td>
                      <td style={tableCellStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", color: "#64748b" }}>
                          <FiCheck size={14} color="#10b981" />
                          {l.approvedByHR
                            ? `${l.approvedByHR.firstName} ${l.approvedByHR.lastName} (${l.approvedByHR.role})`
                            : t("common.system", "System")}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState message={t("components.dailyDetailModal.noEmployeesOnLeave", "No employees on leave for this date.")} />
          )}

          {/* รายการคนขาด */}
          {activeTab === "absent" && !isHoliday && !isFuture && (
            <div style={{ paddingTop: "15px" }}>
              {absent.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                  {absent.map((emp) => (
                    <div key={emp.employeeId} style={absentCardStyle}>
                      <FiUserX size={18} color="#ef4444" />
                      <div>
                        <div style={{ fontWeight: "700", color: "#1e293b" }}>{emp.firstName} {emp.lastName}</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{emp.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState message={t("components.dailyDetailModal.allAccounted", "All employees are accounted for today.")} icon={<FiCheck size={40} color="#22c55e" />} />}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* --- Sub-components & Styles --- */

const HolidayEmptyState = ({ t, isWeekend, isSpecial, desc }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", textAlign: "center" }}>
    <div style={{ background: "#f8fafc", padding: "24px", borderRadius: "50%", marginBottom: "16px" }}><FiCoffee size={48} color="#94a3b8" /></div>
    <h4 style={{ margin: "0 0 8px", color: "#1e293b" }}>{isSpecial ? (desc || t("components.dailyDetailModal.companySpecialHolidayTitle", "Company Special Holiday")) : t("components.dailyDetailModal.weekendBreakTitle", "Weekend Break")}</h4>
    <p style={{ margin: 0, color: "#64748b", maxWidth: "320px" }}>{isSpecial ? t("components.dailyDetailModal.companySpecialHolidayDesc", "Today is an officially announced non-working day.") : t("components.dailyDetailModal.weekendBreakDesc", "Enjoy the weekend! This is a scheduled non-working day.")}</p>
  </div>
);

const TabButton = ({ active, onClick, label, count, isDanger }) => (
  <button className={`btn small ${active ? "primary" : "outline"}`} onClick={onClick} style={{ borderRadius: "10px", padding: "8px 16px", color: active ? undefined : isDanger ? "#ef4444" : "#64748b" }}>
    {label} <span style={{ marginLeft: "6px", opacity: 0.7 }}>({count})</span>
  </button>
);

const EmptyState = ({ message, icon }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", color: "#94a3b8", textAlign: "center", width: "100%" }}>
    <div style={{ marginBottom: "16px", opacity: 0.4 }}>{icon || <FiInfo size={36} />}</div>
    <p style={{ margin: 0, fontSize: "1rem", fontWeight: "500" }}>{message}</p>
  </div>
);

const statusBadgeStyle = (bg, color) => ({ background: bg, color, padding: "4px 12px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: "600", border: `1px solid ${color}20` });

const shiftBadgeStyle = (bg, color) => ({
  background: bg,
  color: color,
  padding: "4px 10px",
  borderRadius: "8px",
  fontSize: "11px",
  fontWeight: "700",
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  border: `1px solid ${color}30`
});

const tableHeadStyle = { textAlign: "left", padding: "12px 16px", fontSize: "0.75rem", color: "#64748b", borderBottom: "2px solid #f1f5f9" };
const tableCellStyle = { padding: "14px 16px", fontSize: "0.9rem", borderBottom: "1px solid #f1f5f9" };
const absentCardStyle = { display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "12px", background: "#fef2f2", border: "1px solid #fee2e2" };