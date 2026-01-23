import { useEffect, useState } from "react";
import axios from "axios";
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiRefreshCw, FiCalendar } from "react-icons/fi";
import "./HRLeaveTypeSettings.css";
import Swal from "sweetalert2";
import { alertError, alertSuccess } from "../utils/sweetAlert";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function LeaveSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  // Check new granular permission or fallback to Admin
  const canManage = isAdmin || user?.permissions?.includes('manage_leave_configuration');

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
      await alertError(t("common.error"), t("pages.leaveTypeSettings.alert.fetchFailed"));
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
      title: `<span style="color: #b45309;">${t("pages.leaveTypeSettings.yearEndPolicyTitle", {
        year: currentYear,
      })}</span>`,
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #475569; background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fde68a;">
          <p><b>${t("pages.leaveTypeSettings.yearEndPolicyIntro")}</b></p>
          <ul style="padding-left: 20px;">
            <li>${t("pages.leaveTypeSettings.yearEndPolicy.bullet1", { year: currentYear })}</li>
            <li>${t("pages.leaveTypeSettings.yearEndPolicy.bullet2")}</li>
            <li>${t("pages.leaveTypeSettings.yearEndPolicy.bullet3")}</li>
            <li>${t("pages.leaveTypeSettings.yearEndPolicy.bullet4", { year: nextYear })}</li>
            <li><b>${t("pages.leaveTypeSettings.yearEndPolicy.warningLabel")}</b> ${t("pages.leaveTypeSettings.yearEndPolicy.bullet5")}</li>
          </ul>
        </div>
      `,
      icon: "warning",
      input: "checkbox",
      inputValue: 0,
      inputPlaceholder: t("pages.leaveTypeSettings.yearEndPolicyAccept"),
      confirmButtonText: t("pages.leaveTypeSettings.confirmButtonText"),
      confirmButtonColor: "#f59e0b",
      showCancelButton: true,
      cancelButtonText: t("pages.leaveTypeSettings.cancelButtonText"),
      inputValidator: (result) => {
        return !result && t("pages.leaveTypeSettings.yearEndPolicyMustAccept");
      },
    });

    if (accept) {
      try {
        setLoading(true);
        const res = await api.post("/api/admin/hr/process-carry-forward", {}, authHeader());
        await alertSuccess(
          t("common.success"),
          res.data.message || t("pages.leaveTypeSettings.alert.carryForwardSuccess", { year: nextYear })
        );
      } catch (err) {
        console.error(err);
        await alertError(t("common.error"), err.response?.data?.message || t("pages.leaveTypeSettings.alert.carryForwardFailed"));
      } finally {
        setLoading(false);
      }
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
      await alertSuccess(t("common.success"), t("pages.leaveTypeSettings.alert.saved"));
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || t("pages.leaveTypeSettings.alert.saveFailed"));
    }
  };

  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: t("pages.leaveTypeSettings.delete.title"),
      text: t("pages.leaveTypeSettings.delete.text"),
      icon: "error",
      showCancelButton: true,
      confirmButtonText: t("pages.leaveTypeSettings.confirmButtonText"),
      cancelButtonText: t("pages.leaveTypeSettings.cancelButtonText"),
    });

    if (confirm.isConfirmed) {
      try {
        await api.delete(`/api/admin/leavetype/${id}`, authHeader());
        fetchTypes();
        await alertSuccess(t("common.success"), t("pages.leaveTypeSettings.alert.deleted"));
      } catch (err) {
        await alertError(t("common.error"), t("pages.leaveTypeSettings.alert.deleteFailed"));
      }
    }
  };

  return (
    <div className="page-card ls">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">{t("pages.leaveTypeSettings.title")}</h2>
          <p className="emp-sub">{t("pages.leaveTypeSettings.subtitle")}</p>
        </div>

        <div className="emp-tools">
          {canManage && (
            <button
              className="emp-btn emp-btn-outline warn"
              onClick={handleProcessCarryForward}
              disabled={loading}
              title={t("pages.leaveTypeSettings.buttons.processCarryForwardTooltip")}
              style={{ borderColor: "#f59e0b", color: "#b45309" }}
            >
              <FiCalendar />
              {t("pages.leaveTypeSettings.buttons.processYearEnd")}
            </button>
          )}

          <button className="emp-btn emp-btn-outline" onClick={fetchTypes} disabled={loading}>
            <FiRefreshCw className={loading ? "spin" : ""} />
            {t("pages.leaveTypeSettings.buttons.refresh")}
          </button>

          {canManage && (
            <button className="emp-btn emp-btn-primary" onClick={openAdd}>
              <FiPlus />
              {t("pages.leaveTypeSettings.buttons.addType")}
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("pages.leaveTypeSettings.table.typeNamePolicy")}</th>
              <th>{t("pages.leaveTypeSettings.table.paidStatus")}</th>
              <th>{t("pages.leaveTypeSettings.table.defaultDays")}</th>
              <th>{t("pages.leaveTypeSettings.table.themeColor")}</th>
              <th style={{ width: 150, textAlign: "right" }}>{t("pages.leaveTypeSettings.table.actions")}</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="empty">
                  {t("common.loading")}
                </td>
              </tr>
            ) : types.length === 0 ? (
              <tr>
                <td colSpan="5" className="empty">
                  {t("pages.leaveTypeSettings.noLeaveTypesFound")}
                </td>
              </tr>
            ) : (
              types.map((type) => (
                <tr key={type.leaveTypeId}>
                  <td className="emp-strong">
                    {type.typeName}

                    {type.canCarryForward ? (
                      <div className="policy-badge carry-yes">
                        {t("pages.leaveTypeSettings.badges.carryForwardEnabled", {
                          max: Number(type.maxCarryDays),
                        })}
                      </div>
                    ) : (
                      <div className="policy-badge carry-no">
                        {t("pages.leaveTypeSettings.badges.carryForwardDisabled")}
                      </div>
                    )}
                  </td>

                  <td>
                    <span className={`badge ${type.isPaid ? "badge-leave" : "badge-danger"}`}>
                      {type.isPaid
                        ? t("pages.leaveTypeSettings.paid.paidLeave")
                        : t("pages.leaveTypeSettings.paid.unpaidLeave")}
                    </span>
                  </td>

                  <td className="days-cell">
                    <span className="days-pill">
                      {t("pages.leaveTypeSettings.daysLabel", { days: Number(type.defaultDays) })}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "4px",
                          background: type.colorCode || "#3b82f6",
                          border: "1px solid #e2e8f0",
                        }}
                      />
                      <span style={{ fontSize: "12px", color: "#64748b", fontFamily: "monospace" }}>
                        {type.colorCode || "#3b82f6"}
                      </span>
                    </div>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    {canManage && (
                      <div className="btn-group-row right">
                        <button className="emp-btn emp-btn-outline small" onClick={() => openEdit(type)} title={t("pages.leaveTypeSettings.buttons.edit")}>
                          <FiEdit2 />
                        </button>
                        <button className="emp-btn emp-btn-outline small danger" onClick={() => handleDelete(type.leaveTypeId)} title={t("pages.leaveTypeSettings.buttons.delete")}>
                          <FiTrash2 />
                        </button>
                      </div>
                    )}
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
                <div className="emp-modal-title">
                  {isEdit ? t("pages.leaveTypeSettings.modal.editTitle") : t("pages.leaveTypeSettings.modal.addTitle")}
                </div>
                <div className="emp-modal-sub">
                  {isEdit ? t("pages.leaveTypeSettings.modal.editSubtitle") : t("pages.leaveTypeSettings.modal.addSubtitle")}
                </div>
              </div>
              <button className="emp-x" type="button" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>

            <div className="emp-modal-body">
              <div className="form-col">
                <label>{t("pages.leaveTypeSettings.form.typeName")}</label>
                <input
                  className="quota-input w-full"
                  value={form.typeName}
                  onChange={(e) => setForm({ ...form, typeName: e.target.value })}
                  required
                  placeholder={t("pages.leaveTypeSettings.examples.leaveTypeName")}
                />
              </div>

              <div className="form-col">
                <label>{t("pages.leaveTypeSettings.form.defaultQuotaDaysPerYear")}</label>
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
                <input
                  type="checkbox"
                  checked={form.isPaid}
                  onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
                />{" "}
                {t("pages.leaveTypeSettings.form.paidLeave")}
              </label>

              <hr style={{ border: "0", borderTop: "1px solid #eee", margin: "20px 0" }} />

              <div className="carry-forward-section" style={{ background: "#f8fafc", padding: "15px", borderRadius: "8px" }}>
                <label className="checkbox-label" style={{ fontWeight: "600", color: "#1e293b" }}>
                  <input
                    type="checkbox"
                    checked={form.canCarryForward}
                    onChange={(e) => setForm({ ...form, canCarryForward: e.target.checked })}
                  />{" "}
                  {t("pages.leaveTypeSettings.form.enableCarryForward")}
                </label>

                {form.canCarryForward && (
                  <div className="form-col" style={{ marginTop: "15px", paddingLeft: "25px" }}>
                    <label>{t("pages.leaveTypeSettings.form.maxCarryOverDays")}</label>
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
                <label>{t("pages.leaveTypeSettings.form.themeColor")}</label>
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
                    placeholder={t("pages.leaveTypeSettings.form.hexPlaceholder")}
                  />
                </div>
              </div>
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" type="button" onClick={() => setModalOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="emp-btn emp-btn-primary" type="submit">
                <FiSave />
                {t("pages.leaveTypeSettings.buttons.savePolicy")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
