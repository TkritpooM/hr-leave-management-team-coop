// src/pages/WorkerLeave.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerLeave.css";

const normStatus = (s) => String(s || "").trim().toLowerCase();

export default function WorkerLeave() {
  const [quotas, setQuotas] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ UI controls
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); // all | pending | approved | rejected | cancelled
  const [type, setType] = useState("all"); // all | <typeName>
  const [sort, setSort] = useState("newest"); // newest | oldest | start_asc | start_desc

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

  // ✅ Build type options from history
  const typeOptions = useMemo(() => {
    const set = new Set();
    history.forEach((r) => set.add(r.leaveType?.typeName || "Unknown"));
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [history]);

  // ✅ Counters (chips)
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

  // ✅ Filter + sort
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

      const matchStatus =
        status === "all" ? true : st.includes(status); // pending/approved/rejected/cancelled

      const matchType = type === "all" ? true : (r.leaveType?.typeName || "Unknown") === type;

      return matchQuery && matchStatus && matchType;
    });

    rows.sort((a, b) => {
      const aStart = new Date(a.startDate).getTime();
      const bStart = new Date(b.startDate).getTime();
      const aEnd = new Date(a.endDate).getTime();
      const bEnd = new Date(b.endDate).getTime();

      switch (sort) {
        case "oldest":
          return aStart - bStart;
        case "start_asc":
          return aStart - bStart || aEnd - bEnd;
        case "start_desc":
          return bStart - aStart || bEnd - aEnd;
        case "newest":
        default:
          return bStart - aStart;
      }
    });

    return rows;
  }, [history, q, status, type, sort]);

  const clearFilters = () => {
    setQ("");
    setStatus("all");
    setType("all");
    setSort("newest");
  };

  return (
    <div className="wl-page">
      <header className="wl-header">
        <div>
          <h1 className="wl-title">My Leave</h1>
          <p className="wl-subtitle">View your leave balances and request history</p>
        </div>
      </header>

      {/* Leave Balance */}
      <section className="wl-quota-row">
        {quotas.length === 0 ? (
          <div className="wl-card">
            <h4 className="wl-card-title">No Quota Found</h4>
            <div className="wl-muted">Ask HR to assign leave quota.</div>
          </div>
        ) : (
          quotas.map((q) => (
            <div className="wl-card" key={q.quotaId}>
              <h4 className="wl-card-title">{q.leaveType?.typeName}</h4>
              <div className="wl-big">{q.availableDays}</div>
              <div className="wl-muted">Remaining from {q.totalDays} days</div>
            </div>
          ))
        )}
      </section>

      {/* Leave History (เด่น ๆ) */}
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

        {/* ✅ Controls */}
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
                <option key={t} value={t}>
                  {t === "all" ? "All types" : t}
                </option>
              ))}
            </select>

            <select className="wl-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="start_desc">Start date ↓</option>
              <option value="start_asc">Start date ↑</option>
            </select>

            <button className="wl-btn wl-btn-ghost" type="button" onClick={clearFilters}>
              Reset
            </button>
          </div>
        </div>

        {/* ✅ Status chips (click to filter) */}
        <div className="wl-chips">
          <button
            type="button"
            className={`wl-chip-mini ${status === "all" ? "active" : ""}`}
            onClick={() => setStatus("all")}
          >
            All <span>{counters.all}</span>
          </button>
          <button
            type="button"
            className={`wl-chip-mini ${status === "pending" ? "active" : ""}`}
            onClick={() => setStatus("pending")}
          >
            Pending <span>{counters.pending}</span>
          </button>
          <button
            type="button"
            className={`wl-chip-mini ${status === "approved" ? "active" : ""}`}
            onClick={() => setStatus("approved")}
          >
            Approved <span>{counters.approved}</span>
          </button>
          <button
            type="button"
            className={`wl-chip-mini ${status === "rejected" ? "active" : ""}`}
            onClick={() => setStatus("rejected")}
          >
            Rejected <span>{counters.rejected}</span>
          </button>
          <button
            type="button"
            className={`wl-chip-mini ${status === "cancelled" ? "active" : ""}`}
            onClick={() => setStatus("cancelled")}
          >
            Cancelled <span>{counters.cancelled}</span>
          </button>
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
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="wl-empty">
                      No results.
                    </td>
                  </tr>
                ) : (
                  filtered.map((req) => (
                    <tr key={req.requestId}>
                      <td className="wl-strong">{req.leaveType?.typeName}</td>
                      <td className="wl-small">
                        {moment(req.startDate).format("DD MMM")} -{" "}
                        {moment(req.endDate).format("DD MMM YYYY")}
                      </td>
                      <td>{req.totalDaysRequested}</td>
                      <td>
                        <span className={`wl-badge wl-badge-${normStatus(req.status)}`}>
                          {req.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
