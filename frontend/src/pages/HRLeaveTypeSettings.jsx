import { useEffect, useState } from "react";
import axios from "axios";
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiRefreshCw, FiCalendar } from "react-icons/fi";
import "./HRLeaveTypeSettings.css";
import Swal from "sweetalert2"; // นำเข้า Swal โดยตรงสำหรับ Custom Modal
import { alertError, alertSuccess } from "../utils/sweetAlert";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function LeaveSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [activeId, setActiveId] = useState(null);

  // 🔥 ฟังก์ชันประมวลผลสิ้นปีแบบมีนโยบายให้ยอมรับ
  const handleProcessCarryForward = async () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const { value: accept } = await Swal.fire({
      title: `<span style="color: #b45309;">นโยบายการประมวลผลสิ้นปี ${currentYear}</span>`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #475569; background: #fffbeb; padding: 15px; borderRadius: 8px; border: 1px solid #fde68a;">
          <p><b>โปรดอ่านและทำความเข้าใจนโยบายดังต่อไปนี้:</b></p>
          <ul style="padding-left: 20px;">
            <li>ระบบจะนำ <b>"วันลาคงเหลือ"</b> ของปี ${currentYear} มาคำนวณ</li>
            <li>การทบยอดจะเกิดขึ้นเฉพาะประเภทลาที่เปิดใช้งาน <b>Carry Forward</b> ไว้เท่านั้น</li>
            <li>จำนวนวันที่ทบไป จะไม่เกินค่า <b>Max Carry Days</b> ที่กำหนดไว้ในแต่ละประเภท</li>
            <li>โควต้าใหม่ของปี ${nextYear} จะถูกสร้างขึ้นโดยอัตโนมัติสำหรับพนักงานทุกคน</li>
            <li><b>คำเตือน:</b> การดำเนินการนี้ไม่สามารถย้อนกลับได้ โปรดตรวจสอบการอนุมัติวันลาที่ค้างอยู่ให้เสร็จสิ้นก่อน</li>
          </ul>
        </div>
      `,
      icon: 'warning',
      input: 'checkbox',
      inputValue: 0,
      inputPlaceholder: 'ฉันอ่านและยอมรับนโยบายการประมวลผลสิ้นปีข้างต้น',
      confirmButtonText: 'เริ่มประมวลผล <i class="fa fa-arrow-right"></i>',
      confirmButtonColor: '#f59e0b',
      showCancelButton: true,
      cancelButtonText: 'ยกเลิก',
      inputValidator: (result) => {
        return !result && 'คุณต้องกดยอมรับนโยบายก่อนดำเนินการต่อ'
      }
    });

    if (accept) {
      try {
        setLoading(true);
        const res = await api.post("/api/admin/hr/process-carry-forward", {}, authHeader());
        await alertSuccess("สำเร็จ", res.data.message || `ประมวลผลยอดทบไปปี ${nextYear} เรียบร้อยแล้ว`);
      } catch (err) {
        console.error(err);
        await alertError("ผิดพลาด", err.response?.data?.message || "ไม่สามารถประมวลผลได้");
      } finally {
        setLoading(false);
      }
    }
  };

  const [form, setForm] = useState({ 
    typeName: "", 
    isPaid: true, 
    defaultDays: 0,
    canCarryForward: false,
    maxCarryDays: 0
  });

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/leavetype", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error(err);
      alertError("Error", "ไม่สามารถดึงข้อมูลประเภทการลาได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const openAdd = () => {
    setIsEdit(false);
    setActiveId(null);
    setForm({ 
      typeName: "", isPaid: true, defaultDays: 0,
      canCarryForward: false, maxCarryDays: 0
    });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setIsEdit(true);
    setActiveId(t.leaveTypeId);
    setForm({
      typeName: t.typeName ?? "",
      isPaid: !!t.isPaid,
      defaultDays: t.defaultDays ?? 0,
      canCarryForward: !!t.canCarryForward,
      maxCarryDays: t.maxCarryDays ?? 0
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        defaultDays: Number(form.defaultDays),
        maxCarryDays: form.canCarryForward ? Number(form.maxCarryDays) : 0,
      };
      if (isEdit) {
        await api.put(`/api/admin/leavetype/${activeId}`, payload, authHeader());
      } else {
        await api.post("/api/admin/leavetype", payload, authHeader());
      }
      setModalOpen(false);
      fetchTypes();
      await alertSuccess("สำเร็จ", "บันทึกข้อมูลเรียบร้อยแล้ว");
    } catch (err) {
      await alertError("เกิดข้อผิดพลาด", err.response?.data?.message || "ไม่สามารถบันทึกได้");
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: "คุณต้องการลบประเภทการลานี้ใช่หรือไม่?",
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    });
    if (confirm.isConfirmed) {
      try {
        await api.delete(`/api/admin/leavetype/${id}`, authHeader());
        fetchTypes();
        await alertSuccess("สำเร็จ", "ลบข้อมูลเรียบร้อยแล้ว");
      } catch (err) {
        await alertError("ไม่สามารถลบได้", "โปรดลองใหม่อีกครั้ง");
      }
    }
  };

  return (
    <div className="page-card ls">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">Leave Settings</h2>
          <p className="emp-sub">กำหนดวันลามาตรฐานและนโยบายการทบยอดสำหรับพนักงาน</p>
        </div>

        <div className="emp-tools">
          <button 
            className="emp-btn emp-btn-outline warn" 
            onClick={handleProcessCarryForward} 
            disabled={loading}
            title="ประมวลผลยอดทบไปปีหน้า"
            style={{ borderColor: '#f59e0b', color: '#b45309' }}
          >
            <FiCalendar /> Process Year-End
          </button>
          <button className="emp-btn emp-btn-outline" onClick={fetchTypes} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className="emp-btn emp-btn-primary" onClick={openAdd}>
            <FiPlus /> Add Type
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Type Name & Policy</th>
              <th>Paid Status</th>
              <th>Default Days</th>
              <th style={{ width: 150, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">Loading...</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan="4" className="empty">No leave types found.</td></tr>
            ) : (
              types.map((t) => (
                <tr key={t.leaveTypeId}>
                  <td className="emp-strong">
                    {t.typeName}
                    {t.canCarryForward ? (
                      <div className="policy-badge carry-yes">ทบยอดได้ (สูงสุด {Number(t.maxCarryDays)} วัน)</div>
                    ) : (
                      <div className="policy-badge carry-no">ไม่ทบยอด</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${t.isPaid ? "badge-leave" : "badge-danger"}`}>{t.isPaid ? "Paid Leave" : "Unpaid Leave"}</span>
                  </td>
                  <td className="days-cell"><span className="days-pill">{Number(t.defaultDays)} days</span></td>
                  <td style={{ textAlign: "right" }}>
                    <div className="btn-group-row right">
                      <button className="emp-btn emp-btn-outline small" onClick={() => openEdit(t)}><FiEdit2 /></button>
                      <button className="emp-btn emp-btn-outline small danger" onClick={() => handleDelete(t.leaveTypeId)}><FiTrash2 /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="emp-modal-backdrop" onClick={() => setModalOpen(false)}>
          <form className="emp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">{isEdit ? "Edit Leave Type" : "Add Leave Type"}</div>
                <div className="emp-modal-sub">{isEdit ? "แก้ไขข้อมูลและนโยบายการลา" : "เพิ่มประเภทการลาใหม่"}</div>
              </div>
              <button className="emp-x" type="button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="emp-modal-body">
              <div className="form-col">
                <label>Type Name</label>
                <input className="quota-input w-full" value={form.typeName} onChange={(e) => setForm({ ...form, typeName: e.target.value })} required />
              </div>
              <div className="form-col">
                <label>Default Quota (Days Per Year)</label>
                <input className="quota-input w-full" type="number" step="0.5" min="0" value={form.defaultDays} onChange={(e) => setForm({ ...form, defaultDays: e.target.value })} required />
              </div>
              <label className="checkbox-label" style={{ marginBottom: '20px' }}>
                <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} /> Paid Leave
              </label>
              <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '20px 0' }} />
              <div className="carry-forward-section" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                <label className="checkbox-label" style={{ fontWeight: '600', color: '#1e293b' }}>
                  <input type="checkbox" checked={form.canCarryForward} onChange={(e) => setForm({ ...form, canCarryForward: e.target.checked })} /> เปิดใช้งานการทบยอด
                </label>
                {form.canCarryForward && (
                  <div className="form-col" style={{ marginTop: '15px', paddingLeft: '25px' }}>
                    <label>จำนวนวันที่ทบได้สูงสุด (Max Carry Days)</label>
                    <input className="quota-input w-full" type="number" step="0.5" min="0" value={form.maxCarryDays} onChange={(e) => setForm({ ...form, maxCarryDays: e.target.value })} required={form.canCarryForward} />
                  </div>
                )}
              </div>
            </div>
            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="emp-btn emp-btn-primary" type="submit"><FiSave /> Save Policy</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}