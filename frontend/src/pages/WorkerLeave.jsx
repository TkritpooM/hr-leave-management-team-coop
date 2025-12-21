// src/pages/WorkerLeave.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerLeave.css";
import Pagination from "../components/Pagination";

const normStatus = (s) => String(s || "").trim().toLowerCase();

export default function WorkerLeave() {
  const [quotas, setQuotas] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ UI controls
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); 
  const [type, setType] = useState("all"); 
  const [sort, setSort] = useState("newest"); 

  // ✅ Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotaRes, historyRes] = await Promise.all([
        axios.get("http://localhost:8000/api/leave/quota/my", getAuthHeader()),
        axios.get("http://localhost:8000/api/leave/my", getAuthHeader()),
      ]);
      setQuotas(quotaRes.data.quotas || []);
      setHistory(historyRes.data.requests || []);
    } catch (err) {
      console.error("Fetch Leave Data Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 🔥 ฟังก์ชันยกเลิกใบลา
  const handleCancelLeave = async (requestId) => {
    if (!window.confirm("คุณมั่นใจหรือไม่ที่จะยกเลิกคำขอลาใบนี้?")) return;
    try {
      const res = await axios.patch(
        `http://localhost:8000/api/leave/${requestId}/cancel`,
        {},
        getAuthHeader()
      );
      if (res.data.success) {
        alert("✅ ยกเลิกคำขอลาเรียบร้อยแล้ว");
        fetchData(); 
      } else {
        alert("❌ ไม่สามารถยกเลิกได้: " + res.data.message);
      }
    } catch (err) {
      console.error("Cancel Leave Error:", err);
      alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    }
  };

  const typeOptions = useMemo(() => {
    const set = new Set();
    history.forEach((r) => set.add(r.leaveType?.typeName || "Unknown"));
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [history]);

  const counters = useMemo(() => {
    const c = { all: history.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    history.forEach((r) => {
      const s = normStatus(r.status);
      if (s.includes("pending")) c.pending++;
      else if (s.includes("approved")) c.approved++;
      else if (s.includes("reject")) c.rejected++;
      else if (s.includes("cancel")) c.cancelled++;
    });
    return c;
  }, [history]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let rows = history.filter((r) => {
      const typeName = (r.leaveType?.typeName || "Unknown").toLowerCase();
      const st = normStatus(r.status);
      const matchQuery =
        !query ||
        typeName.includes(query) ||
        String(r.reason || "").toLowerCase().includes(query) ||
        moment(r.startDate).format("YYYY-MM-DD").includes(query) ||
        moment(r.endDate).format("YYYY-MM-DD").includes(query);
      const matchStatus = status === "all" ? true : st.includes(status);
      const matchType = type === "all" ? true : (r.leaveType?.typeName || "Unknown") === type;
      return matchQuery && matchStatus && matchType;
    });

    rows.sort((a, b) => {
      const aStart = new Date(a.startDate).getTime();
      const bStart = new Date(b.startDate).getTime();
      switch (sort) {
        case "oldest": return aStart - bStart;
        case "start_asc": return aStart - bStart;
        case "start_desc": return bStart - aStart;
        default: return bStart - aStart;
      }
    });
    return rows;
  }, [history, q, status, type, sort]);

  const clearFilters = () => {
    setQ(""); setStatus("all"); setType("all"); setSort("newest");
  };

  const totalFiltered = filtered.length;
  const startIdx = (page - 1) * pageSize;
  const paged = useMemo(() => filtered.slice(startIdx, startIdx + pageSize), [filtered, startIdx, pageSize]);

  useEffect(() => { setPage(1); }, [q, status, type, sort]);

  return (
    <div className="wl-page">
      <header className="wl-header">
        <div>
          <h1 className="wl-title">My Leave</h1>
          <p className="wl-subtitle">View your leave balances and request history</p>
        </div>
      </header>

      <section className="wl-quota-row">
        {quotas.length === 0 ? (
          <div className="wl-card">
            <h4 className="wl-card-title">No Quota Found</h4>
            <div className="wl-muted">Ask HR to assign leave quota.</div>
          </div>
        ) : (
          quotas.map((item) => (
            <div className="wl-card" key={item.quotaId}>
              <h4 className="wl-card-title">{item.leaveType?.typeName}</h4>
              <div className="wl-big">{item.availableDays}</div>
              <div className="wl-muted">Remaining from {item.totalDays} days</div>
            </div>
          ))
        )}
      </section>

      <section className="wl-panel wl-panel-history">
        <div className="wl-panel-head wl-panel-head-row wl-panel-head-strong">
          <div>
            <h3 className="wl-panel-title wl-panel-title-strong">Leave History</h3>
            <div className="wl-panel-sub">Search, filter and sort your requests</div>
          </div>
          <div className="wl-chip wl-chip-strong">
            Showing <strong>{filtered.length}</strong> / {history.length}
          </div>
        </div>

        <div className="wl-controls">
          <div className="wl-search">
            <input
              className="wl-search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search type / reason / date (YYYY-MM-DD)"
            />
          </div>
          <div className="wl-filters">
            <select className="wl-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="wl-select" value={type} onChange={(e) => setType(e.target.value)}>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
              ))}
            </select>
            <select className="wl-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="start_desc">Start date ↓</option>
              <option value="start_asc">Start date ↑</option>
            </select>
            <button className="wl-btn wl-btn-ghost" type="button" onClick={clearFilters}>Reset</button>
          </div>
        </div>

        <div className="wl-chips">
          {['all', 'pending', 'approved', 'rejected', 'cancelled'].map((st) => (
            <button 
              key={st}
              type="button" 
              className={`wl-chip-mini ${status === st ? "active" : ""}`} 
              onClick={() => setStatus(st)}
            >
              {st.charAt(0).toUpperCase() + st.slice(1)} <span>{counters[st]}</span>
            </button>
          ))}
        </div>

        <div className="wl-table-wrap wl-table-wrap-strong">
          {loading ? (
            <div className="wl-empty">Loading...</div>
          ) : (
            <table className="wl-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Date Range</th>
                  <th>Days</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="wl-empty">No results.</td>
                  </tr>
                ) : (
                  paged.map((req) => (
                    <tr key={req.requestId}>
                      <td className="wl-strong">{req.leaveType?.typeName}</td>
                      <td className="wl-small">
                        {moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}
                      </td>
                      <td>{req.totalDaysRequested}</td>
                      <td>
                        <span className={`wl-badge wl-badge-${normStatus(req.status)}`}>{req.status}</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {normStatus(req.status) === "pending" && (
                          <button
                            className="wl-btn-cancel"
                            onClick={() => handleCancelLeave(req.requestId)}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          total={totalFiltered}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </section>
    </div>
  );
}