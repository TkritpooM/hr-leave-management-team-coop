import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { FiClock, FiPlusCircle, FiCalendar } from "react-icons/fi";
import "./WorkerDashboard.css";
import Pagination from "../components/Pagination";
import { alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

// Helper Functions
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// Component สำหรับแสดง Card สิทธิ์การลา
function QuotaCard({ title, usedDays, totalDays, carriedOverDays }) {
  const used = num(usedDays);
  const currentTotal = num(totalDays);
  const carried = num(carriedOverDays);
  
  // สิทธิ์รวม = สิทธิ์ปีปัจจุบัน + ยอดทบจากปีที่แล้ว
  const totalEffective = currentTotal + carried;
  const remaining = Math.max(0, totalEffective - used);
  const percent = totalEffective > 0 ? clamp((used / totalEffective) * 100, 0, 100) : 0;

  return (
    <div className="quota-card">
      <div className="quota-top">
        <div className="quota-title-group">
          <h4 className="quota-title">{title}</h4>
          {carried > 0 && (
            <span className="carried-badge">+{carried} Carried Over</span>
          )}
        </div>
        <span className="quota-chip">{Math.round(percent)}%</span>
      </div>

      <div className="quota-metrics">
        <div className="qm">
          <div className="qm-label">Used</div>
          <div className="qm-value">{used}</div>
        </div>
        <div className="qm highlight">
          <div className="qm-label">Available</div>
          <div className="qm-value">{totalEffective}</div>
        </div>
        <div className="qm success">
          <div className="qm-label">Remaining</div>
          <div className="qm-value">{remaining}</div>
        </div>
      </div>

      <div className="quota-bar">
        <div className="quota-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function WorkerDashboard() {
  const [now, setNow] = useState(new Date());
  const [checkedInAt, setCheckedInAt] = useState(null);
  const [checkedOutAt, setCheckedOutAt] = useState(null);
  const [history, setHistory] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [lateSummary, setLateSummary] = useState({ lateCount: 0, lateLimit: 5 });
  
  // Leave Modal & Preview States
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDays, setPreviewDays] = useState(0); // เก็บจำนวนวันลาจริงที่ Backend คำนวณให้
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    detail: "",
  });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const getAuthHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

  // 1. ดึงข้อมูลการลงเวลา
  const fetchAttendanceData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/my", getAuthHeader());
      const records = response.data.records || [];
      setHistory(records);
      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = records.find((r) => r.workDate && r.workDate.startsWith(todayStr));
      if (todayRecord) {
        if (todayRecord.checkInTime) setCheckedInAt(new Date(todayRecord.checkInTime));
        if (todayRecord.checkOutTime) setCheckedOutAt(new Date(todayRecord.checkOutTime));
      }
    } catch (err) { console.error(err); }
  };

  // 2. ดึงข้อมูลโควต้าการลา
  const fetchQuotaData = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader());
      const qs = response.data.quotas || [];
      setQuotas(qs);
      if (qs.length > 0 && !leaveForm.leaveTypeId) {
        setLeaveForm(prev => ({ ...prev, leaveTypeId: qs[0].leaveTypeId }));
      }
    } catch (err) { console.error(err); }
  };

  // 3. ดึงสรุปการมาสาย
  const fetchLateSummary = async () => {
    try {
      const response = await axios.get("http://localhost:8000/api/timerecord/late/summary", getAuthHeader());
      setLateSummary({ lateCount: response.data.lateCount, lateLimit: response.data.lateLimit });
    } catch (err) { console.error(err); }
  };

  // 🔥 4. ระบบคำนวณวันลาจริง (Real-time Preview)
  // เมื่อมีการเปลี่ยนวันที่ใน Leave Form ระบบจะยิงไปถาม Backend ว่าติดวันหยุดกี่วัน
  useEffect(() => {
    // 🔥 เพิ่มเงื่อนไขตรวจสอบว่าวันเริ่มต้องไม่มากกว่าวันจบก่อนยิง API
    if (leaveForm.startDate && leaveForm.endDate && leaveForm.startDate <= leaveForm.endDate) {
      const timeoutId = setTimeout(async () => {
        try {
          const res = await axios.get("http://localhost:8000/api/leave/calculate-days", {
            params: { 
              startDate: leaveForm.startDate, 
              endDate: leaveForm.endDate,
              startDuration: 'Full',
              endDuration: 'Full'
            },
            ...getAuthHeader()
          });
          setPreviewDays(res.data.totalDays || 0); 
        } catch (err) { setPreviewDays(0); }
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPreviewDays(0);
    }
  }, [leaveForm.startDate, leaveForm.endDate]);

  useEffect(() => {
    fetchAttendanceData();
    fetchQuotaData();
    fetchLateSummary();
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Handlers
  const handleCheckIn = async () => {
    try {
      // เปลี่ยนจาก /checkin เป็น /check-in
      await axios.post("http://localhost:8000/api/timerecord/check-in", {}, getAuthHeader());
      await alertSuccess("สำเร็จ", "ลงชื่อเข้างานเรียบร้อย");
      fetchAttendanceData();
      fetchLateSummary();
    } catch (err) { 
      alertError("ล้มเหลว", err.response?.data?.message); 
    }
  };

  const handleCheckOut = async () => {
    try {
      // เปลี่ยนจาก /checkout เป็น /check-out
      await axios.post("http://localhost:8000/api/timerecord/check-out", {}, getAuthHeader());
      await alertSuccess("สำเร็จ", "ลงชื่อออกงานเรียบร้อย");
      fetchAttendanceData();
    } catch (err) { 
      alertError("ล้มเหลว", err.response?.data?.message); 
    }
  };

  const handleLeaveChange = (e) => {
    const { name, value } = e.target;
    setLeaveForm(prev => {
      const newState = { ...prev, [name]: value };
      
      // 🛡️ เมื่อเลือกวันเริ่ม (StartDate)
      if (name === "startDate") {
        // 1. ถ้าวันจบเดิมที่มีอยู่ มันดันย้อนศร (น้อยกว่าวันเริ่มใหม่)
        if (prev.endDate && value > prev.endDate) {
          newState.endDate = value; // ดีดวันจบให้เท่ากับวันเริ่มทันที
        }
        // 2. ถ้ายังไม่เคยเลือกวันจบเลย ให้เซ็ตเท่ากับวันเริ่มไปก่อนเพื่อความสะดวก
        if (!prev.endDate) {
          newState.endDate = value;
        }
      }
      
      // 🛡️ เมื่อเลือกวันจบ (EndDate) 
      if (name === "endDate") {
        // กันเหนียว: ถ้าพยายามเลือกวันจบที่น้อยกว่าวันเริ่ม
        if (prev.startDate && value < prev.startDate) {
          newState.endDate = prev.startDate; 
        }
      }

      return newState;
    });
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("leaveTypeId", parseInt(leaveForm.leaveTypeId));
      formData.append("startDate", leaveForm.startDate);
      formData.append("endDate", leaveForm.endDate);
      formData.append("reason", leaveForm.detail);
      if (selectedFile) formData.append("attachment", selectedFile);

      const res = await axios.post("http://localhost:8000/api/leave/request", formData, {
        headers: { ...getAuthHeader().headers, "Content-Type": "multipart/form-data" }
      });

      if (res.data.success) {
        await alertSuccess("สำเร็จ", "ส่งคำขอลาเรียบร้อยแล้ว");
        setIsLeaveModalOpen(false);
        setLeaveForm({ leaveTypeId: quotas[0]?.leaveTypeId || "", startDate: "", endDate: "", detail: "" });
        fetchQuotaData();
      } else { alertInfo("แจ้งเตือน", res.data.message); }
    } catch (err) { alertError("ผิดพลาด", err.response?.data?.message); }
  };

  const formatTime = (d) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const formatDate = (s) => s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const pagedHistory = useMemo(() => history.slice((page-1)*pageSize, page*pageSize), [history, page, pageSize]);

  return (
    <div className="page-card">
      <header className="worker-header">
        <div>
          <h1 className="worker-title">สวัสดีคุณ {user.firstName || "Worker"}</h1>
          <p className="worker-datetime">{now.toLocaleString("th-TH")}</p>
        </div>
        <div className="clock-box"><FiClock /> {formatTime(now)}</div>
      </header>

      <div className="late-warning">
        <span>เดือนนี้สายแล้ว: <strong>{lateSummary.lateCount} / {lateSummary.lateLimit}</strong> ครั้ง</span>
      </div>

      <section className="action-row">
        <div className="action-card">
          <h3>Check In</h3>
          <p className="action-time">{formatTime(checkedInAt)}</p>
          <button className="btn-checkin" onClick={handleCheckIn} disabled={!!checkedInAt}>
            {checkedInAt ? "เข้างานแล้ว" : "ลงชื่อเข้างาน"}
          </button>
        </div>
        <div className="action-card">
          <h3>Check Out</h3>
          <p className="action-time">{formatTime(checkedOutAt)}</p>
          <button className="btn-checkout" onClick={handleCheckOut} disabled={!checkedInAt || !!checkedOutAt}>
            ลงชื่อออกงาน
          </button>
        </div>
        <div className="action-card">
          <h3>Leave</h3>
          <p className="action-time">ขอลาหยุด</p>
          <button className="btn-leave" onClick={() => setIsLeaveModalOpen(true)}>
            <FiPlusCircle /> สร้างคำขอลา
          </button>
        </div>
      </section>

      <h2 className="section-subtitle">สิทธิ์การลาของคุณ (รวมสิทธิ์ที่ทบมาปีที่แล้ว)</h2>
      <section className="quota-grid">
        {quotas.map((q) => (
          <QuotaCard
            key={q.quotaId}
            title={q.leaveType?.typeName}
            usedDays={q.usedDays}
            totalDays={q.totalDays}
            carriedOverDays={q.carriedOverDays}
          />
        ))}
      </section>

      <section className="history-section">
        <h2>ประวัติการลงเวลา</h2>
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead><tr><th>วันที่</th><th>เข้างาน</th><th>ออกงาน</th><th>สถานะ</th></tr></thead>
            <tbody>
              {pagedHistory.map((row) => (
                <tr key={row.recordId}>
                  <td>{formatDate(row.workDate)}</td>
                  <td>{formatTime(row.checkInTime)}</td>
                  <td>{formatTime(row.checkOutTime)}</td>
                  <td>
                    <span className={`status-badge ${row.isLate ? "status-late" : "status-ok"}`}>
                      {row.isLate ? "สาย" : "ปกติ"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination 
            total={history.length} 
            page={page} 
            pageSize={pageSize} 
            onPageChange={setPage} 
            onPageSizeChange={setPageSize} 
          />
        </div>
      </section>

      {/* Modal สำหรับการลา */}
      {isLeaveModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head-row">
                <h3>สร้างคำขอลาหยุด</h3>
                <button className="close-x" onClick={() => setIsLeaveModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleSubmitLeave} className="leave-form">
              <label>ประเภทการลา</label>
              <select name="leaveTypeId" value={leaveForm.leaveTypeId} onChange={handleLeaveChange} required>
                {quotas.map((q) => (
                  <option key={q.leaveTypeId} value={q.leaveTypeId}>
                    {q.leaveType?.typeName} (คงเหลือ: {num(q.totalDays) + num(q.carriedOverDays) - num(q.usedDays)} วัน)
                  </option>
                ))}
              </select>

              <div className="date-row">
                <label>จากวันที่<input type="date" name="startDate" min={new Date().toISOString().split("T")[0]} value={leaveForm.startDate} onChange={handleLeaveChange} required /></label>
                <label>ถึงวันที่<input type="date" name="endDate" value={leaveForm.endDate} onChange={handleLeaveChange} min={leaveForm.startDate || new Date().toISOString().split("T")[0]} required /></label>
              </div>

              {/* 🔥 ส่วนแสดงข้อมูล Preview คำนวณวันลาจริง */}
              {(leaveForm.startDate && leaveForm.endDate && leaveForm.startDate <= leaveForm.endDate) && (
                <div className="leave-preview-info">
                   <div className="preview-main">
                      <FiCalendar /> <span>จำนวนวันที่ต้องใช้โควต้า: <strong>{previewDays} วัน</strong></span>
                   </div>
                   <p className="mini-note">* ระบบหักวันหยุดเสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์ให้คุณแล้ว</p>
                </div>
              )}

              <label className="full">เหตุผลการลา<textarea name="detail" rows="3" value={leaveForm.detail} onChange={handleLeaveChange} placeholder="ระบุเหตุผล..."></textarea></label>
              <label className="full">แนบหลักฐาน (ถ้ามี)<input type="file" onChange={(e) => setSelectedFile(e.target.files[0])} /></label>
              
              <div className="modal-actions">
                <button type="button" className="outline-btn" onClick={() => setIsLeaveModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="primary-btn">ยืนยันการลา</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}