import { useEffect, useState } from "react";
import axios from "axios";
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiRefreshCw, FiCalendar } from "react-icons/fi";
import "./HRLeaveTypeSettings.css";
import Swal from "sweetalert2"; 
import { alertError, alertSuccess } from "../utils/sweetAlert";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function LeaveSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const [form, setForm] = useState({ 
    typeName: "", 
    isPaid: true, 
    defaultDays: 0,
    canCarryForward: false,
    maxCarryDays: 0,
    colorCode: "#3b82f6"
  });

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/leavetype", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error(err);
      alertError("Error", "Unable to fetch leave types");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const handleProcessCarryForward = async () => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const { value: accept } = await Swal.fire({
      title: `<span style="color: #b45309;">Year-End Processing Policy ${currentYear}</span>`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #475569; background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fde68a;">
          <p><b>Please read and understand the following policies:</b></p>
          <ul style="padding-left: 20px;">
            <li>The system will use <b>"Remaining Days"</b> from ${currentYear} for calculation.</li>
            <li>Carry-forward only applies to types with <b>Carry Forward</b> enabled.</li>
            <li>Days carried over will not exceed the <b>Max Carry Days</b> defined for each type.</li>
            <li>New quotas for ${nextYear} will be automatically created for all employees.</li>
            <li><b>Warning:</b> This action cannot be undone. Ensure all pending leave requests are processed first.</li>
          </ul>
        </div>
      `,
      icon: 'warning',
      input: 'checkbox',
      inputValue: 0,
      inputPlaceholder: 'I have read and accept the year-end processing policy',
      confirmButtonText: 'Start Processing <i class="fa fa-arrow-right"></i>',
      confirmButtonColor: '#f59e0b',
      showCancelButton: true,
      cancelButtonText: 'Cancel',
      inputValidator: (result) => {
        return !result && 'You must accept the policy before proceeding'
      }
    });

    if (accept) {
      try {
        setLoading(true);
        const res = await api.post("/api/admin/hr/process-carry-forward", {}, authHeader());
        await alertSuccess("Success", res.data.message || `Carry-forward to year ${nextYear} completed successfully`);
      } catch (err) {
        console.error(err);
        await alertError("Error", err.response?.data?.message || "Unable to process year-end carry forward");
      } finally {
        setLoading(false);
      }
    }
  };

  const openAdd = () => {
    setIsEdit(false);
    setActiveId(null);
    setForm({ 
      typeName: "", isPaid: true, defaultDays: 0,
      canCarryForward: false, maxCarryDays: 0,
      colorCode: "#3b82f6"
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
      maxCarryDays: t.maxCarryDays ?? 0,
      colorCode: t.colorCode || "#3b82f6"
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
      await alertSuccess("Success", "Leave type saved successfully");
    } catch (err) {
      await alertError("Error", err.response?.data?.message || "Unable to save leave type");
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: 'Confirm Delete',
      text: "Are you sure you want to delete this leave type?",
      icon: 'error',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    });
    if (confirm.isConfirmed) {
      try {
        await api.delete(`/api/admin/leavetype/${id}`, authHeader());
        fetchTypes();
        await alertSuccess("Success", "Leave type deleted successfully");
      } catch (err) {
        await alertError("Error", "Unable to delete. Please try again later");
      }
    }
  };

  return (
    <div className="page-card ls">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">Leave Settings</h2>
          <p className="emp-sub">Define standard leave quotas and carry-forward policies for employees</p>
        </div>

        <div className="emp-tools">
          <button 
            className="emp-btn emp-btn-outline warn" 
            onClick={handleProcessCarryForward} 
            disabled={loading}
            title="Process carry forward for next year"
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
              <th>Theme Color</th>
              <th style={{ width: 150, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="empty">Loading...</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan="5" className="empty">No leave types found.</td></tr>
            ) : (
              types.map((t) => (
                <tr key={t.leaveTypeId}>
                  <td className="emp-strong">
                    {t.typeName}
                    {t.canCarryForward ? (
                      <div className="policy-badge carry-yes">Carry-forward Enabled (Max {Number(t.maxCarryDays)} Days)</div>
                    ) : (
                      <div className="policy-badge carry-no">Carry-forward Disabled</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${t.isPaid ? "badge-leave" : "badge-danger"}`}>{t.isPaid ? "Paid Leave" : "Unpaid Leave"}</span>
                  </td>
                  <td className="days-cell"><span className="days-pill">{Number(t.defaultDays)} days</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: t.colorCode || '#3b82f6', border: '1px solid #e2e8f0' }}></div>
                      <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{t.colorCode || '#3b82f6'}</span>
                    </div>
                  </td>
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
                <div className="emp-modal-sub">{isEdit ? "Modify details and leave policies" : "Create a new leave type category"}</div>
              </div>
              <button className="emp-x" type="button" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="emp-modal-body">
              <div className="form-col">
                <label>Type Name</label>
                <input className="quota-input w-full" value={form.typeName} onChange={(e) => setForm({ ...form, typeName: e.target.value })} required placeholder="e.g. Sick Leave, Vacation" />
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
                  <input type="checkbox" checked={form.canCarryForward} onChange={(e) => setForm({ ...form, canCarryForward: e.target.checked })} /> Enable Carry Forward
                </label>
                {form.canCarryForward && (
                  <div className="form-col" style={{ marginTop: '15px', paddingLeft: '25px' }}>
                    <label>Maximum Carry-over Days (Max Carry Days)</label>
                    <input className="quota-input w-full" type="number" step="0.5" min="0" value={form.maxCarryDays} onChange={(e) => setForm({ ...form, maxCarryDays: e.target.value })} required={form.canCarryForward} />
                  </div>
                )}
              </div>
              <div className="form-col" style={{ marginTop: '20px' }}>
                <label>Theme Color for Calendar & Charts</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="color" value={form.colorCode} onChange={(e) => setForm({ ...form, colorCode: e.target.value })} style={{ width: '50px', height: '38px', padding: '0', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer' }} />
                  <input className="quota-input" style={{ flex: 1 }} value={form.colorCode} onChange={(e) => setForm({ ...form, colorCode: e.target.value })} placeholder="#HEXCODE" />
                </div>
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