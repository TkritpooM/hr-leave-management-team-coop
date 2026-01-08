// src/pages/WorkerLeave.jsx
import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import "./WorkerLeave.css";
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import { buildFileUrl } from "../utils/fileUrl";
import { useTranslation } from "react-i18next";

const normStatus = (s) => String(s || "").trim().toLowerCase();

export default function WorkerLeave() {
  const { t, i18n } = useTranslation();
  const [quotas, setQuotas] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ Detail modal (Phase 2.3)
  const [active, setActive] = useState(null);

  // ✅ UI controls
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all"); 
  const [type, setType] = useState("all"); 
  const [sort, setSort] = useState("newest"); 

  // ✅ Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [quotaRes, historyRes] = await Promise.all([
        axiosClient.get("/leave/quota/my"),
        axiosClient.get("/leave/my"),
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
    if (!(await alertConfirm("Confirm cancellation", "Are you sure you want to cancel this leave request?", "Confirm"))) return;
    try {
      const res = await axiosClient.patch(`/leave/${requestId}/cancel`, {});
      if (res.data.success) {
        await alertSuccess("Success", "Leave request cancelled successfully.");
        fetchData(); 
      } else {
        await alertError("Unable to cancel", res.data.message);
      }
    } catch (err) {
      console.error("Cancel Leave Error:", err);
      await alertError("Error", "Failed to connect to server.");
    }
  };

  const getDeductedDays = (req) => {
    // Backend may expose: deductedDays / totalDays / totalDaysRequested
    const candidates = [req?.deductedDays, req?.totalDaysDeducted, req?.totalDays, req?.totalDaysRequested];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return 0;
  };

  const getAttachmentMeta = (url) => {
    if (!url) return { kind: "none", href: "" };
    const href = `http://localhost:8000/uploads/${url}`;
    const lower = href.toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif|\.webp)$/.test(lower)) return { kind: "image", href };
    if (lower.endsWith(".pdf")) return { kind: "pdf", href };
    return { kind: "file", href };
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
          <h1 className="wl-title">{t("pages.workerLeave.My Leave")}</h1>
          <p className="wl-subtitle">{t("pages.workerLeave.View your leave balances and request history")}</p>
        </div>
      </header>

      <section className="wl-quota-row">
        {quotas.length === 0 ? (
          <div className="wl-card">
            <h4 className="wl-card-title">{t("pages.workerLeave.No Quota Found")}</h4>
            <div className="wl-muted">{t("pages.workerLeave.askHrAssignQuota")}</div>
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
            <h3 className="wl-panel-title wl-panel-title-strong">{t("pages.workerLeave.Leave History")}</h3>
            <div className="wl-panel-sub">{t("pages.workerLeave.Search, filter and sort your requests")}</div>
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
              placeholder={t("pages.workerLeave.Search type / reason / date (YYYY-MM-DD)")}
            />
          </div>
          <div className="wl-filters">
            <select className="wl-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{t("pages.workerLeave.All status")}</option>
              <option value="pending">{t("pages.workerLeave.Pending")}</option>
              <option value="approved">{t("pages.workerLeave.Approved")}</option>
              <option value="rejected">{t("pages.workerLeave.Rejected")}</option>
              <option value="cancelled">{t("pages.workerLeave.Cancelled")}</option>
            </select>
            <select className="wl-select" value={type} onChange={(e) => setType(e.target.value)}>
              {typeOptions.map((t) => (
                <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
              ))}
            </select>
            <select className="wl-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">{t("pages.workerLeave.Newest first")}</option>
              <option value="oldest">{t("pages.workerLeave.Oldest first")}</option>
              <option value="start_desc">{t("pages.workerLeave.Start date ↓")}</option>
              <option value="start_asc">{t("pages.workerLeave.Start date ↑")}</option>
            </select>
            <button className="wl-btn wl-btn-ghost" type="button" onClick={clearFilters}>{t("pages.workerLeave.Reset")}</button>
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
            <div className="wl-empty">{t("common.loading")}</div>
          ) : (
            <table className="wl-table">
              <thead>
                <tr>
                  <th>{t("pages.workerLeave.Type")}</th>
                  <th>{t("pages.workerLeave.Date Range")}</th>
                  <th>{t("pages.workerLeave.Days")}</th>
                  <th>{t("pages.workerLeave.Status")}</th>
                  <th style={{ textAlign: "center" }}>{t("pages.workerLeave.Attachment")}</th>
                  <th style={{ textAlign: "center" }}>{t("pages.workerLeave.Action")}</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="wl-empty">{t("common.noResults")}</td>
                  </tr>
                ) : (
                  paged.map((req) => (
                    <tr key={req.requestId} className="wl-row" onClick={() => setActive(req)}>
                      <td className="wl-strong">{req.leaveType?.typeName}</td>
                      <td className="wl-small">
                        {moment(req.startDate).format("DD MMM")} - {moment(req.endDate).format("DD MMM YYYY")}
                      </td>
                      <td>
                        <div className="wl-days">
                          <span className="wl-days-main">{getDeductedDays(req)}</span>
                          <span className="wl-days-sub">{t("pages.workerLeave.deducted")}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`wl-badge wl-badge-${normStatus(req.status)}`}>{req.status}</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {req.attachmentUrl ? (
                          <a
                            className="wl-link"
                            href={`http://localhost:8000/uploads/${req.attachmentUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View
                          </a>
                        ) : (
                          <span className="wl-muted">-</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div className="wl-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="wl-btn-detail" type="button" onClick={() => setActive(req)}>
                            Details
                          </button>
                          {normStatus(req.status) === "pending" && (
                            <button
                              className="wl-btn-cancel"
                              type="button"
                              onClick={() => handleCancelLeave(req.requestId)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ✅ Detail Modal (Phase 2.3) */}
        {active && (
          <div className="wl-modal-backdrop" onClick={() => setActive(null)}>
            <div className="wl-modal" onClick={(e) => e.stopPropagation()}>
              <div className="wl-modal-head">
                <div>
                  <div className="wl-modal-title">{t("pages.workerLeave.Leave Request Details")}</div>
                  <div className="wl-modal-sub">
                    {moment(active.startDate).format("DD MMM YYYY")} → {moment(active.endDate).format("DD MMM YYYY")}
                  </div>
                </div>
                <button className="wl-modal-x" type="button" onClick={() => setActive(null)}>
                  ✕
                </button>
              </div>

              <div className="wl-modal-grid">
                <div className="wl-modal-block">
                  <div className="wl-kv">
                    <div className="wl-k">{t("pages.workerLeave.Type")}</div>
                    <div className="wl-v">{active.leaveType?.typeName || "-"}</div>
                  </div>
                  <div className="wl-kv">
                    <div className="wl-k">{t("pages.workerLeave.Status")}</div>
                    <div className="wl-v">
                      <span className={`wl-badge wl-badge-${normStatus(active.status)}`}>{active.status}</span>
                    </div>
                  </div>
                  <div className="wl-kv">
                    <div className="wl-k">{t("pages.workerLeave.Days deducted")}</div>
                    <div className="wl-v"><strong>{getDeductedDays(active)}</strong></div>
                  </div>
                  <div className="wl-kv wl-kv-full">
                    <div className="wl-k">{t("pages.workerLeave.Reason")}</div>
                    <div className="wl-v">{active.reason || "-"}</div>
                  </div>

                  <div className="wl-modal-actions">
                    <button className="wl-btn-detail" type="button" onClick={() => setActive(null)}>
                      Close
                    </button>
                    {normStatus(active.status) === "pending" && (
                      <button
                        className="wl-btn-cancel"
                        type="button"
                        onClick={async () => {
                          await handleCancelLeave(active.requestId);
                          setActive(null);
                        }}
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                </div>

                <div className="wl-modal-block">
                  <div className="wl-modal-block-title">{t("pages.workerLeave.Attachment")}</div>
                  {active.attachmentUrl ? (() => {
                    const meta = getAttachmentMeta(active.attachmentUrl);
                    return (
                      <>
                        <div className="wl-attach-actions">
                          <a className="wl-attach-btn" href={meta.href} target="_blank" rel="noreferrer">{t("pages.workerLeave.Open")}</a>
                          <a className="wl-attach-btn" href={meta.href} download>{t("pages.workerLeave.Download")}</a>
                        </div>
                        <div className="wl-preview">
                          {meta.kind === "image" ? (
                            <img src={meta.href} alt={t("pages.workerLeave.Attachment preview")} crossOrigin="anonymous" />
                          ) : meta.kind === "pdf" ? (
                            <iframe title={t("pages.workerLeave.PDF preview")} src={meta.href} />
                          ) : (
                            <div className="wl-preview-empty">{t("common.previewNotAvailable")}</div>
                          )}
                        </div>
                      </>
                    );
                  })() : (
                    <div className="wl-preview-empty">{t("common.noAttachment")}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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