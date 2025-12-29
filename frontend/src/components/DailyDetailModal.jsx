import React, { useState, useEffect, useMemo } from "react";
import { FiX, FiClock, FiCalendar, FiCheck, FiInfo, FiUserX, FiSunrise, FiCoffee } from "react-icons/fi";
import moment from "moment";

export default function DailyDetailModal({ isOpen, onClose, date, data }) {
  const [activeTab, setActiveTab] = useState("present");

  // 1. วิเคราะห์สถานะของวันที่เลือก
  const dateStatus = useMemo(() => {
    if (!date) return {};
    const selected = moment(date).startOf('day');
    const today = moment().startOf('day');
    
    const isFuture = selected.isAfter(today);
    const isWeekend = selected.day() === 0 || selected.day() === 6;
    
    // ตรวจสอบว่าเป็นวันหยุดพิเศษหรือไม่
    const isSpecialHoliday = data?.isSpecialHoliday || false; 

    return { isFuture, isWeekend, isSpecialHoliday };
  }, [date, data]);

  const { isFuture, isWeekend, isSpecialHoliday } = dateStatus;
  const isHoliday = isWeekend || isSpecialHoliday;

  // 2. ✅ Auto-Switch Tab: ถ้ากดมาเจอวันหยุด หรือวันอนาคต แล้วค้างอยู่ Tab อื่นที่ไม่ใช่ Present ให้ดีดกลับมา
  useEffect(() => {
    if (isOpen) {
      if ((isHoliday || isFuture) && activeTab !== "present") {
        setActiveTab("present");
      }
    }
  }, [isOpen, date, isHoliday, isFuture]);

  if (!isOpen || !data) return null;

  const { present, leaves, absent, summary } = data;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div 
        className="modal" 
        style={{ maxWidth: '800px', width: '95%', borderRadius: '16px', padding: '0', overflow: 'hidden' }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FiCalendar style={{ color: '#64748b' }} />
                Daily Details for {moment(date).format("DD MMM YYYY")}
              </h3>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                {isFuture && <span style={statusBadgeStyle("#eff6ff", "#3b82f6")}>Upcoming Date</span>}
                {isSpecialHoliday && <span style={statusBadgeStyle("#fef2f2", "#ef4444")}>Company Holiday</span>}
                {isWeekend && <span style={statusBadgeStyle("#f8fafc", "#64748b")}>Weekend</span>}
                {!isFuture && !isHoliday && <span style={statusBadgeStyle("#f0fdf4", "#22c55e")}>Regular Working Day</span>}
              </div>
            </div>
            <button className="close-x" onClick={onClose} style={{ background: '#f8fafc', borderRadius: '50%', padding: '5px' }}>
              <FiX />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="hr-tabs" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            {/* แสดงแถบ Present/OT เสมอ */}
            <TabButton 
              active={activeTab === "present"} 
              onClick={() => setActiveTab("present")} 
              label={isHoliday ? "Working (OT)" : "Present"} 
              count={summary.presentCount} 
            />
            
            {/* ✅ ซ่อนแถบ On Leave และ Absent ทันทีถ้าเป็นวันหยุด (isHoliday) หรือ วันในอนาคต */}
            {!isHoliday && !isFuture && (
              <>
                <TabButton 
                  active={activeTab === "leave"} 
                  onClick={() => setActiveTab("leave")} 
                  label="On Leave" 
                  count={summary.leaveCount} 
                />
                <TabButton 
                  active={activeTab === "absent"} 
                  onClick={() => setActiveTab("absent")} 
                  label="Absent" 
                  count={summary.absentCount} 
                  isDanger={summary.absentCount > 0}
                />
              </>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ 
          maxHeight: '65vh', minHeight: '350px', 
          overflowY: 'auto', padding: '0 24px 24px',
          display: 'flex', flexDirection: 'column'
        }}>
          
          {/* ✅ 1. เช็ควันหยุดก่อน (Priority 1) */}
          {isHoliday && summary.presentCount === 0 && activeTab === "present" ? (
            <HolidayEmptyState isWeekend={isWeekend} isSpecial={isSpecialHoliday} />
          ) : (
            /* ✅ 2. ถ้าไม่ใช่หน้าวันหยุด ถึงค่อยมาเช็ควันในอนาคต (Priority 2) */
            isFuture && activeTab === "present" && summary.presentCount === 0 && (
              <EmptyState message="No attendance data expected yet for this future date." icon={<FiSunrise size={48} />} />
            )
          )}

          {/* ตารางแสดงคนมาทำงาน (รวมถึง OT ในวันหยุด) */}
          {activeTab === "present" && present.length > 0 && (
            <table className="table" style={{ borderCollapse: 'separate', borderSpacing: '0' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                <tr>
                  <th style={tableHeadStyle}>Employee</th>
                  <th style={tableHeadStyle}>Check In</th>
                  <th style={tableHeadStyle}>Check Out</th>
                  <th style={tableHeadStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {present.map(r => (
                  <tr key={r.recordId}>
                    <td style={tableCellStyle}><strong>{r.employee.firstName} {r.employee.lastName}</strong></td>
                    <td style={tableCellStyle}><FiClock size={14} /> {moment(r.checkInTime).format("HH:mm")}</td>
                    <td style={tableCellStyle}>{r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "--:--"}</td>
                    <td style={tableCellStyle}>
                      <span className={`badge ${r.isLate ? "badge-late" : "badge-ok"}`} style={{ fontSize: '0.75rem' }}>
                        {isHoliday ? "OT Work" : (r.isLate ? "Late" : "On Time")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* รายการลา (แสดงเฉพาะในวันทำงานปกติ) */}
          {activeTab === "leave" && !isHoliday && !isFuture && (
            leaves.length > 0 ? (
              <table className="table" style={{ borderCollapse: 'separate', borderSpacing: '0' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
                  <tr>
                    <th style={tableHeadStyle}>Employee</th>
                    <th style={tableHeadStyle}>Leave Type</th>
                    <th style={tableHeadStyle}>Approved By</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(l => (
                    <tr key={l.requestId}>
                      <td style={tableCellStyle}><strong>{l.employee.firstName} {l.employee.lastName}</strong></td>
                      <td style={tableCellStyle}>
                        <span style={{ 
                          fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', fontWeight: '800',
                          backgroundColor: `${l.leaveType.colorCode || '#3b82f6'}15`, 
                          color: l.leaveType.colorCode || '#3b82f6',
                          border: `1px solid ${l.leaveType.colorCode || '#3b82f6'}30`
                        }}>
                          {l.leaveType.typeName}
                        </span>
                      </td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#64748b' }}>
                          <FiCheck size={14} color="#10b981" /> {l.approvedByHR?.firstName || "System"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState message="No employees on leave for this date." />
          )}

          {/* รายการคนขาด (แสดงเฉพาะวันทำงานปกติ) */}
          {activeTab === "absent" && !isHoliday && !isFuture && (
            <div style={{ paddingTop: '15px' }}>
              {absent.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                  {absent.map(emp => (
                    <div key={emp.employeeId} style={absentCardStyle}>
                      <FiUserX size={18} color="#ef4444" />
                      <div>
                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{emp.firstName} {emp.lastName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{emp.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState message="All employees are accounted for today." icon={<FiCheck size={40} color="#22c55e" />} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Sub-components & Styles --- */

const HolidayEmptyState = ({ isWeekend, isSpecial }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
    <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '50%', marginBottom: '16px' }}>
      <FiCoffee size={48} color="#94a3b8" />
    </div>
    <h4 style={{ margin: '0 0 8px', color: '#1e293b' }}>
      {isSpecial ? "Company Special Holiday" : "Weekend Break"}
    </h4>
    <p style={{ margin: 0, color: '#64748b', maxWidth: '300px' }}>
      {isSpecial ? "Today is an officially announced non-working day." : "Enjoy the weekend! This is a scheduled non-working day."}
    </p>
  </div>
);

const TabButton = ({ active, onClick, label, count, isDanger }) => (
  <button className={`btn small ${active ? "primary" : "outline"}`} onClick={onClick} style={{ borderRadius: '10px', padding: '8px 16px', color: active ? undefined : (isDanger ? '#ef4444' : '#64748b') }}>
    {label} <span style={{ marginLeft: '6px', opacity: 0.7 }}>({count})</span>
  </button>
);

const EmptyState = ({ message, icon }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: '#94a3b8', textAlign: 'center', width: '100%' }}>
    <div style={{ marginBottom: '16px', opacity: 0.4 }}>{icon || <FiInfo size={36} />}</div>
    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '500' }}>{message}</p>
  </div>
);

const statusBadgeStyle = (bg, color) => ({ background: bg, color: color, padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', border: `1px solid ${color}20` });
const tableHeadStyle = { textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', color: '#64748b', borderBottom: '2px solid #f1f5f9' };
const tableCellStyle = { padding: '14px 16px', fontSize: '0.9rem', borderBottom: '1px solid #f1f5f9' };
const absentCardStyle = { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fee2e2' };