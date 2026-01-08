import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../api/axiosClient";
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import { useTranslation } from "react-i18next";

const toNum = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export default function Employees() {
  const { t } = useTranslation();

  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editOpen, setEditOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);

  const [activeEmp, setActiveEmp] = useState(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "Worker",
    joiningDate: "",
    isActive: true,
  });

  const [quotaYear, setQuotaYear] = useState(new Date().getFullYear());
  const [quotaForm, setQuotaForm] = useState([]); // [{leaveTypeId, usedDays, totalDays, carriedOverDays, maxCarryDays, carryAllowed}]

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [empRes, typeRes] = await Promise.all([
        axiosClient.get("/employees"),
        axiosClient.get("/leave/types"),
      ]);
      setEmployees(empRes.data?.employees || empRes.data || []);
      setTypes(typeRes.data?.types || typeRes.data || []);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        t("pages.hrEmployees.alert.loadFailed", "Failed to load employees.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return employees.filter((emp) => {
      if (roleFilter !== "all" && String(emp.role || "").toLowerCase() !== roleFilter) return false;
      if (activeFilter === "active" && emp.isActive === false) return false;
      if (activeFilter === "inactive" && emp.isActive !== false) return false;

      if (!qq) return true;
      const name = `${emp.firstName || ""} ${emp.lastName || ""}`.toLowerCase();
      const email = String(emp.email || "").toLowerCase();
      const role = String(emp.role || "").toLowerCase();
      return name.includes(qq) || email.includes(qq) || role.includes(qq);
    });
  }, [employees, q, roleFilter, activeFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const openEdit = (emp) => {
    setActiveEmp(emp);
    setEditForm({
      firstName: emp.firstName || "",
      lastName: emp.lastName || "",
      email: emp.email || "",
      role: emp.role || "Worker",
      joiningDate: emp.joiningDate ? String(emp.joiningDate).slice(0, 10) : "",
      isActive: emp.isActive !== false,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      await axiosClient.put(`/employees/${activeEmp.id}`, editForm);
      await alertSuccess(t("common.success", "Success"), t("pages.hrEmployees.alert.saved", "Saved."));
      setEditOpen(false);
      setActiveEmp(null);
      fetchAll();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message || t("common.somethingWentWrong", "Something went wrong.")
      );
    }
  };

  const toggleActive = async (emp) => {
    const willActive = emp.isActive === false;
    const ok = await alertConfirm(
      willActive
        ? t("pages.hrEmployees.alert.activateTitle", "Activate employee?")
        : t("pages.hrEmployees.alert.deactivateTitle", "Deactivate employee?"),
      willActive
        ? t("pages.hrEmployees.alert.activateText", "This will allow the employee to log in again.")
        : t("pages.hrEmployees.alert.deactivateText", "This will prevent the employee from logging in."),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      await axiosClient.patch(`/employees/${emp.id}/active`, { isActive: willActive });
      await alertSuccess(t("common.success", "Success"), t("pages.hrEmployees.alert.updated", "Updated."));
      fetchAll();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message || t("common.somethingWentWrong", "Something went wrong.")
      );
    }
  };

  const openQuota = async (emp) => {
    try {
      setLoading(true);
      setActiveEmp(emp);
      const res = await axiosClient.get(`/leave/quota/${emp.id}?year=${quotaYear}`);
      const rows = res.data?.quotas || res.data || [];

      // Normalize ให้แก้ไขง่าย + enforce max carry editability
      setQuotaForm(
        rows.map((r) => ({
          leaveTypeId: r.leaveTypeId,
          typeName: r.leaveType?.typeName || "-",
          usedDays: toNum(r.usedDays),
          totalDays: toNum(r.totalDays),
          carriedOverDays: toNum(r.carriedOverDays),
          maxCarryDays: toNum(r.leaveType?.maxCarryDays ?? r.maxCarryDays ?? 0),
          carryAllowed: !!(r.leaveType?.carryForwardEnabled ?? r.carryForwardEnabled),
        }))
      );

      setQuotaOpen(true);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        t("pages.hrEmployees.alert.loadQuotaFailed", "Failed to load quotas.")
      );
    } finally {
      setLoading(false);
    }
  };

  const saveQuota = async () => {
    try {
      setLoading(true);
      await axiosClient.put(`/leave/quota/${activeEmp.id}?year=${quotaYear}`, {
        quotas: quotaForm.map((q) => ({
          leaveTypeId: q.leaveTypeId,
          usedDays: toNum(q.usedDays),
          totalDays: toNum(q.totalDays),
          carriedOverDays: toNum(q.carriedOverDays),
        })),
      });

      await alertSuccess(
        t("common.success", "Success"),
        t("pages.hrEmployees.alert.quotaSaved", "Quota saved.")
      );

      setQuotaOpen(false);
      setActiveEmp(null);
      fetchAll();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message || t("common.somethingWentWrong", "Something went wrong.")
      );
    } finally {
      setLoading(false);
    }
  };

  const syncDefault = async () => {
    const ok = await alertConfirm(
      t("pages.hrEmployees.alert.syncTitle", "Sync default quotas?"),
      t("pages.hrEmployees.alert.syncText", "This will sync standard quotas to employees."),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      setLoading(true);
      await axiosClient.post("/leave/quota/sync-default");
      await alertSuccess(
        t("common.success", "Success"),
        t("pages.hrEmployees.alert.synced", "Synced default quotas.")
      );
      fetchAll();
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message || t("common.somethingWentWrong", "Something went wrong.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-card">
      <div className="la-header">
        <div>
          <h1 className="la-title">{t("pages.hrEmployees.title", "Employees")}</h1>
          <p className="la-subtitle">
            {t("pages.hrEmployees.subtitle", "Manage employees and leave quotas")}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn outline" onClick={syncDefault}>
            {t("pages.hrEmployees.syncDefault", "Sync Default")}
          </button>
          <button className="btn outline" onClick={fetchAll}>
            {t("common.refresh", "Refresh")}
          </button>
        </div>
      </div>

      <div className="emp-filters">
        <input
          className="audit-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t("pages.hrEmployees.searchPlaceholder", "Search name / email / role...")}
        />

        <select
          className="audit-input"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t("pages.hrEmployees.filters.allRoles", "All roles")}</option>
          <option value="hr">{t("pages.hrEmployees.filters.hr", "HR")}</option>
          <option value="worker">{t("pages.hrEmployees.filters.worker", "Worker")}</option>
        </select>

        <select
          className="audit-input"
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">{t("pages.hrEmployees.filters.allStatus", "All status")}</option>
          <option value="active">{t("pages.hrEmployees.filters.activeOnly", "Active only")}</option>
          <option value="inactive">{t("pages.hrEmployees.filters.inactiveOnly", "Inactive only")}</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("pages.hrEmployees.table.id", "ID")}</th>
              <th>{t("pages.hrEmployees.table.name", "Name")}</th>
              <th>{t("pages.hrEmployees.table.emailRole", "Email / Role")}</th>
              <th style={{ textAlign: "center" }}>{t("common.actions", "Actions")}</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">{t("common.loading", "Loading...")}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="4" className="empty">{t("pages.hrEmployees.noEmployeesFound", "No employees found")}</td></tr>
            ) : (
              paged.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.id}</td>

                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong>
                        {emp.firstName} {emp.lastName}
                      </strong>
                      {emp.isActive === false && (
                        <span className="badge badge-gray">
                          {t("pages.hrEmployees.badge.inactive", "Inactive")}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ color: "#475569" }}>
                    <div style={{ fontWeight: 700 }}>{emp.email}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {t("pages.hrEmployees.role", "Role")}: {emp.role}
                    </div>
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <button className="btn outline small" onClick={() => openEdit(emp)}>
                      {t("common.edit", "Edit")}
                    </button>

                    <button className="btn outline small" style={{ marginLeft: 8 }} onClick={() => openQuota(emp)}>
                      {t("pages.hrEmployees.quota", "Quota")}
                    </button>

                    <button className="btn outline small" style={{ marginLeft: 8 }} onClick={() => toggleActive(emp)}>
                      {emp.isActive === false
                        ? t("pages.hrEmployees.activate", "Activate")
                        : t("pages.hrEmployees.deactivate", "Deactivate")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Pagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="emp-modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="emp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">{t("pages.hrEmployees.edit.title", "Edit Employee")}</div>
                <div className="emp-modal-sub">{t("pages.hrEmployees.edit.subtitle", "Update employee info and status")}</div>
              </div>
              <button className="emp-x" onClick={() => setEditOpen(false)} aria-label={t("common.close", "Close")}>
                ×
              </button>
            </div>

            <div className="emp-modal-body">
              <div className="form-row">
                <label>{t("pages.hrEmployees.form.firstName", "First Name")}</label>
                <input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} />
              </div>

              <div className="form-row">
                <label>{t("pages.hrEmployees.form.lastName", "Last Name")}</label>
                <input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} />
              </div>

              <div className="form-row">
                <label>{t("pages.hrEmployees.form.email", "Email Address")}</label>
                <input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
              </div>

              <div className="form-row">
                <label>{t("pages.hrEmployees.form.role", "Role")}</label>
                <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="HR">{t("pages.hrEmployees.filters.hr", "HR")}</option>
                  <option value="Worker">{t("pages.hrEmployees.filters.worker", "Worker")}</option>
                </select>
              </div>

              <div className="form-row">
                <label>{t("pages.hrEmployees.form.joiningDate", "Joining Date")}</label>
                <input
                  type="date"
                  value={editForm.joiningDate}
                  onChange={(e) => setEditForm((p) => ({ ...p, joiningDate: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label>{t("pages.hrEmployees.form.active", "Active")}</label>
                <select
                  value={String(editForm.isActive)}
                  onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.value === "true" }))}
                >
                  <option value="true">{t("common.active", "Active")}</option>
                  <option value="false">{t("common.inactive", "Inactive")}</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button className="emp-btn emp-btn-outline" onClick={() => setEditOpen(false)}>
                  {t("common.cancel", "Cancel")}
                </button>
                <button className="emp-btn emp-btn-primary" onClick={saveEdit}>
                  {t("common.save", "Save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quota modal */}
      {quotaOpen && (
        <div className="emp-modal-backdrop" onClick={() => setQuotaOpen(false)}>
          <div className="emp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">
                  {t("pages.hrEmployees.quotaModal.title", "Set Leave Quota")} —{" "}
                  {activeEmp?.firstName} {activeEmp?.lastName}
                </div>
                <div className="emp-modal-sub">
                  {t("pages.hrEmployees.quotaModal.subtitle", "Edit totals and carried over days per leave type")}
                </div>
              </div>
              <button className="emp-x" onClick={() => setQuotaOpen(false)} aria-label={t("common.close", "Close")}>
                ×
              </button>
            </div>

            <div className="emp-modal-body">
              <div className="form-row">
                <label>{t("pages.hrEmployees.quotaModal.year", "Year")}</label>
                <input
                  type="number"
                  value={quotaYear}
                  onChange={(e) => setQuotaYear(Number(e.target.value))}
                />
                <small style={{ color: "#64748b" }}>
                  {t(
                    "pages.hrEmployees.quotaModal.note",
                    "* Green field = editable carried over days | Gray field = carried over not allowed (configure in Leave Settings)"
                  )}
                </small>
              </div>

              <div className="table-wrap" style={{ marginTop: 10 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("pages.hrEmployees.quotaModal.leaveTypeUsed", "Leave Type / Used")}</th>
                      <th>{t("pages.hrEmployees.quotaModal.thisYear", "This Year")}</th>
                      <th>{t("pages.hrEmployees.quotaModal.carried", "Carried")}</th>
                    </tr>
                  </thead>

                  <tbody>
                    {quotaForm.map((qRow, idx) => (
                      <tr key={qRow.leaveTypeId}>
                        <td>
                          <div style={{ fontWeight: 800 }}>{qRow.typeName}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {t("pages.hrEmployees.quotaModal.usedDays", "Used")}: {qRow.usedDays}
                          </div>
                        </td>

                        <td>
                          <input
                            type="number"
                            value={qRow.totalDays}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuotaForm((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], totalDays: v };
                                return copy;
                              });
                            }}
                          />
                        </td>

                        <td>
                          <input
                            type="number"
                            value={qRow.carriedOverDays}
                            disabled={!qRow.carryAllowed}
                            onChange={(e) => {
                              const v = e.target.value;
                              setQuotaForm((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], carriedOverDays: v };
                                return copy;
                              });
                            }}
                            style={
                              qRow.carryAllowed
                                ? { background: "rgba(34,197,94,0.08)", borderColor: "rgba(34,197,94,0.35)" }
                                : { background: "#f1f5f9", borderColor: "#e2e8f0" }
                            }
                            title={
                              qRow.carryAllowed
                                ? t(
                                    "pages.hrEmployees.quotaModal.carryHintAllowed",
                                    "Carry over allowed (Max Carry Days applies)"
                                  )
                                : t(
                                    "pages.hrEmployees.quotaModal.carryHintBlocked",
                                    "Carry over disabled for this leave type"
                                  )
                            }
                          />
                          {qRow.carryAllowed && qRow.maxCarryDays >= 0 && (
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                              {t("pages.hrEmployees.quotaModal.maxCarryDays", "Max")}: {qRow.maxCarryDays}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button className="emp-btn emp-btn-outline" onClick={() => setQuotaOpen(false)}>
                  {t("common.cancel", "Cancel")}
                </button>
                <button className="emp-btn emp-btn-primary" onClick={saveQuota} disabled={loading}>
                  {loading ? t("common.saving", "Saving...") : t("pages.hrEmployees.quotaModal.saveQuota", "Save Quota")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
