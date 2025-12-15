import React, { useState } from "react";

const MOCK_LEAVE_REQUESTS = [
  { id: "L-1001", employee: "Boss", type: "Sick", dateFrom: "2025-12-12", dateTo: "2025-12-12", detail: "Flu", status: "Pending" },
  { id: "L-1002", employee: "Mina", type: "Annual", dateFrom: "2025-12-18", dateTo: "2025-12-20", detail: "Trip", status: "Pending" },
  { id: "L-1003", employee: "Jokec", type: "Personal", dateFrom: "2025-12-25", dateTo: "2025-12-25", detail: "Family", status: "Pending" },
];

export default function HRLeaveApprovals() {
  const [leaveRequests, setLeaveRequests] = useState(MOCK_LEAVE_REQUESTS);
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkUpdate = (status) => {
    if (selected.size === 0) return;
    setLeaveRequests((prev) => prev.map((r) => (selected.has(r.id) ? { ...r, status } : r)));
    alert(`${status} ✅ (mock) ส่งแจ้งเตือนให้พนักงานแล้ว`);
    setSelected(new Set());
  };

  const updateSingle = (id, status) => {
    setLeaveRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    alert(`${id} -> ${status} (mock)`);
  };

  return (
    <div className="page-card">
      <h1 style={{ margin: 0 }}>Leave Approvals</h1>
      <p style={{ marginTop: 6, color: "#4b5563" }}>
        เลือกหลายรายการแล้ว Approve/Reject พร้อมกันได้ (mock)
      </p>

      <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
        <button className="btn outline" onClick={() => bulkUpdate("Rejected")}>
          Reject Selected
        </button>
        <button className="btn primary" onClick={() => bulkUpdate("Approved")}>
          Approve Selected
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }}></th>
              <th>ID</th>
              <th>Employee</th>
              <th>Type</th>
              <th>Date</th>
              <th>Detail</th>
              <th>Status</th>
              <th style={{ width: 220 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {leaveRequests.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>{r.id}</td>
                <td>{r.employee}</td>
                <td>{r.type}</td>
                <td>{r.dateFrom} → {r.dateTo}</td>
                <td>{r.detail}</td>
                <td>{r.status}</td>
                <td>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn small outline" onClick={() => updateSingle(r.id, "Rejected")}>Reject</button>
                    <button className="btn small primary" onClick={() => updateSingle(r.id, "Approved")}>Approve</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
