import React, { useState } from "react";
import moment from "moment";
import {
  FiX, FiInfo, FiCalendar, FiClock, FiUser,
  FiCheckCircle, FiXCircle, FiFileText, FiLoader, FiPaperclip
} from "react-icons/fi";
import axiosClient from "../api/axiosClient";
import { alertSuccess, alertError, alertConfirm } from "../utils/sweetAlert";
import "./QuickActionModal.css";

const QuickActionModal = ({ isOpen, onClose, requestData, onActionSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !requestData) return null;

  // 1. Destructure data
  const {
    status = "Pending",
    requestId,
    employeeName,
    leaveType,
    startDate,
    endDate,
    reason,
    attachmentUrl,
    isReadOnly,
    approvedByHR
  } = requestData;

  const isPending = status === "Pending";
  const isApproved = status === "Approved";
  const isRejected = status === "Rejected";

  // 2. Handle Approval/Rejection Decision
  const handleDecision = async (action) => {
    const isApprove = action === "approve";
    const title = isApprove ? "Approve Request" : "Reject Request";
    const confirmBtn = isApprove ? "APPROVE" : "REJECT";

    const confirmed = await alertConfirm(
      title,
      `Are you sure you want to ${action} this leave request?`,
      confirmBtn
    );

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const res = await axiosClient.put(`/leave/admin/approval/${requestId}`, { action });
      
      if (res.data.success) {
        await alertSuccess("Success", res.data.message);
        onClose();
        if (onActionSuccess) onActionSuccess();
      } else {
        alertError("Error", res.data.message);
      }
    } catch (err) {
      console.error("Approval Error:", err);
      alertError("Error", err.response?.data?.message || "Failed to process request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="qa-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="qa-modal-header">
          <div className="qa-title">
            <div className="qa-icon-header"><FiInfo /></div>
            <span>Leave Request Detail</span>
          </div>
          <button className="qa-close-btn" onClick={onClose}><FiX /></button>
        </div>

        {/* Body */}
        <div className="qa-modal-body">
          <div className="qa-status-wrapper">
            <span className={`qa-badge ${isApproved ? "status-approved" : isRejected ? "status-rejected" : "status-pending"}`}>
              {isApproved ? <FiCheckCircle /> : isRejected ? <FiXCircle /> : <FiClock />}
              {status}
            </span>
          </div>

          <div className="qa-info-list">
            <div className="qa-info-row">
              <FiUser className="qa-row-icon" />
              <span className="qa-label">Employee:</span>
              <span className="qa-value">{employeeName || "-"}</span>
            </div>
            <div className="qa-info-row">
              <FiFileText className="qa-row-icon" />
              <span className="qa-label">Type:</span>
              <span className="qa-value">{leaveType || "-"}</span>
            </div>
            <div className="qa-info-row">
              <FiCalendar className="qa-row-icon" />
              <span className="qa-label">Period:</span>
              <span className="qa-value">
                {startDate ? moment(startDate).format("DD MMM") : "-"} - {endDate ? moment(endDate).format("DD MMM YYYY") : "-"}
              </span>
            </div>

            {approvedByHR && (
              <div className="qa-info-row">
                {isApproved ? <FiCheckCircle className="qa-row-icon" /> : <FiXCircle className="qa-row-icon" />}
                <span className="qa-label">{isApproved ? "Approved:" : "Rejected:"}</span>
                <span className="qa-value">
                  {`${approvedByHR.firstName || ""} ${approvedByHR.lastName || ""}`.trim()}
                </span>
              </div>
            )}
          </div>

          {attachmentUrl && (
            <a href={`http://localhost:8000/uploads/${attachmentUrl}`} target="_blank" rel="noreferrer" className="qa-attachment-link">
              <FiPaperclip />
              <span className="qa-attachment-text">View Attachment</span>
            </a>
          )}

          <div className="qa-reason-box">
            <label className="qa-reason-label">Reason / Note</label>
            <p className="qa-reason-text">{reason || "No reason provided."}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="qa-modal-footer">
          {isPending && !isReadOnly ? (
            <div className="minimal-actions">
              <button className="m-btn m-btn-reject" onClick={() => handleDecision("reject")} disabled={isSubmitting}>
                {isSubmitting ? <FiLoader className="spin" /> : <FiXCircle />} Reject
              </button>
              <button className="m-btn m-btn-approve" onClick={() => handleDecision("approve")} disabled={isSubmitting}>
                {isSubmitting ? <FiLoader className="spin" /> : <FiCheckCircle />} Approve
              </button>
            </div>
          ) : (
            <button className="m-btn m-btn-close" onClick={onClose}>Close Window</button>
          )}
        </div>

      </div>
    </div>
  );
};

export default QuickActionModal;