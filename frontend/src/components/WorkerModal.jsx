// src/components/WorkerModal.jsx
import React from "react";
import moment from "moment";
import {
  FiX,
  FiInfo,
  FiCalendar,
  FiClock,
  FiActivity,
  FiUser,
  FiCheckCircle,
  FiCoffee,
} from "react-icons/fi";
import "./WorkerModal.css";
import { useTranslation } from "react-i18next";

const WorkerDateModal = ({ isOpen, onClose, date, data }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // ✅ ฟังก์ชันจัดรูปแบบวันที่และช่วงเวลา (Period) ให้แสดง (Morning/Afternoon) หลังวันที่
  const getFormattedPeriod = () => {
    if (!data?.startDate || !data?.endDate) return "-";
    
    const start = moment(data.startDate);
    const end = moment(data.endDate);
    
    // ✅ 1. ตรวจสอบว่า "วันที่เราคลิกดู" คือวันไหนในช่วงการลา
    // และดึง Duration ที่ถูกต้องมาใช้ (HalfMorning / HalfAfternoon)
    let duration = "Full";
    
    if (data.isStartDay) {
      duration = data.startDuration;
    } else if (data.isEndDay) {
      duration = data.endDuration;
    }

    // ✅ 2. แปลงค่าจาก Database (HalfMorning/HalfAfternoon) เป็น Label
    let durationLabel = "";
    if (duration === "HalfMorning") {
      durationLabel = ` (${t("common.morning", "Morning")})`;
    } else if (duration === "HalfAfternoon") {
      durationLabel = ` (${t("common.afternoon", "Afternoon")})`;
    }

    // ✅ 3. การแสดงผลวันที่
    // กรณีลาวันเดียว
    if (start.isSame(end, 'day')) {
      return `${start.format("DD MMM YYYY")}${durationLabel}`;
    }
    
    // กรณีลาหลายวัน (แสดงช่วงวันที่ + แจ้งเตือนถ้าวันที่กดดูเป็นครึ่งวัน)
    const rangeStr = `${start.format("DD MMM")} - ${end.format("DD MMM YYYY")}`;
    return duration !== "Full" ? `${rangeStr}${durationLabel}` : rangeStr;
  };

  const getStatusColor = (status) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("holiday")) return "status-primary";
    if (s.includes("weekend")) return "status-secondary";
    if (s.includes("upcoming") || s.includes("future")) return "status-default";
    if (s.includes("approved") || s.includes("normal") || s.includes("present"))
      return "status-success";
    if (s.includes("pending")) return "status-warning";
    if (s.includes("reject") || s.includes("late") || s.includes("absent"))
      return "status-danger";
    return "status-default";
  };

  const type = String(data?.type || "").toLowerCase();
  const isLeave = type === "leave";
  const isHoliday = type === "holiday";
  const isFuture = type === "future";
  const isWeekend = type === "weekend";

  const approvedByName =
    data?.approvedByName ||
    data?.approvedBy ||
    (data?.approvedByHR
      ? `${data.approvedByHR.firstName || ""} ${
          data.approvedByHR.lastName || ""
        }`.trim()
      : "") ||
    "";

  const safeDateLabel = date
    ? moment(date).isValid()
      ? moment(date).format("DD MMM YYYY")
      : "-"
    : "-";

  const statusText = data?.status
    ? t(`common.status.${String(data.status).toLowerCase()}`, String(data.status))
    : t("components.workerModal.noData", "No Data");

  const restValue = isHoliday
    ? t("components.workerModal.officialNonWorkingDay", "Official Non-working Day")
    : t("components.workerModal.weeklyRestDay", "Weekly Rest Day");

  const employeeName = data?.employeeName || t("common.you", "You");
  const leaveType = data?.leaveType || "-";

  const checkInText =
    data?.checkIn && moment(data.checkIn).isValid()
      ? moment(data.checkIn).format("HH:mm")
      : "--:--";

  const checkOutText =
    data?.checkOut && moment(data.checkOut).isValid()
      ? moment(data.checkOut).format("HH:mm")
      : "--:--";

  const reasonLabel = isHoliday || isWeekend
    ? t("components.workerModal.restDayDescription", "REST DAY DESCRIPTION")
    : t("components.workerModal.noteReason", "NOTE / REASON");

  const reasonText =
    data?.reason || t("components.workerModal.noSpecificDetails", "No specific details provided for this date.");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-title">
            <FiInfo className="header-icon" />
            <span>
              {t("components.workerModal.dailyDetails", "Daily Details")} : {safeDateLabel}
            </span>
          </div>
          <button className="close-btn-icon" onClick={onClose} aria-label={t("common.close", "Close")}>
            <FiX />
          </button>
        </div>

        <div className="status-section">
          <span className={`status-pill ${getStatusColor(data?.status)}`}>
            {statusText}
          </span>
        </div>

        <div className="modal-body">
          {isHoliday || isWeekend ? (
            <div className="detail-row">
              <div className="detail-icon"><FiCoffee /></div>
              <div className="detail-label">{t("components.workerModal.notice", "Notice")}</div>
              <div className="detail-value">{restValue}</div>
            </div>
          ) : isFuture ? (
            <div className="detail-row">
              <div className="detail-icon"><FiClock /></div>
              <div className="detail-label">{t("components.workerModal.status", "Status")}</div>
              <div className="detail-value">{t("components.workerModal.waitingForThisDate", "Waiting for this date")}</div>
            </div>
          ) : (
            <>
              <div className="detail-row">
                <div className="detail-icon"><FiUser /></div>
                <div className="detail-label">{t("components.workerModal.employee", "Employee")}</div>
                <div className="detail-value">{employeeName}</div>
              </div>

              {isLeave ? (
                <>
                  <div className="detail-row">
                    <div className="detail-icon"><FiActivity /></div>
                    <div className="detail-label">{t("components.workerModal.type", "Type")}</div>
                    <div className="detail-value">{leaveType}</div>
                  </div>

                  <div className="detail-row">
                    <div className="detail-icon"><FiCalendar /></div>
                    <div className="detail-label">{t("components.workerModal.period", "Period")}</div>
                    {/* ✅ แสดงวันที่ + (Morning/Afternoon) */}
                    <div className="detail-value">{getFormattedPeriod()}</div>
                  </div>

                  {approvedByName && (
                    <div className="detail-row">
                      <div className="detail-icon"><FiCheckCircle /></div>
                      <div className="detail-label">{t("components.workerModal.approvedBy", "Approved by")}</div>
                      <div className="detail-value">{approvedByName}</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="detail-row">
                    <div className="detail-icon"><FiClock /></div>
                    <div className="detail-label">{t("components.workerModal.checkIn", "Check In")}</div>
                    <div className="detail-value">{checkInText}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-icon"><FiClock /></div>
                    <div className="detail-label">{t("components.workerModal.checkOut", "Check Out")}</div>
                    <div className="detail-value">{checkOutText}</div>
                  </div>
                </>
              )}
            </>
          )}

          <div className="reason-box">
            <label className="reason-label">{reasonLabel}</label>
            <p className="reason-text">{reasonText}</p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-close-window" onClick={onClose}>
            {t("components.workerModal.closeWindow", "Close Window")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkerDateModal;