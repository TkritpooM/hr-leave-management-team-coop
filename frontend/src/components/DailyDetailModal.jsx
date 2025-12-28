import React, { useState } from "react";
import { FiX, FiClock, FiCalendar, FiCheck, FiInfo, FiUserX } from "react-icons/fi";
import moment from "moment";

export default function DailyDetailModal({ isOpen, onClose, date, data }) {
  const [activeTab, setActiveTab] = useState("present");

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
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.875rem', fontWeight: '500' }}>
                Total Workforce: {summary.total} Employees
              </p>
            </div>
            <button className="close-x" onClick={onClose} style={{ background: '#f8fafc', borderRadius: '50%', padding: '5px' }}>
              <FiX />
            </button>
          </div>

          {/* Tab Navigation - Fixed below header */}
          <div className="hr-tabs" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
            <TabButton 
              active={activeTab === "present"} 
              onClick={() => setActiveTab("present")} 
              label="Present" 
              count={summary.presentCount} 
            />
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
          </div>
        </div>

        {/* Scrollable Content Body - ปรับเป็น Flex เพื่อให้ EmptyState ดีดตัวอยู่ตรงกลาง */}
        <div style={{ 
          maxHeight: '65vh', 
          minHeight: '350px', // กำหนดความสูงขั้นต่ำเพื่อให้เห็นความแตกต่างของการจัดกลาง
          overflowY: 'auto', 
          padding: '0 24px 24px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {activeTab === "present" && (
            present.length > 0 ? (
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
                          {r.isLate ? "Late" : "On Time"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState message="No attendance records for today." />
          )}

          {activeTab === "leave" && (
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
                      <td style={tableCellStyle}><span className="badge-leave" style={{ fontSize: '0.75rem' }}>{l.leaveType.typeName}</span></td>
                      <td style={tableCellStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: '#64748b' }}>
                          <FiCheck size={14} color="#10b981" /> {l.approvedByHR?.firstName || "System"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState message="No employees on leave today." />
          )}

          {activeTab === "absent" && (
            <div style={{ paddingTop: '15px', flex: absent.length > 0 ? '0' : '1', display: 'flex', flexDirection: 'column' }}>
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
              ) : <EmptyState message="No absences recorded today." />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Styled Sub-components --- */
const TabButton = ({ active, onClick, label, count, isDanger }) => (
  <button 
    className={`btn small ${active ? "primary" : "outline"}`} 
    onClick={onClick}
    style={{ 
      borderRadius: '10px', 
      padding: '8px 16px',
      borderColor: active ? undefined : '#e2e8f0',
      color: active ? undefined : (isDanger ? '#ef4444' : '#64748b')
    }}
  >
    {label} <span style={{ marginLeft: '6px', opacity: 0.7 }}>({count})</span>
  </button>
);

const EmptyState = ({ message }) => (
  <div style={{ 
    flex: 1, 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: '60px 20px', 
    color: '#94a3b8',
    textAlign: 'center',
    width: '100%'
  }}>
    <FiInfo size={36} style={{ marginBottom: '16px', opacity: 0.4 }} />
    <p style={{ margin: 0, fontSize: '1rem', fontWeight: '500' }}>{message}</p>
  </div>
);

/* --- Styles --- */
const tableHeadStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
  borderBottom: '2px solid #f1f5f9'
};

const tableCellStyle = {
  padding: '14px 16px',
  fontSize: '0.9rem',
  borderBottom: '1px solid #f1f5f9'
};

const absentCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px',
  borderRadius: '12px',
  background: '#fef2f2',
  border: '1px solid #fee2e2'
};