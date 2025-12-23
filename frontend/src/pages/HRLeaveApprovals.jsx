import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import Pagination from "../components/Pagination";

export default function HRLeaveApprovals() {
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 🔥 URL สำหรับดึงไฟล์จาก Backend
  const UPLOAD_URL = "http://localhost:8000/uploads/";

  // Helper Header
  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  // 1. ดึงข้อมูล
  const fetchPendingRequests = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get("http://localhost:8000/api/leave/admin/pending", getAuthHeader());
      setLeaveRequests(response.data.requests || []);
    } catch (err) {
      console.error("Error fetching requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [leaveRequests.length]);

  const toggle = (requestId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(requestId) ? next.delete(requestId) : next.add(requestId);
      return next;
    });
  };

  // 2. ฟังก์ชันอนุมัติ
  const handleAction = async (ids, actionType) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    if (idArray.length === 0) return;

    const confirmMsg = actionType === "approve" ? "Approve" : "Reject";
    if (!window.confirm(`Confirm to ${confirmMsg} ${idArray.length} item(s)?`)) return;

    try {
      await Promise.all(
        idArray.map((requestId) =>
          axios.put(
            `http://localhost:8000/api/leave/admin/approval/${requestId}`,
            { action: actionType },
            getAuthHeader()
          )
        )
      );

      alert(`Successfully ${actionType}d!`);
      setSelected(new Set());
      fetchPendingRequests();
    } catch (err) {
      console.error(err);
      alert(`Error: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB");
  };

  // 🔥 ฟังก์ชันแสดงปุ่มดูไฟล์แนบ
  const renderAttachment = (fileName) => {
    if (!fileName) return <span style={{ color: "#9ca3af" }}>No file</span>;

    const isImage = /\.(jpg|jpeg|png|gif)$/i.test(fileName);
    const isPDF = fileName.toLowerCase().endsWith(".pdf");

    return (
      <a
        href={`${UPLOAD_URL}${fileName}`}
        target="_blank"
        rel="noopener noreferrer"
        title="View Attachment"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: "#2563eb",
          textDecoration: "none",
          fontWeight: "500",
          fontSize: "14px",
        }}
      >
        {isImage ? "🖼️ Image" : isPDF ? "📄 PDF" : "📁 File"}
      </a>
    );
  };

  // Pagination apply
  const total = leaveRequests.length;
  const startIdx = (page - 1) * pageSize;
  const paged = useMemo(() => leaveRequests.slice(startIdx, startIdx + pageSize), [leaveRequests, startIdx, pageSize]);

  return (
    <div className="page-card">
      <h1 style={{ margin: 0 }}>Leave Approvals</h1>
      <p style={{ marginTop: 6, color: "#4b5563" }}>Select items to Bulk Approve/Reject</p>

      <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
        <button
          className="btn outline"
          onClick={() => handleAction(Array.from(selected), "reject")}
          disabled={selected.size === 0}
        >
          Reject Selected
        </button>
        <button
          className="btn primary"
          onClick={() => handleAction(Array.from(selected), "approve")}
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
                    if (e.target.checked) setSelected(new Set(leaveRequests.map((r) => r.requestId)));
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
              {/* 🔥 คอลัมน์ใหม่ */}
              <th>Attachment</th> 
              <th>Status</th>
              <th style={{ width: 200 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: "center", padding: 20 }}>
                  Loading...
                </td>
              </tr>
            ) : leaveRequests.length > 0 ? (
              paged.map((r) => (
                <tr key={r.requestId}>
                  <td>
                    <input type="checkbox" checked={selected.has(r.requestId)} onChange={() => toggle(r.requestId)} />
                  </td>
                  <td>{r.requestId}</td>

                  <td>{r.employee ? `${r.employee.firstName} ${r.employee.lastName || ""}` : `ID: ${r.employeeId}`}</td>

                  <td>
                    <span className="badge">{r.leaveType?.typeName || "Leave"}</span>
                  </td>

                  <td>
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </td>
                  <td>{r.reason || "-"}</td>
                  
                  {/* 🔥 แสดงไฟล์แนบ */}
                  <td>{renderAttachment(r.attachmentUrl)}</td>

                  <td>
                    <span className="status pending">{r.status}</span>
                  </td>

                  <td>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button className="btn small outline" onClick={() => handleAction(r.requestId, "reject")}>
                        Reject
                      </button>
                      <button className="btn small primary" onClick={() => handleAction(r.requestId, "approve")}>
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" style={{ textAlign: "center", padding: 20 }}>
                  No pending requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}