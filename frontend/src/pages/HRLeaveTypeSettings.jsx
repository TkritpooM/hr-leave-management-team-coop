import { useEffect, useState } from "react";
import axios from "axios";
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiRefreshCw, FiCalendar } from "react-icons/fi";
import "./HRLeaveTypeSettings.css";
import Swal from "sweetalert2";
import { alertError, alertSuccess } from "../utils/sweetAlert";
import { useTranslation } from "react-i18next";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function LeaveSettings() {
  const { t } = useTranslation();

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
    colorCode: "#3b82f6",
  });

  const fetchTypes = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/admin/leavetype", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error(err);
      alertError(t("Error"), t("Unable to fetch leave types"));
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
      title: `<span style="color: #b45309;">${t("Year-End Processing Policy")} ${currentYear}</span>`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #475569; background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fde68a;">
          <p><b>${t("Please read and understand the following policies:")}</b></p>
          <ul style="padding-left: 20px;">
            <li>${t("The system will use")} <b>${t("Remaining Days")}</b> ${t("from")} ${currentYear} ${t("for calculation.")}</li>
            <li>${t("Carry-forward only applies to types with")} <b>${t("Carry Forward")}</b> ${t("enabled.")}</li>
            <li>${t("Days carried over will not exceed the")} <b>${t("Max Carry Days")}</b> ${t("defined for each type.")}</li>
            <li>${t("New quotas for")} ${nextYear} ${t("will be automatically created for all employees.")}</li>
            <li><b>${t("Warning:")}</b> ${t("This action cannot be undone. Ensure all pending leave requests are processed first.")}</li>
          </ul>
        </div>
      `,
      icon: "warning",
      input: "checkbox",
      inputValue: 0,
      inputPlaceholder: t("I have read and accept the year-end processing policy"),
      confirmButtonText: t("Confirm"),
      confirmButtonColor: "#f59e0b",
      showCancelButton: true,
      cancelButtonText: t("Cancel"),
      inputValidator: (result) => (!result ? t("You must accept the policy before proceeding") : undefined),
    });

    if (!accept) return;

    try {
      setLoading(true);
      const res = await api.post("/api/admin/hr/process-carry-forward", {}, authHeader());
      await alertSuccess(t("Success"), res.data.message || `${t("Carry-forward completed for year")} ${nextYear}`);
    } catch (err) {
      console.error(err);
      await alertError(t("Error"), err.response?.data?.message || t("Unable to process year-end carry forward"));
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setIsEdit(false);
    setActiveId(null);
    setForm({
      typeName: "",
      isPaid: true,
      defaultDays: 0,
      canCarryForward: false,
      maxCarryDays: 0,
      colorCode: "#3b82f6",
    });
    setModalOpen(true);
  };

  const openEdit = (lt) => {
    setIsEdit(true);
    setActiveId(lt.leaveTypeId);
    setForm({
      typeName: lt.typeName ?? "",
      isPaid: !!lt.isPaid,
      defaultDays: lt.defaultDays ?? 0,
      canCarryForward: !!lt.canCarryForward,
      maxCarryDays: lt.maxCarryDays ?? 0,
      colorCode: lt.colorCode || "#3b82f6",
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
      await alertSuccess(t("Success"), t("Leave type saved successfully"));
    } catch (err) {
      console.error(err);
      await alertError(t("Error"), err.response?.data?.message || t("Unable to save leave type"));
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: t("Confirm Delete"),
      text: t("Are you sure you want to delete this leave type?"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: t("Delete"),
      cancelButtonText: t("Cancel"),
    });

    if (!confirm.isConfirmed) return;

    try {
      await api.delete(`/api/admin/leavetype/${id}`, authHeader());
      fetchTypes();
      await alertSuccess(t("Success"), t("Leave type deleted successfully"));
    } catch (err) {
      console.error(err);
      await alertError(t("Error"), t("Unable to delete. Please try again later"));
    }
  };

  return (
    <div className="page-card ls">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">{t("Leave Settings")}</h2>
          <p className="emp-sub">{t("Define standard leave quotas and carry-forward policies for employees")}</p>
        </div>

        <div className="emp-tools">
          <button
            className="emp-btn emp-btn-outline warn"
            onClick={handleProcessCarryForward}
            disabled={loading}
            title={t("Process carry forward for next year")}
            style={{ borderColor: "#f59e0b", color: "#b45309" }}
          >
            <FiCalendar /> {t("Process Year-End")}
          </button>

          <button className="emp-btn emp-btn-outline" onClick={fetchTypes} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} /> {t("Refresh")}
          </button>

          <button className="emp-btn emp-btn-primary" onClick={openAdd}>
            <FiPlus /> {t("Add Type")}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("Type Name & Policy")}</th>
              <th>{t("Paid Status")}</th>
              <th>{t("Default Days")}</th>
              <th>{t("Theme Color")}</th>
              <th style={{ width: 150, textAlign: "right" }}>{t("Actions")}</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="empty">
                  {t("Loading...")}
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty">
                  {t("No leave types found.")}
                </td>
              </tr>
            ) : (
              types.map((lt) => (
                <tr key={lt.leaveTypeId}>
                  <td className="emp-strong">
                    {lt.typeName}
                    {lt.canCarryForward ? (
                      <div className="policy-badge carry-yes">
                        {t("Carry-forward Enabled")} (Max {Number(lt.maxCarryDays)} {t("units.days")})
                      </div>
                    ) : (
                      <div className="policy-badge carry-no">{t("Carry-forward Disabled")}</div>
                    )}
                  </td>

                  <td>
                    <span className={`badge ${lt.isPaid ? "badge-leave" : "badge-danger"}`}>
                      {lt.isPaid ? t("Paid Leave") : t("Unpaid Leave")}
                    </span>
                  </td>

                  <td className="days-cell">
                    <span className="days-pill">
                      {Number(lt.defaultDays)} {t("units.days")}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "4px",
                          background: lt.colorCode || "#3b82f6",
                          border: "1px solid #e2e8f0",
                        }}
                      />
                      <span style={{ fontSize: "12px", color: "#64748b", fontFamily: "monospace" }}>
                        {lt.colorCode || "#3b82f6"}
                      </span>
                    </div>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div className="btn-group-row right">
                      <button className="emp-btn emp-btn-outline small" onClick={() => openEdit(lt)}>
                        <FiEdit2 />
                      </button>
                      <button className="emp-btn emp-btn-outline small danger" onClick={() => handleDelete(lt.leaveTypeId)}>
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
                <div className="emp-modal-title">{isEdit ? t("Edit Leave Type") : t("Add Leave Type")}</div>
                <div className="emp-modal-sub">
                  {isEdit ? t("Modify details and leave policies") : t("Create a new leave type category")}
                </div>
              </div>
              <button className="emp-x" type="button" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="emp-modal-body">
              <div className="form-col">
                <label>{t("Type Name")}</label>
                <input
                  className="quota-input w-full"
                  value={form.typeName}
                  onChange={(e) => setForm({ ...form, typeName: e.target.value })}
                  required
                  placeholder={t("e.g. Sick Leave, Vacation")}
                />
              </div>

              <div className="form-col">
                <label>{t("Default Quota (Days Per Year)")}</label>
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

              <label className="checkbox-label" style={{ marginBottom: "20px" }}>
                <input type="checkbox" checked={form.isPaid} onChange={(e) => setForm({ ...form, isPaid: e.target.checked })} />{" "}
                {t("Paid Leave")}
              </label>

              <hr style={{ border: "0", borderTop: "1px solid #eee", margin: "20px 0" }} />

              <div className="carry-forward-section" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px" }}>
                <label className="checkbox-label" style={{ fontWeight: "600", color: "#1e293b" }}>
                  <input
                    type="checkbox"
                    checked={form.canCarryForward}
                    onChange={(e) => setForm({ ...form, canCarryForward: e.target.checked })}
                  />{" "}
                  {t("Enable Carry Forward")}
                </label>

                {form.canCarryForward && (
                  <div className="form-col" style={{ marginTop: "15px", paddingLeft: "25px" }}>
                    <label>{t("Maximum Carry-over Days (Max Carry Days)")}</label>
                    <input
                      className="quota-input w-full"
                      type="number"
                      step="0.5"
                      min="0"
                      value={form.maxCarryDays}
                      onChange={(e) => setForm({ ...form, maxCarryDays: e.target.value })}
                      required={form.canCarryForward}
                    />
                  </div>
                )}
              </div>

              <div className="form-col" style={{ marginTop: "20px" }}>
                <label>{t("Theme Color for Calendar & Charts")}</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input
                    type="color"
                    value={form.colorCode}
                    onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                    style={{
                      width: "50px",
                      height: "38px",
                      padding: "0",
                      border: "1px solid #e2e8f0",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  />
                  <input
                    className="quota-input"
                    style={{ flex: 1 }}
                    value={form.colorCode}
                    onChange={(e) => setForm({ ...form, colorCode: e.target.value })}
                    placeholder={t("#HEXCODE")}
                  />
                </div>
              </div>
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" type="button" onClick={() => setModalOpen(false)}>
                {t("Cancel")}
              </button>
              <button className="emp-btn emp-btn-primary" type="submit">
                <FiSave /> {t("Save Policy")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
