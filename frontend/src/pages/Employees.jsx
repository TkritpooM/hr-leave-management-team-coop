// frontend/src/pages/Employees.jsx

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./Employees.css";

// ตั้งค่า Axios Instance ให้ชี้ไปที่ Backend
const api = axios.create({
  baseURL: "http://localhost:8000",
});

// Helper สำหรับแนบ Token ใน Header
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

  // 1. ดึงรายชื่อพนักงานทั้งหมด
  const fetchEmployees = async () => {
    try {
      // ปรับ Path เป็น /api/admin/employees ให้ตรงกับ Route ของ HR
      const res = await api.get("/api/admin/employees", authHeader());
      setEmployees(res.data.employees || []);
    } catch (err) {
      console.error("Fetch Employees Error:", err);
    }
  };

  // 2. ดึงประเภทการลาทั้งหมด
  const fetchLeaveTypes = async () => {
    try {
      // ปรับ Path ให้ตรงกับ admin.route.js
      const res = await api.get("/api/admin/hr/leave-types", authHeader());
      setTypes(res.data.types || []);
    } catch (err) {
      console.error("Fetch Leave Types Error:", err);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // รันพร้อมกันทั้งสอง API
        await Promise.all([fetchEmployees(), fetchLeaveTypes()]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ระบบค้นหาพนักงาน
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => {
      const name = `${e.firstName || ""} ${e.lastName || ""}`.toLowerCase();
      const email = String(e.email || "").toLowerCase();
      return name.includes(s) || email.includes(s);
    });
  }, [employees, q]);

  // 3. เปิด Modal และดึง Quota รายคน
  const openQuota = async (emp) => {
    setActiveEmp(emp);
    setQuotaOpen(true);

    try {
      const employeeId = emp.employeeId;
      const res = await api.get(`/api/admin/hr/leave-quota/${employeeId}`, authHeader());
      const quotas = res.data.quotas || [];

      // map ให้ครบทุก leave type (ถ้าพนักงานยังไม่มี quota ของประเภทนั้น ให้แสดงเป็น 0)
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

  // 4. บันทึก Quota (Bulk Update)
  const saveQuota = async () => {
    if (!activeEmp) return;
    try {
      const employeeId = activeEmp.employeeId;

      await api.put(
        `/api/admin/hr/leave-quota/${employeeId}`,
        { quotas: quotaRows.map((r) => ({ leaveTypeId: r.leaveTypeId, totalDays: r.totalDays })) },
        authHeader()
      );

      closeQuota();
      alert("✅ Updated leave quota successfully");
    } catch (err) {
      console.error("Save Quota Error:", err);
      alert("❌ Failed to update quota");
    }
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
                  const id = emp.employeeId;
                  const name = `${emp.firstName || ""} ${emp.lastName || ""}`.trim();

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
                  {activeEmp ? `${activeEmp.firstName || ""} ${activeEmp.lastName || ""}`.trim() : ""}
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