import { useEffect, useState } from "react";
import axios from "axios";
import { FiPlus, FiEdit2, FiTrash2, FiSave } from "react-icons/fi";
import "./HRLeaveTypeSettings.css";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function LeaveSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const [form, setForm] = useState({ typeName: "", isPaid: true, defaultDays: 0 });

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/leavetype", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error(err);
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
    setForm({ typeName: "", isPaid: true, defaultDays: 0 });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setIsEdit(true);
    setActiveId(t.leaveTypeId);
    setForm({
      typeName: t.typeName ?? "",
      isPaid: !!t.isPaid,
      defaultDays: t.defaultDays ?? 0,
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        defaultDays: Number(form.defaultDays),
      };

      if (isEdit) {
        await api.put(`/api/admin/leavetype/${activeId}`, payload, authHeader());
      } else {
        await api.post("/api/admin/leavetype", payload, authHeader());
      }

      setModalOpen(false);
      fetchTypes();
      await alertSuccess("สำเร็จ", "บันทึกประเภทการลาเรียบร้อยแล้ว");
    } catch (err) {
      await alertError("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกได้");
    }
  };

  const handleDelete = async (id) => {
    if (!(await alertConfirm("ยืนยันการลบ", "คุณต้องการลบประเภทการลานี้ใช่หรือไม่? (อาจกระทบข้อมูลโควต้าเดิม)", "ลบ"))) return;
    try {
      await api.delete(`/api/admin/leavetype/${id}`, authHeader());
      fetchTypes();
    } catch (err) {
      await alertError("ไม่สามารถลบได้", "โปรดลองใหม่อีกครั้ง");
    }
  };

  return (
    <div className="page-card ls">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">Leave Settings</h2>
          <p className="emp-sub">กำหนดวันลามาตรฐานสำหรับพนักงานทุกคน</p>
        </div>

        <button className="emp-btn emp-btn-primary" onClick={openAdd}>
          <FiPlus /> Add Type
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Type Name</th>
              <th>Paid Status</th>
              <th>Default Days (Per Year)</th>
              <th style={{ width: 150, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="empty">Loading...</td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">No leave types</td>
              </tr>
            ) : (
              types.map((t) => (
                <tr key={t.leaveTypeId}>
                  <td className="emp-strong">{t.typeName}</td>
                  <td>
                    <span className={`badge ${t.isPaid ? "badge-leave" : "badge-danger"}`}>
                      {t.isPaid ? "Paid Leave" : "Unpaid Leave"}
                    </span>
                  </td>
                  <td className="days-cell">
                    <span className="days-pill">{Number(t.defaultDays)} days</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="btn-group-row right">
                      <button className="emp-btn emp-btn-outline small" onClick={() => openEdit(t)} title="Edit">
                        <FiEdit2 />
                      </button>
                      <button
                        className="emp-btn emp-btn-outline small danger"
                        onClick={() => handleDelete(t.leaveTypeId)}
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
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
                <div className="emp-modal-sub">
                  {isEdit ? "แก้ไขข้อมูลประเภทการลา" : "เพิ่มประเภทการลาใหม่"}
                </div>
              </div>
              <button className="emp-x" type="button" onClick={() => setModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="emp-modal-body">
              <div className="form-col">
                <label>Type Name</label>
                <input
                  className="quota-input w-full"
                  value={form.typeName}
                  onChange={(e) => setForm({ ...form, typeName: e.target.value })}
                  required
                  placeholder="เช่น ลาพักร้อน, ลาป่วย"
                />
              </div>

              <div className="form-col">
                <label>Default Quota (Days)</label>
                <input
                  className="quota-input w-full"
                  type="number"
                  step="0.5"
                  min="0"
                  value={form.defaultDays}
                  onChange={(e) => setForm({ ...form, defaultDays: e.target.value })}
                  required
                />
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isPaid}
                  onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
                />
                Paid Leave (พนักงานยังได้รับค่าจ้างขณะลา)
              </label>
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="emp-btn emp-btn-primary" type="submit">
                <FiSave /> Save Type
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
