import React, { useState } from "react";
import { FiX, FiUserCheck, FiUserX, FiBriefcase, FiClock } from "react-icons/fi";
import moment from "moment";

export default function DailyDetailModal({ isOpen, onClose, date, data }) {
  const [activeTab, setActiveTab] = useState("present");

  if (!isOpen || !data) return null;

  const { present, leaves, absent, summary } = data;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: '850px', width: '95%' }}>
        <div className="modal-head-row">
          <div>
            <h3>รายละเอียดประจำวันที่ {moment(date).format("DD MMM YYYY")}</h3>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>
              พนักงานทั้งหมด {summary.total} คน
            </p>
          </div>
          <button className="close-x" onClick={onClose}><FiX /></button>
        </div>

        {/* Tab Navigation */}
        <div className="hr-tabs" style={{ marginTop: '15px' }}>
          <button className={`btn small ${activeTab === "present" ? "primary" : "outline"}`} onClick={() => setActiveTab("present")}>
            มาทำงาน ({summary.presentCount})
          </button>
          <button className={`btn small ${activeTab === "leave" ? "primary" : "outline"}`} onClick={() => setActiveTab("leave")}>
            ลาพัก ({summary.leaveCount})
          </button>
          <button className={`btn small ${activeTab === "absent" ? "primary" : "outline"}`} onClick={() => setActiveTab("absent")}>
            ขาดงาน ({summary.absentCount})
          </button>
        </div>

        <div className="modal-body-scroll" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '15px 0' }}>
          {activeTab === "present" && (
            <table className="table">
              <thead>
                <tr><th>พนักงาน</th><th>เวลาเข้า</th><th>เวลาออก</th><th>สถานะ</th></tr>
              </thead>
              <tbody>
                {present.map(r => (
                  <tr key={r.recordId}>
                    <td>{r.employee.firstName} {r.employee.lastName}</td>
                    <td><FiClock /> {moment(r.checkInTime).format("HH:mm")}</td>
                    <td>{r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "-"}</td>
                    <td><span className={`badge ${r.isLate ? "badge-late" : "badge-ok"}`}>{r.isLate ? "สาย" : "ปกติ"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "leave" && (
            <table className="table">
              <thead>
                <tr><th>พนักงาน</th><th>ประเภทการลา</th><th>ผู้อนุมัติ</th></tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.requestId}>
                    <td>{l.employee.firstName} {l.employee.lastName}</td>
                    <td><span className="badge-leave">{l.leaveType.typeName}</span></td>
                    <td><small>อนุมัติโดย: {l.approvedByHR?.firstName || "System"}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "absent" && (
            <div className="absent-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {absent.map(emp => (
                <div key={emp.employeeId} className="info-item" style={{ border: '1px solid #fee2e2', background: '#fef2f2' }}>
                  <FiUserX color="#ef4444" /> {emp.firstName} {emp.lastName} ({emp.role})
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}