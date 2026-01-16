import { useEffect, useMemo, useState } from "react";
import { FiEdit2, FiSettings, FiRefreshCw, FiUserPlus, FiToggleLeft, FiToggleRight, FiClock, FiDownload, FiLayers, FiTrash2, FiPlus, FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import "./HREmployees.css";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import { useTranslation } from "react-i18next";

export default function Employees() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [departments, setDepartments] = useState([]); // NEW
  const [loading, setLoading] = useState(true);

  // Phase 2 filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const [quotaOpen, setQuotaOpen] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false); // NEW
  const [isEditMode, setIsEditMode] = useState(false);

  const [activeEmp, setActiveEmp] = useState(null);
  const [quotaRows, setQuotaRows] = useState([]);

  // History Modal State
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7));

  const fetchHistory = async (empId, month) => {
    try {
      setHistoryLoading(true);
      const res = await axiosClient.get(`/timerecord/history/${empId}?month=${month}`);
      setHistoryData(res.data.data || []);
    } catch (err) {
      console.error("Fetch History Error:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = (emp) => {
    setActiveEmp(emp);
    setHistoryMonth(new Date().toISOString().slice(0, 7));
    setHistoryOpen(true);
    fetchHistory(emp.employeeId, new Date().toISOString().slice(0, 7));
  };

  const [empForm, setEmpForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "Worker",
    joiningDate: "",
    isActive: true,
    departmentId: "", // NEW
  });

  const fetchEmployees = async () => {
    try {
      setLoading(true); // Show spinner
      const res = await axiosClient.get("/admin/employees");
      setEmployees(res.data.employees || []);
    } catch (err) {
      console.error("Fetch Employees Error:", err);
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    } finally {
      setLoading(false); // Hide spinner
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const res = await axiosClient.get("/admin/hr/leave-types");
      setTypes(res.data.types || []);
    } catch (err) {
      console.error("Fetch Leave Types Error:", err);
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await axiosClient.get("/admin/departments");
      setDepartments(res.data.departments || []);
    } catch (err) {
      console.error("Fetch Departments Error:", err);
      // Don't block UI if this fails
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchEmployees(), fetchLeaveTypes(), fetchDepartments()]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAddModal = () => {
    setIsEditMode(false);
    setActiveEmp(null);
    setEmpForm({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "Worker",
      joiningDate: "",
      isActive: true,
      departmentId: "",
    });
    setEmpModalOpen(true);
  };

  const formatDateForInput = (dateString) => {
    if (!dateString) return "";
    return dateString.split("T")[0];
  };

  const openEditModal = (emp) => {
    setIsEditMode(true);
    setActiveEmp(emp);
    setEmpForm({
      firstName: emp.firstName || "",
      lastName: emp.lastName || "",
      email: emp.email || "",
      password: "",
      role: emp.role || "Worker",
      joiningDate: formatDateForInput(emp.joiningDate),
      isActive: emp.isActive !== undefined ? emp.isActive : true,
      departmentId: emp.department?.deptId || "",
    });
    setEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    try {

      const payload = {
        ...payload,
        departmentId: payload.departmentId === "" ? null : Number(payload.departmentId)
      };
      if (isEditMode) {
        await axiosClient.put(`/admin/employees/${activeEmp.employeeId}`, payload);
      } else {
        await axiosClient.post("/admin/employees", payload);
      }
      setEmpModalOpen(false);
      fetchEmployees();
      await alertSuccess(
        t("common.success"),
        t("pages.hrEmployees.alert.saved")
      );
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    }
  };

  const handleSyncQuotas = async () => {
    const ok = await alertConfirm(
      t("pages.hrEmployees.alert.syncTitle"),
      t("pages.hrEmployees.alert.syncText"),
      t("pages.hrEmployees.quotaModal.syncStandard")
    );
    if (!ok) return;

    try {
      setLoading(true);
      await axiosClient.post("/admin/hr/sync-quotas", {});
      await alertSuccess(t("common.success"), t("pages.hrEmployees.alert.synced"));
      fetchEmployees();
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || t("pages.hrEmployees.alert.syncFailed"));
    } finally {
      setLoading(false);
    }
  };

  const openQuota = async (emp) => {
    setActiveEmp(emp);
    setQuotaOpen(true);
    try {
      const res = await axiosClient.get(`/admin/hr/leave-quota/${emp.employeeId}`);
      const quotasData = res.data.quotas || [];
      const map = new Map(quotasData.map((x) => [x.leaveTypeId, x]));

      const rows = types.map((t2) => {
        const hit = map.get(t2.leaveTypeId);
        return {
          leaveTypeId: t2.leaveTypeId,
          typeName: t2.typeName,
          totalDays: hit ? Number(hit.totalDays) : 0,
          usedDays: hit ? Number(hit.usedDays) : 0,
          carriedOverDays: hit ? Number(hit.carriedOverDays) : 0,
          canCarry: t2.isCarryForward || t2.maxCarryDays > 0,
        };
      });
      setQuotaRows(rows);
    } catch (err) {
      console.error("Fetch Quota Error:", err);
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    }
  };

  const saveQuota = async () => {
    try {
      await axiosClient.put(`/admin/hr/leave-quota/${activeEmp.employeeId}`, {
        quotas: quotaRows.map((r) => ({
          leaveTypeId: r.leaveTypeId,
          totalDays: r.totalDays,
          carriedOverDays: r.carriedOverDays,
        })),
      });
      setQuotaOpen(false);
      await alertSuccess(t("common.success"), t("pages.hrEmployees.alert.quotaSaved"));
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || t("pages.hrEmployees.alert.quotaSaveFailed"));
    }
  };

  // Phase 3: quick deactivate/activate toggle (uses edit endpoint)
  const toggleActive = async (emp) => {
    const next = !emp.isActive;
    const ok = await alertConfirm(
      next ? t("pages.hrEmployees.alert.activateTitle") : t("pages.hrEmployees.alert.deactivateTitle"),
      next ? t("pages.hrEmployees.alert.activateText") : t("pages.hrEmployees.alert.deactivateText"),
      next ? t("pages.hrEmployees.activate") : t("pages.hrEmployees.deactivate")
    );
    if (!ok) return;

    try {
      await axiosClient.put(`/admin/employees/${emp.employeeId}`, {
        ...emp,
        password: "",
        isActive: next,
      });
      await alertSuccess(
        t("common.success"),
        t(next ? "pages.hrEmployees.alert.activated" : "pages.hrEmployees.alert.deactivated")
      );
      fetchEmployees();
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter((e) => {
      const hay = `${e.firstName} ${e.lastName} ${e.email} ${e.role}`.toLowerCase();
      const okQ = !s || hay.includes(s);
      const okRole = roleFilter === "all" || e.role === roleFilter;
      const okActive =
        activeFilter === "all" || (activeFilter === "active" ? !!e.isActive : !e.isActive);
      const okDept = deptFilter === "all" || (e.department?.deptId === Number(deptFilter));
      return okQ && okRole && okActive && okDept;
    });
  }, [employees, q, roleFilter, activeFilter, deptFilter]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [q, roleFilter, activeFilter, deptFilter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedEmployees = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExportHistoryCSV = () => {
    if (!historyData || historyData.length === 0) {
      return alertError(t("common.error"), t("common.noDataToExport"));
    }

    const headers = [
      t("pages.hrEmployees.history.date"),
      t("pages.hrEmployees.history.day"),
      t("pages.hrEmployees.history.status"),
      t("pages.hrEmployees.history.in"),
      t("pages.hrEmployees.history.out"),
      t("pages.hrEmployees.history.details")
    ];

    const csvContent = [
      headers.join(","),
      ...historyData.map(row => [
        `\t${row.date}`,
        row.day,
        row.status,
        row.checkIn,
        row.checkOut,
        `"${(row.details || '').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `attendance_history_${activeEmp.firstName}_${historyMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-card emp">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">{t("pages.hrEmployees.title")}</h2>
          <p className="emp-sub">{t("pages.hrEmployees.subtitle")}</p>
        </div>


        <div className="emp-tools-container">
          {/* Row 1: Search & Filters */}
          <div className="emp-tools-row filters">
            <input
              className="emp-input search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.placeholders.searchNameEmailRole")}
            />

            <select
              className="emp-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{ maxWidth: 150 }}
            >
              <option value="all">{t("pages.hrEmployees.filters.allRoles")}</option>
              <option value="HR">{t("pages.hrEmployees.filters.hr")}</option>
              <option value="Worker">{t("pages.hrEmployees.filters.worker")}</option>
            </select>

            <select
              className="emp-input"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              style={{ maxWidth: 160 }}
            >
              <option value="all">{t("pages.hrEmployees.filters.allStatus")}</option>
              <option value="active">{t("pages.hrEmployees.filters.activeOnly")}</option>
              <option value="inactive">{t("pages.hrEmployees.filters.inactiveOnly")}</option>
            </select>

            <select
              className="emp-input"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              style={{ maxWidth: 200 }}
            >
              <option value="all">{t("pages.hrEmployees.filters.allDepartments", "All Departments")}</option>
              {departments.map((d) => (
                <option key={d.deptId} value={d.deptId}>
                  {d.deptName}
                </option>
              ))}
            </select>

            {(q || roleFilter !== "all" || activeFilter !== "all" || deptFilter !== "all") && (
              <button
                className="emp-btn emp-btn-outline danger"
                onClick={() => {
                  setQ("");
                  setRoleFilter("all");
                  setActiveFilter("all");
                  setDeptFilter("all");
                }}
                title={t("common.clear")}
              >
                <FiX /> {t("common.clear")}
              </button>
            )}
          </div>

          {/* Row 2: Action Buttons */}
          <div className="emp-tools-row actions">
            <button
              className="emp-btn emp-btn-outline warn"
              onClick={handleSyncQuotas}
              title={t("pages.hrEmployees.quotaModal.syncStandard")}
              disabled={loading}
            >
              <FiRefreshCw className={loading ? "spin" : ""} />
              {t("pages.hrEmployees.quotaModal.syncStandard")}
            </button>

            <button className="emp-btn emp-btn-secondary" onClick={() => setDeptModalOpen(true)}>
              <FiLayers /> {t("pages.hrEmployees.buttons.departments", "Departments")}
            </button>

            <button className="emp-btn emp-btn-primary" onClick={openAddModal}>
              <FiUserPlus />
              {t("pages.hrEmployees.buttons.addNew")}
            </button>

            <button
              className="emp-btn emp-btn-outline"
              onClick={fetchEmployees}
              disabled={loading}
              title={t("pages.hrEmployees.buttons.refreshList")}
            >
              <FiRefreshCw className={loading ? "spin" : ""} />
              <span className="hidden-mobile">{t("pages.hrEmployees.buttons.refresh")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>{t("pages.hrEmployees.table.id")}</th>
              <th>{t("pages.hrEmployees.table.name")}</th>
              <th>{t("pages.hrEmployees.table.emailRole")}</th>
              <th className="text-center" style={{ width: 320 }}>
                {t("pages.hrEmployees.table.actions")}
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("common.loading")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  {t("pages.hrEmployees.noEmployeesFound")}
                </td>
              </tr>
            ) : (
              paginatedEmployees.map((emp) => (
                <tr key={emp.employeeId}>
                  <td className="emp-mono emp-muted">{emp.employeeId}</td>
                  <td className="emp-strong">
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td>
                    <div className="emp-muted mini">{emp.email}</div>
                    <span className={`badge ${emp.role === "HR" ? "badge-role-hr" : "badge-role-worker"}`}>
                      {emp.role === "HR"
                        ? t("pages.hrEmployees.filters.hr")
                        : t("pages.hrEmployees.filters.worker")}
                    </span>
                    {!emp.isActive && (
                      <span className="badge badge-danger">{t("pages.hrEmployees.badge.inactive")}</span>
                    )}
                    {emp.department && (
                      <span className="badge" style={{ backgroundColor: "#f1f5f9", color: "#475569", marginLeft: 6, border: "1px solid #e2e8f0" }}>
                        {emp.department.deptName}
                      </span>
                    )}
                  </td>

                  <td className="action-column">
                    <div className="btn-group-row" style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "nowrap" }}>
                      <button className="emp-btn emp-btn-outline small info" onClick={() => openHistory(emp)} title="History">
                        <FiClock />
                      </button>

                      <button className="emp-btn emp-btn-outline small info" onClick={() => openEditModal(emp)}>
                        <FiEdit2 />
                        {t("pages.hrEmployees.buttons.edit")}
                      </button>

                      <button className="emp-btn emp-btn-outline small quota" onClick={() => openQuota(emp)}>
                        <FiSettings />
                        {t("pages.hrEmployees.quota")}
                      </button>

                      <button
                        className={`emp-btn emp-btn-outline small ${emp.isActive ? "warn" : "info"}`}
                        onClick={() => toggleActive(emp)}
                        title={emp.isActive ? t("pages.hrEmployees.deactivate") : t("pages.hrEmployees.activate")}
                      >
                        {emp.isActive ? <FiToggleLeft /> : <FiToggleRight />}
                        {emp.isActive ? t("pages.hrEmployees.deactivate") : t("pages.hrEmployees.activate")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > itemsPerPage && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 20, gap: 15 }}>
          <button
            className="emp-btn emp-btn-outline small"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            <FiChevronLeft />
          </button>

          <span style={{ color: "#64748b", fontWeight: 500 }}>
            {t("common.page", "Page")} {currentPage} / {totalPages}
          </span>

          <button
            className="emp-btn emp-btn-outline small"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            <FiChevronRight />
          </button>
        </div>
      )}

      {/* History Modal */}
      {
        historyOpen && (
          <div className="emp-modal-backdrop" onClick={() => setHistoryOpen(false)}>
            <div className="emp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
              <div className="emp-modal-head">
                <div>
                  <div className="emp-modal-title">{t("pages.hrEmployees.history.title")}</div>
                  <div className="emp-modal-sub">
                    {activeEmp?.firstName} {activeEmp?.lastName} (ID: {activeEmp?.employeeId})
                  </div>
                </div>
                <button className="emp-x" onClick={() => setHistoryOpen(false)}>
                  ×
                </button>
              </div>

              <div className="emp-modal-body">
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 15, gap: 10 }}>
                  <input
                    type="month"
                    className="quota-input"
                    value={historyMonth}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHistoryMonth(val);
                      if (val && activeEmp) fetchHistory(activeEmp.employeeId, val);
                    }}
                  />
                  <button
                    className="emp-btn emp-btn-outline small"
                    onClick={handleExportHistoryCSV}
                    disabled={historyLoading || !historyData.length}
                  >
                    <FiDownload /> CSV
                  </button>
                </div>

                <div className="table-wrap" style={{ maxHeight: 400, overflowY: "auto" }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("pages.hrEmployees.history.date")}</th>
                        <th>{t("pages.hrEmployees.history.day")}</th>
                        <th>{t("pages.hrEmployees.history.status")}</th>
                        <th>{t("pages.hrEmployees.history.in")}</th>
                        <th>{t("pages.hrEmployees.history.out")}</th>
                        <th>{t("pages.hrEmployees.history.details")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>{t("common.loadingRecords")}</td></tr>
                      ) : historyData.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>{t("common.noDataAvailable")}</td></tr>
                      ) : (
                        historyData.map((d, i) => (
                          <tr key={i}>
                            <td>{d.date}</td>
                            <td>{t(`common.days.${d.day.toLowerCase().substring(0, 3)}`) || d.day}</td>
                            <td>
                              <span className="badge" style={{
                                backgroundColor: d.color === 'green' ? '#dcfce7' :
                                  d.color === 'red' ? '#fee2e2' :
                                    d.color === 'orange' ? '#ffedd5' :
                                      d.color === 'blue' ? '#dbeafe' :
                                        d.color === 'purple' ? '#f3e8ff' : '#f3f4f6',
                                color: d.color === 'green' ? '#166534' :
                                  d.color === 'red' ? '#991b1b' :
                                    d.color === 'orange' ? '#9a3412' :
                                      d.color === 'blue' ? '#1e40af' :
                                        d.color === 'purple' ? '#6b21a8' : '#374151'
                              }}>
                                {t(`pages.hrEmployees.history.statusTypes.${d.status}`) || d.status}
                              </span>
                            </td>
                            <td>{d.checkIn}</td>
                            <td>{d.checkOut}</td>
                            <td style={{ fontSize: '0.9em', color: '#666' }}>{d.details}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="emp-modal-actions">
                <button className="emp-btn emp-btn-secondary" onClick={() => setHistoryOpen(false)}>{t("common.close")}</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Employee modal */}
      {
        empModalOpen && (
          <div className="emp-modal-backdrop" onClick={() => setEmpModalOpen(false)}>
            <form className="emp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEmployee}>
              <div className="emp-modal-head">
                <div>
                  <div className="emp-modal-title">
                    {isEditMode ? t("pages.hrEmployees.edit.title") : t("pages.hrEmployees.add.title")}
                  </div>
                  <div className="emp-modal-sub">
                    {isEditMode ? `ID: #${activeEmp.employeeId}` : t("pages.hrEmployees.add.subtitle")}
                  </div>
                </div>
                <button className="emp-x" type="button" onClick={() => setEmpModalOpen(false)}>
                  ×
                </button>
              </div>

              <div className="emp-modal-body">
                <div className="form-row">
                  <div className="form-col">
                    <label>{t("pages.hrEmployees.form.firstName")}</label>
                    <input
                      className="quota-input w-full"
                      value={empForm.firstName}
                      onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-col">
                    <label>{t("pages.hrEmployees.form.lastName")}</label>
                    <input
                      className="quota-input w-full"
                      value={empForm.lastName}
                      onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-col">
                  <label>{t("pages.hrEmployees.form.email")}</label>
                  <input
                    className="quota-input w-full"
                    type="email"
                    value={empForm.email}
                    onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                    required
                  />
                </div>

                <div className="form-col">
                  <label>
                    {t("pages.hrEmployees.form.password")} {isEditMode && t("pages.hrEmployees.form.passwordHint")}
                  </label>
                  <input
                    className="quota-input w-full"
                    type="password"
                    value={empForm.password}
                    onChange={(e) => setEmpForm({ ...empForm, password: e.target.value })}
                    required={!isEditMode}
                  />
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label>{t("pages.hrEmployees.form.role")}</label>
                    <select
                      className="quota-input w-full"
                      value={empForm.role}
                      onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                    >
                      <option value="Worker">{t("pages.hrEmployees.filters.worker")}</option>
                      <option value="HR">{t("pages.hrEmployees.filters.hr")}</option>
                    </select>
                  </div>

                  <div className="form-col">
                    <label>{t("pages.hrEmployees.form.joiningDate")}</label>
                    <input
                      type="date"
                      className="quota-input w-full"
                      value={empForm.joiningDate}
                      onChange={(e) => setEmpForm({ ...empForm, joiningDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-col">
                  <label>{t("pages.hrEmployees.form.department", "Department")}</label>
                  <select
                    className="quota-input w-full"
                    value={empForm.departmentId}
                    onChange={(e) => setEmpForm({ ...empForm, departmentId: e.target.value })}
                  >
                    <option value="">{t("common.none", "None")}</option>
                    {departments.map((d) => (
                      <option key={d.deptId} value={d.deptId}>
                        {d.deptName}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={empForm.isActive}
                    onChange={(e) => setEmpForm({ ...empForm, isActive: e.target.checked })}
                  />
                  {t("pages.hrEmployees.form.active")}
                </label>
              </div>

              <div className="emp-modal-actions">
                <button className="emp-btn emp-btn-outline" type="button" onClick={() => setEmpModalOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button className="emp-btn emp-btn-primary" type="submit">
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        )
      }

      {/* Quota modal */}
      {
        quotaOpen && (
          <div className="emp-modal-backdrop" onClick={() => setQuotaOpen(false)}>
            <div className="emp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="emp-modal-head">
                <div>
                  <div className="emp-modal-title">{t("pages.hrEmployees.quotaModal.title")}</div>
                  <div className="emp-modal-sub">
                    {activeEmp?.firstName} {activeEmp?.lastName}
                  </div>
                </div>
                <button className="emp-x" onClick={() => setQuotaOpen(false)}>
                  ×
                </button>
              </div>

              <div className="emp-modal-body">
                <div
                  className="quota-header-row"
                  style={{
                    display: "flex",
                    fontWeight: "bold",
                    paddingBottom: 8,
                    borderBottom: "1px solid #eee",
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  <div style={{ flex: 1 }}>{t("pages.hrEmployees.quotaModal.leaveTypeUsed")}</div>
                  <div style={{ width: 85, textAlign: "center" }}>{t("pages.hrEmployees.quotaModal.thisYear")}</div>
                  <div style={{ width: 85, textAlign: "center" }}>{t("pages.hrEmployees.quotaModal.carried")}</div>
                </div>

                {quotaRows.map((r) => (
                  <div
                    className="quota-row"
                    key={r.leaveTypeId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom: "1px solid #f9f9f9",
                    }}
                  >
                    <div className="quota-left" style={{ flex: 1 }}>
                      <div className="quota-type" style={{ fontWeight: "bold", fontSize: 14 }}>
                        {r.typeName}
                      </div>
                      <div className="quota-mini" style={{ fontSize: 12, color: "#888" }}>
                        {t("pages.hrEmployees.quotaModal.usedLabel")}: {r.usedDays}
                      </div>
                    </div>

                    <div className="quota-field">
                      <input
                        className="quota-input"
                        style={{ width: 70, textAlign: "center" }}
                        type="number"
                        min="0"
                        step="0.5"
                        value={r.totalDays}
                        onChange={(e) =>
                          setQuotaRows((prev) =>
                            prev.map((row) =>
                              row.leaveTypeId === r.leaveTypeId ? { ...row, totalDays: Number(e.target.value) } : row
                            )
                          )
                        }
                      />
                    </div>

                    <div className="quota-field">
                      <input
                        className="quota-input highlight-carry"
                        style={{
                          width: 70,
                          textAlign: "center",
                          backgroundColor: r.canCarry ? "#f0fdf4" : "#f1f5f9",
                          borderColor: r.canCarry ? "#bbf7d0" : "#e2e8f0",
                          cursor: r.canCarry ? "text" : "not-allowed",
                        }}
                        type="number"
                        min="0"
                        step="0.5"
                        value={r.carriedOverDays}
                        disabled={!r.canCarry}
                        onChange={(e) =>
                          setQuotaRows((prev) =>
                            prev.map((row) =>
                              row.leaveTypeId === r.leaveTypeId ? { ...row, carriedOverDays: Number(e.target.value) } : row
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="emp-modal-actions">
                <button className="emp-btn emp-btn-outline" onClick={() => setQuotaOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button className="emp-btn emp-btn-primary" onClick={saveQuota}>
                  {t("pages.hrEmployees.quotaModal.saveQuota")}
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        deptModalOpen && (
          <DepartmentManagerModal
            isOpen={deptModalOpen}
            onClose={() => setDeptModalOpen(false)}
            departments={departments}
            onRefresh={fetchDepartments}
          />
        )
      }
    </div >
  );
}


function DepartmentManagerModal({ isOpen, onClose, departments, onRefresh }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ deptName: "", description: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.deptName.trim()) return;

    try {
      setLoading(true);
      if (editingId) {
        await axiosClient.put(`/admin/departments/${editingId}`, formData);
        await alertSuccess(t("common.success"), t("pages.hrEmployees.dept.updated", "Department updated."));
      } else {
        await axiosClient.post("/admin/departments", formData);
        await alertSuccess(t("common.success"), t("pages.hrEmployees.dept.created", "Department created."));
      }
      setFormData({ deptName: "", description: "" });
      setEditingId(null);
      onRefresh();
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (dept) => {
    setEditingId(dept.deptId);
    setFormData({ deptName: dept.deptName, description: dept.description || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ deptName: "", description: "" });
  };

  const handleDelete = async (id) => {
    const ok = await alertConfirm(t("common.confirmDelete"), t("pages.hrEmployees.dept.confirmDelete", "Delete this department?"));
    if (!ok) return;

    try {
      setLoading(true);
      await axiosClient.delete(`/admin/departments/${id}`);
      await alertSuccess(t("common.success"), t("pages.hrEmployees.dept.deleted", "Department deleted."));
      onRefresh();
    } catch (err) {
      await alertError(t("common.error"), err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="emp-modal-backdrop" onClick={onClose}>
      <div className="emp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="emp-modal-head">
          <div className="emp-modal-title">{t("pages.hrEmployees.dept.title", "Manage Departments")}</div>
          <button className="emp-x" onClick={onClose}>×</button>
        </div>

        <div className="emp-modal-body">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20, background: "#f8fafc", padding: 12, borderRadius: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="quota-input"
                style={{ flex: 1 }}
                placeholder={t("pages.hrEmployees.dept.namePlaceholder", "Department Name")}
                value={formData.deptName}
                onChange={(e) => setFormData({ ...formData, deptName: e.target.value })}
                required
              />
              <button className="emp-btn emp-btn-primary" type="submit" disabled={loading}>
                {editingId ? <FiEdit2 /> : <FiPlus />} {editingId ? t("common.update", "Update") : t("common.add", "Add")}
              </button>
            </div>
            <textarea
              className="quota-input"
              style={{ width: "100%", height: 60, resize: "none" }}
              placeholder={t("pages.hrEmployees.dept.descPlaceholder", "Description (Optional)")}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            {editingId && (
              <div style={{ textAlign: "right" }}>
                <button type="button" className="emp-btn emp-btn-outline small" onClick={cancelEdit}>{t("common.cancel", "Cancel Edit")}</button>
              </div>
            )}
          </form>

          <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #eee", borderRadius: 8 }}>
            {departments.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#888" }}>{t("common.noData", "No departments found.")}</div>
            ) : (
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "10px 15px" }}>{t("pages.hrEmployees.dept.name", "Name")}</th>
                    <th style={{ padding: "10px 15px" }}>{t("pages.hrEmployees.dept.stats", "Stats")}</th>
                    <th style={{ padding: "10px 15px", textAlign: "right" }}>{t("common.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map(d => (
                    <tr key={d.deptId}>
                      <td style={{ padding: "10px 15px" }}>
                        <div style={{ fontWeight: "bold", color: "#334155" }}>{d.deptName}</div>
                        {d.description && <div style={{ fontSize: "0.8rem", color: "#64748b" }}>{d.description}</div>}
                      </td>
                      <td style={{ padding: "10px 15px" }}>
                        <span className="badge badge-info">{t("pages.hrEmployees.dept.employeesCount", { count: d._count?.employees || 0 })}</span>
                      </td>
                      <td style={{ width: 120, textAlign: "right", padding: "10px 15px" }}>
                        <div className="btn-group-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <button className="emp-btn emp-btn-outline small" onClick={() => startEdit(d)} disabled={loading}>
                            <FiEdit2 />
                          </button>
                          <button className="emp-btn emp-btn-outline small warn" onClick={() => handleDelete(d.deptId)} disabled={loading}>
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
