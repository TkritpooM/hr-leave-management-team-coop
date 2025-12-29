import React from 'react';
import moment from 'moment';
import { FiX, FiInfo, FiCalendar, FiClock, FiActivity, FiUser } from 'react-icons/fi';
import './WorkerModal.css'; // อย่าลืมสร้างไฟล์ CSS นี้นะคะ

const WorkerDateModal = ({ isOpen, onClose, date, data }) => {
  if (!isOpen) return null;

  // Helper: เลือกสีของ Badge ตามสถานะ
  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("approved") || s.includes("normal") || s.includes("present")) return "status-success";
    if (s.includes("pending")) return "status-warning";
    if (s.includes("reject") || s.includes("late") || s.includes("absent")) return "status-danger";
    return "status-default";
  };

  // Helper: ตัดสินใจว่าจะโชว์ข้อมูลแบบ Leave หรือ Time Record
  const isLeave = data?.type === 'leave';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-title">
            <FiInfo className="header-icon" />
            <span>Daily Details : {moment(date).format("DD MMM YYYY")}</span>
          </div>
          <button className="close-btn-icon" onClick={onClose}><FiX /></button>
        </div>

        {/* Status Badge (Centered like reference) */}
        <div className="status-section">
          <span className={`status-pill ${getStatusColor(data?.status)}`}>
            {data?.status || "No Data"}
          </span>
        </div>

        {/* Content Body */}
        <div className="modal-body">
          {/* ข้อมูลพื้นฐาน */}
          <div className="detail-row">
            <div className="detail-icon"><FiUser /></div>
            <div className="detail-label">Employee:</div>
            <div className="detail-value">{data?.employeeName || "You"}</div>
          </div>

          {/* กรณีเป็นวันลา (Leave) */}
          {isLeave ? (
            <>
              <div className="detail-row">
                <div className="detail-icon"><FiActivity /></div>
                <div className="detail-label">Type:</div>
                <div className="detail-value">{data?.leaveType || "-"}</div>
              </div>
              <div className="detail-row">
                <div className="detail-icon"><FiCalendar /></div>
                <div className="detail-label">Period:</div>
                <div className="detail-value">
                   {moment(data?.startDate).format("DD MMM")} - {moment(data?.endDate).format("DD MMM YYYY")}
                </div>
              </div>
            </>
          ) : (
            /* กรณีเป็นวันทำงาน (Attendance) */
            <>
               <div className="detail-row">
                <div className="detail-icon"><FiClock /></div>
                <div className="detail-label">Check In:</div>
                <div className="detail-value">{data?.checkIn ? moment(data.checkIn).format("HH:mm") : "--:--"}</div>
              </div>
              <div className="detail-row">
                <div className="detail-icon"><FiClock /></div>
                <div className="detail-label">Check Out:</div>
                <div className="detail-value">{data?.checkOut ? moment(data.checkOut).format("HH:mm") : "--:--"}</div>
              </div>
            </>
          )}

          {/* Reason Box (ตามแบบในรูป) */}
          <div className="reason-box">
            <label className="reason-label">NOTE / REASON</label>
            <p className="reason-text">
              {data?.reason || "No specific details provided for this date."}
            </p>
          </div>
        </div>

        {/* Footer Button */}
        <div className="modal-footer">
          <button className="btn-close-window" onClick={onClose}>
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkerDateModal;