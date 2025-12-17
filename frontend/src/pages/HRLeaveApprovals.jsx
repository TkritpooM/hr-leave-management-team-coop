import React, { useState, useEffect } from "react";
import axios from "axios";

export default function HRLeaveApprovals() {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Helper Header
  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // 1. ดึงข้อมูล (แก้ URL ให้มี /admin/pending)
  const fetchPendingRequests = async () => {
    try {
      setIsLoading(true);
      // ✅ แก้ URL ให้ตรงกับ leaveRequest.route.js
      const response = await axios.get("http://localhost:8000/api/leave/admin/pending", getAuthHeader());
      
      setLeaveRequests(response.data.requests || []);
    } catch (err) {
      console.error("Error fetching requests:", err);
      // alert("Failed to fetch data"); // ปิดไว้ก่อนถ้าไม่อยากให้เด้งกวนใจ
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const toggle = (requestId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(requestId) ? next.delete(requestId) : next.add(requestId);
      return next;
    });
  };

  // 2. ฟังก์ชันอนุมัติ (แก้ URL ให้มี /admin/approval)
  const handleAction = async (ids, actionType) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return;

    const confirmMsg = actionType === 'approve' ? "Approve" : "Reject";
    if (!window.confirm(`Confirm to ${confirmMsg} ${idArray.length} item(s)?`)) return;

    try {
      await Promise.all(idArray.map(requestId => 
        // ✅ แก้ URL ให้ตรง: /admin/approval/:requestId
        axios.put(
            `http://localhost:8000/api/leave/admin/approval/${requestId}`, 
            { action: actionType }, // Backend ต้องการ body { action: 'approve' }
            getAuthHeader()
        )
      ));

      alert(`Successfully ${actionType}d!`);
      setSelected(new Set());
      fetchPendingRequests();
    } catch (err) {
      console.error(err);
      alert(`Error: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatDate = (dateString) => {
    if(!dateString) return "-";
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  return (
    <div className="page-card">
      <h1 style={{ margin: 0 }}>Leave Approvals</h1>
      <p style={{ marginTop: 6, color: "#4b5563" }}>
        Select items to Bulk Approve/Reject
      </p>

      <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
        <button 
            className="btn outline" 
            onClick={() => handleAction(Array.from(selected), "reject")} // ส่ง "reject" ตัวเล็ก
            disabled={selected.size === 0}
        >
          Reject Selected
        </button>
        <button 
            className="btn primary" 
            onClick={() => handleAction(Array.from(selected), "approve")} // ส่ง "approve" ตัวเล็ก
            disabled={selected.size === 0}
        >
          Approve Selected
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>
                <input 
                    type="checkbox" 
                    onChange={(e) => {
                        if(e.target.checked) setSelected(new Set(leaveRequests.map(r => r.requestId)));
                        else setSelected(new Set());
                    }}
                    checked={leaveRequests.length > 0 && selected.size === leaveRequests.length}
                />
              </th>
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
            {isLoading ? (
                <tr><td colSpan="8" style={{textAlign:'center', padding: 20}}>Loading...</td></tr>
            ) : leaveRequests.length > 0 ? (
              leaveRequests.map((r) => (
                <tr key={r.requestId}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.requestId)} onChange={() => toggle(r.requestId)} />
                  </td>
                  <td>{r.requestId}</td>
                  
                  {/* แสดงชื่อพนักงาน */}
                  <td>
                    {r.employee ? `${r.employee.firstName} ${r.employee.lastName || ''}` : `ID: ${r.employeeId}`}
                  </td>
                  
                  {/* แสดงประเภทการลา */}
                  <td>
                     <span className="badge">{r.leaveType?.name || 'Leave'}</span>
                  </td>
                  
                  <td>{formatDate(r.startDate)} → {formatDate(r.endDate)}</td>
                  <td>{r.reason || "-"}</td>
                  <td><span className="status pending">{r.status}</span></td>
                  
                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button 
                        className="btn small outline" 
                        onClick={() => handleAction(r.requestId, "reject")}
                      >
                        Reject
                      </button>
                      <button 
                        className="btn small primary" 
                        onClick={() => handleAction(r.requestId, "approve")}
                      >
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
                <tr><td colSpan="8" style={{textAlign:'center', padding: 20}}>No pending requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}