import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FiEdit2, FiSettings, FiRefreshCw, FiUserPlus } from "react-icons/fi";
import "./HREmployees.css";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";

const api = axios.create({ baseURL: "http://localhost:8000" });
const authHeader = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const [quotaOpen, setQuotaOpen] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [activeEmp, setActiveEmp] = useState(null);
  const [quotaRows, setQuotaRows] = useState([]);

  const [empForm, setEmpForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "Worker",
    joiningDate: "",
    isActive: true,
  });

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/api/admin/employees", authHeader());
      setEmployees(res.data.employees || []);
    } catch (err) {
      console.error("Fetch Employees Error:", err);
    }
  };

  const fetchLeaveTypes = async () => {
    try {
      const res = await api.get("/api/admin/hr/leave-types", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error("Fetch Leave Types Error:", err);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchEmployees(), fetchLeaveTypes()]);
      setLoading(false);
    })();
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
    });
    setEmpModalOpen(true);
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    try {
      if (isEditMode) {
        await api.put(`/api/admin/employees/${activeEmp.employeeId}`, empForm, authHeader());
      } else {
        await api.post("/api/admin/employees", empForm, authHeader());
      }
      setEmpModalOpen(false);
      fetchEmployees();
      await alertSuccess("สำเร็จ", `${isEditMode ? "อัปเดต" : "เพิ่ม"} พนักงานเรียบร้อยแล้ว`);
    } catch (err) {
      await alertError("เกิดข้อผิดพลาด", (err.response?.data?.message || err.message));
    }
  };

  const handleSyncQuotas = async () => {
    if (!(await alertConfirm("ยืนยันการทำรายการ", "ต้องการอัปเดตโควต้าวันลาของพนักงานทุกคนตามค่าเริ่มต้นใช่หรือไม่?", "ยืนยัน"))) return;

    try {
      setLoading(true);
      await api.post("/api/admin/hr/sync-quotas", {}, authHeader());
      await alertSuccess("สำเร็จ", "Sync โควต้ามาตรฐานให้พนักงานทุกคนสำเร็จ");
    } catch (err) {
      await alertError("เกิดข้อผิดพลาด", "เกิดข้อผิดพลาดในการ Sync");
    } finally {
      setLoading(false);
    }
  };

  const openQuota = async (emp) => {
    setActiveEmp(emp);
    setQuotaOpen(true);
    try {
      const res = await api.get(`/api/admin/hr/leave-quota/${emp.employeeId}`, authHeader());
      const quotas = res.data.quotas || [];
      const map = new Map(quotas.map((x) => [x.leaveTypeId, x]));
      const rows = types.map((t) => {
        const hit = map.get(t.leaveTypeId);
        return {
          leaveTypeId: t.leaveTypeId,
          typeName: t.typeName,
          totalDays: hit ? Number(hit.totalDays) : 0,
          usedDays: hit ? Number(hit.usedDays) : 0,
        };
      });
      setQuotaRows(rows);
    } catch (err) {
      console.error("Fetch Quota Error:", err);
    }
  };

  const saveQuota = async () => {
    try {
      await api.put(
        `/api/admin/hr/leave-quota/${activeEmp.employeeId}`,
        { quotas: quotaRows.map((r) => ({ leaveTypeId: r.leaveTypeId, totalDays: r.totalDays })) },
        authHeader()
      );
      setQuotaOpen(false);
      await alertSuccess("สำเร็จ", "อัปเดตโควต้าวันลาสำเร็จ");
    } catch (err) {
      await alertError("เกิดข้อผิดพลาด", "ไม่สามารถอัปเดตได้");
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => `${e.firstName} ${e.lastName} ${e.email}`.toLowerCase().includes(s));
  }, [employees, q]);

  return (
    <div className="page-card emp">
      <div className="emp-head">
        <div>
          <h2 className="emp-title">Employees</h2>
          <p className="emp-sub">จัดการข้อมูลพนักงานและโควต้าการลา</p>
        </div>

        <div className="emp-tools">
          <input
            className="emp-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, or role..."
          />

          <button
            className="emp-btn emp-btn-outline warn"
            onClick={handleSyncQuotas}
            title="Sync Default Quotas"
            disabled={loading}
          >
            <FiRefreshCw className={loading ? "spin" : ""} /> Sync Default
          </button>

          <button className="emp-btn emp-btn-primary" onClick={openAddModal}>
            <FiUserPlus /> Add New
          </button>

          <button className="emp-btn emp-btn-outline" onClick={fetchEmployees} disabled={loading} title="Refresh List">
            <FiRefreshCw className={loading ? "spin" : ""} />
            <span className="hidden-mobile">Refresh</span>
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>ID</th>
              <th>Name</th>
              <th>Email / Role</th>
              <th className="text-center" style={{ width: 240 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">กำลังโหลดข้อมูล...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="4" className="empty">ไม่พบรายชื่อพนักงาน</td></tr>
            ) : (
              filtered.map((emp) => (
                <tr key={emp.employeeId}>
                  <td className="emp-mono emp-muted">{emp.employeeId}</td>
                  <td className="emp-strong">{emp.firstName} {emp.lastName}</td>
                  <td>
                    <div className="emp-muted mini">{emp.email}</div>
                    <span className={`badge ${emp.role === "HR" ? "badge-role-hr" : "badge-role-worker"}`}>
                      {emp.role}
                    </span>
                    {!emp.isActive && <span className="badge badge-danger">Inactive</span>}
                  </td>
                  <td className="action-column">
                    <div className="btn-group-row">
                      <button className="emp-btn emp-btn-outline small info" onClick={() => openEditModal(emp)}>
                        <FiEdit2 /> Info
                      </button>
                      <button className="emp-btn emp-btn-outline small quota" onClick={() => openQuota(emp)}>
                        <FiSettings /> Quota
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Employee modal */}
      {empModalOpen && (
        <div className="emp-modal-backdrop" onClick={() => setEmpModalOpen(false)}>
          <form className="emp-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveEmployee}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">{isEditMode ? "Edit Employee Information" : "Add New Employee"}</div>
                <div className="emp-modal-sub">
                  {isEditMode ? `ID: #${activeEmp.employeeId}` : "กรอกข้อมูลเพื่อสร้างบัญชีพนักงานใหม่"}
                </div>
              </div>
              <button className="emp-x" type="button" onClick={() => setEmpModalOpen(false)}>×</button>
            </div>

            <div className="emp-modal-body">
              <div className="form-row">
                <div className="form-col">
                  <label>First Name</label>
                  <input
                    className="quota-input w-full"
                    value={empForm.firstName}
                    onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-col">
                  <label>Last Name</label>
                  <input
                    className="quota-input w-full"
                    value={empForm.lastName}
                    onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-col">
                <label>Email Address</label>
                <input
                  className="quota-input w-full"
                  type="email"
                  value={empForm.email}
                  onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-col">
                <label>Password {isEditMode && "(เว้นว่างไว้หากไม่ต้องการเปลี่ยน)"}</label>
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
                  <label>Role</label>
                  <select
                    className="quota-input w-full"
                    value={empForm.role}
                    onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                  >
                    <option value="Worker">Worker</option>
                    <option value="HR">HR</option>
                  </select>
                </div>

                <div className="form-col">
                  <label>Joining Date</label>
                  <input
                    type="date"
                    className="quota-input w-full"
                    value={empForm.joiningDate}
                    onChange={(e) => setEmpForm({ ...empForm, joiningDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={empForm.isActive}
                  onChange={(e) => setEmpForm({ ...empForm, isActive: e.target.checked })}
                />
                Account Active (อนุญาตให้เข้าใช้งานระบบ)
              </label>
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" type="button" onClick={() => setEmpModalOpen(false)}>
                Cancel
              </button>
              <button className="emp-btn emp-btn-primary" type="submit">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quota modal */}
      {quotaOpen && (
        <div className="emp-modal-backdrop" onClick={() => setQuotaOpen(false)}>
          <div className="emp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">Set Leave Quota</div>
                <div className="emp-modal-sub">{activeEmp?.firstName} {activeEmp?.lastName}</div>
              </div>
              <button className="emp-x" onClick={() => setQuotaOpen(false)}>×</button>
            </div>

            <div className="emp-modal-body">
              {quotaRows.map((r) => (
                <div className="quota-row" key={r.leaveTypeId}>
                  <div className="quota-left">
                    <div className="quota-type">{r.typeName}</div>
                    <div className="quota-mini">Used: {r.usedDays}</div>
                  </div>

                  <div className="quota-right">
                    <input
                      className="quota-input"
                      type="number"
                      min="0"
                      step="0.5"
                      value={r.totalDays}
                      onChange={(e) =>
                        setQuotaRows((prev) =>
                          prev.map((row) =>
                            row.leaveTypeId === r.leaveTypeId
                              ? { ...row, totalDays: Number(e.target.value) }
                              : row
                          )
                        )
                      }
                    />
                    <div className="quota-unit">days</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" onClick={() => setQuotaOpen(false)}>
                Cancel
              </button>
              <button className="emp-btn emp-btn-primary" onClick={saveQuota}>
                Save Quota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
