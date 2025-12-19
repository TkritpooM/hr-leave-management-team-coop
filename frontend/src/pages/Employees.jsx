import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./Employees.css";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

const authHeader = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
});

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [types, setTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // modal state
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [activeEmp, setActiveEmp] = useState(null);
  const [quotaRows, setQuotaRows] = useState([]); // [{leaveTypeId, typeName, totalDays, usedDays}]

  const fetchEmployees = async () => {
    // ✅ ปรับ endpoint ตรงนี้ให้ตรงของคุณ (ตัวอย่าง)
    const res = await api.get("/api/employees", authHeader());
    setEmployees(res.data.employees || res.data || []);
  };

  const fetchLeaveTypes = async () => {
    const res = await api.get("/api/hr/leave-types", authHeader());
    setTypes(res.data.types || []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([fetchEmployees(), fetchLeaveTypes()]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => {
      const name = `${e.first_name || e.firstName || ""} ${e.last_name || e.lastName || ""}`.toLowerCase();
      const email = String(e.email || "").toLowerCase();
      return name.includes(s) || email.includes(s);
    });
  }, [employees, q]);

  const openQuota = async (emp) => {
    setActiveEmp(emp);
    setQuotaOpen(true);

    const employeeId = emp.employee_id || emp.employeeId || emp.id;
    const res = await api.get(`/api/hr/leave-quota/${employeeId}`, authHeader());
    const quotas = res.data.quotas || [];

    // map ให้ครบทุก leave type (ถ้าไม่มี quota ก็ให้ 0)
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
  };

  const closeQuota = () => {
    setQuotaOpen(false);
    setActiveEmp(null);
    setQuotaRows([]);
  };

  const updateRow = (leaveTypeId, value) => {
    setQuotaRows((prev) =>
      prev.map((r) =>
        r.leaveTypeId === leaveTypeId ? { ...r, totalDays: value } : r
      )
    );
  };

  const saveQuota = async () => {
    if (!activeEmp) return;
    const employeeId = activeEmp.employee_id || activeEmp.employeeId || activeEmp.id;

    await api.put(
      `/api/hr/leave-quota/${employeeId}`,
      { quotas: quotaRows.map((r) => ({ leaveTypeId: r.leaveTypeId, totalDays: r.totalDays })) },
      authHeader()
    );

    closeQuota();
    alert("✅ Updated leave quota successfully");
  };

  return (
    <div className="emp-page">
      <div className="emp-card">
        <div className="emp-head">
          <div>
            <h2 className="emp-title">Employees</h2>
            <p className="emp-sub">HR can manage leave quotas per employee</p>
          </div>

          <div className="emp-tools">
            <input
              className="emp-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / email..."
            />
            <button
              className="emp-btn emp-btn-primary"
              onClick={async () => {
                setLoading(true);
                await fetchEmployees();
                setLoading(false);
              }}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="emp-table-wrap">
          <table className="emp-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th style={{ width: 180 }}>Leave Quota</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="emp-empty">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="4" className="emp-empty">No employees</td></tr>
              ) : (
                filtered.map((emp) => {
                  const id = emp.employee_id || emp.employeeId || emp.id;
                  const name = `${emp.first_name || emp.firstName || ""} ${emp.last_name || emp.lastName || ""}`.trim();

                  return (
                    <tr key={id}>
                      <td className="emp-mono emp-muted">{id}</td>
                      <td className="emp-strong">{name || "-"}</td>
                      <td className="emp-muted">{emp.email}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="emp-btn emp-btn-outline" onClick={() => openQuota(emp)}>
                          Set Quota
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quota Modal */}
      {quotaOpen && (
        <div className="emp-modal-backdrop" onClick={closeQuota}>
          <div className="emp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="emp-modal-head">
              <div>
                <div className="emp-modal-title">Set Leave Quota</div>
                <div className="emp-modal-sub">
                  {activeEmp
                    ? `${activeEmp.first_name || activeEmp.firstName || ""} ${activeEmp.last_name || activeEmp.lastName || ""}`.trim()
                    : ""}
                </div>
              </div>
              <button className="emp-x" onClick={closeQuota} type="button">×</button>
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
                      onChange={(e) => updateRow(r.leaveTypeId, Number(e.target.value))}
                    />
                    <div className="quota-unit">days</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="emp-modal-actions">
              <button className="emp-btn emp-btn-outline" onClick={closeQuota}>Cancel</button>
              <button className="emp-btn emp-btn-primary" onClick={saveQuota}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
