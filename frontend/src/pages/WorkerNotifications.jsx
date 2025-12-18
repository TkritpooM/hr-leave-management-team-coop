// src/pages/WorkerNotifications.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import "./WorkerNotifications.css";
import Pagination from "../components/Pagination";

export default function WorkerNotifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const fetchAndDiff = async () => {
    setLoading(true);
    try {
      const res = await axios.get("http://localhost:8000/api/leave/my", getAuthHeader());
      const reqs = res.data.requests || [];

      const prev = JSON.parse(localStorage.getItem("leave_status_cache") || "{}");
      const now = {};

      const notis = [];
      reqs.forEach((r) => {
        const id = r.requestId;
        const curStatus = r.status;
        now[id] = curStatus;

        const oldStatus = prev[id];
        if (oldStatus && oldStatus !== curStatus) {
          notis.push({
            id,
            title: `Leave request #${id} updated`,
            message: `Status: ${oldStatus} → ${curStatus}`,
            when: moment().toISOString(),
            type: curStatus.toLowerCase().includes("approve")
              ? "ok"
              : curStatus.toLowerCase().includes("reject")
              ? "danger"
              : "info",
          });
        }
      });

      localStorage.setItem("leave_status_cache", JSON.stringify(now));
      const existing = JSON.parse(localStorage.getItem("worker_notifications") || "[]");
      const merged = [...notis, ...existing].slice(0, 200);
      localStorage.setItem("worker_notifications", JSON.stringify(merged));
      setItems(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const existing = JSON.parse(localStorage.getItem("worker_notifications") || "[]");
    setItems(existing);
    fetchAndDiff();
  }, []);

  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  const clearAll = () => {
    localStorage.removeItem("worker_notifications");
    setItems([]);
    setPage(1);
  };

  return (
    <div className="page-card wn">
      <header className="wn-head">
        <div>
          <h1 className="wn-title">Notifications</h1>
          <p className="wn-sub">Approval / rejection updates</p>
        </div>
        <div className="wn-actions">
          <button className="btn outline small" onClick={fetchAndDiff} type="button" disabled={loading}>
            Refresh
          </button>
          <button className="btn small" onClick={clearAll} type="button">
            Clear
          </button>
        </div>
      </header>

      <div className="wn-list">
        {paged.length === 0 ? (
          <div className="wn-empty">{loading ? "Loading..." : "No notifications yet."}</div>
        ) : (
          paged.map((n) => (
            <div key={`${n.id}-${n.when}`} className={`wn-item ${n.type}`}>
              <div className="wn-item-title">{n.title}</div>
              <div className="wn-item-msg">{n.message}</div>
              <div className="wn-item-time">{moment(n.when).format("DD MMM YYYY HH:mm")}</div>
            </div>
          ))
        )}
      </div>

      <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
    </div>
  );
}
