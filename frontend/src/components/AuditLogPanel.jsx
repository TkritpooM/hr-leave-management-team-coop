import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import { FiRefreshCw, FiSearch, FiShield, FiFilter, FiX, FiTrash2 } from "react-icons/fi";

import Pagination from "./Pagination";
import { getAuditLogs } from "../api/auditService";
import { alertError } from "../utils/sweetAlert";
import "./AuditLogPanel.css";
import { useTranslation } from "react-i18next";

// --- Constants ---
const ACTION_LABELS = {
  LEAVE_REQUEST_CREATE: "audit.leaveRequested",
  LEAVE_REQUEST_CANCEL: "audit.leaveCancelled",
  LEAVE_REQUEST_APPROVE: "audit.leaveApproved",
  LEAVE_REQUEST_REJECT: "audit.leaveRejected",
  LEAVE_REQUEST_DELETE: "audit.leaveDeleted",
  CHECKIN: "audit.checkIn",
  CHECKIN_LATE: "audit.checkInLate",
  CHECKOUT: "audit.checkOut",
  LEAVE_TYPE_CREATE: "audit.leaveTypeCreate",
  LEAVE_TYPE_UPDATE: "audit.leaveTypeUpdate",
  LEAVE_TYPE_DELETE: "audit.leaveTypeDelete",
  QUOTA_CREATE: "audit.quotaCreate",
  QUOTA_UPDATE: "audit.quotaUpdate",
  EMPLOYEE_QUOTA_BULK_UPDATE: "audit.quotaBulkUpdate",
  HOLIDAY_CREATE: "audit.holidayCreate",
  HOLIDAY_DELETE: "audit.holidayDelete",
  ATTENDANCE_POLICY_UPDATE: "audit.policyUpdate",
  SYNC_DEFAULT_QUOTAS_ALL_EMPLOYEES: "audit.syncQuotas",
  PROCESS_YEAR_END_CARRY_FORWARD: "audit.yearEndCarry",
  EMPLOYEE_CREATE: "audit.employeeCreate",
  EMPLOYEE_UPDATE_BY_HR: "audit.employeeUpdate",
  PROFILE_UPDATE: "audit.profileUpdate",
  REGISTER: "audit.register",
  LOGIN_SUCCESS: "audit.loginSuccess",
  EXPORT_ATTENDANCE_CSV: "audit.exportAttendance",
  NOTIFICATION_MARK_READ: "audit.notificationRead",
  NOTIFICATION_MARK_ALL_READ: "audit.notificationReadAll",
  NOTIFICATION_CLEAR_ALL: "audit.notificationClearAll",
  NOTIFICATION_DELETE_ONE: "audit.notificationDelete",
};

const CATEGORY_LABELS = {
  Leave: "audit.category.leave",
  Attendance: "audit.category.attendance",
  Quota: "audit.category.quota",
  Holiday: "audit.category.holiday",
  Policy: "audit.category.policy",
  Employee: "audit.category.employee",
  Notification: "audit.category.notification",
  Auth: "audit.category.auth",
  Report: "audit.category.report",
  Other: "audit.category.other",
};


// --- Helpers ---
const getCategoryByAction = (action = "") => {
  if (action.startsWith("LEAVE_")) return "Leave";
  if (action.startsWith("CHECK")) return "Attendance";
  if (action.includes("QUOTA")) return "Quota";
  if (action.includes("HOLIDAY")) return "Holiday";
  if (action.includes("POLICY")) return "Policy";
  if (action.startsWith("EMPLOYEE") || action === "PROFILE_UPDATE") return "Employee";
  if (action.startsWith("NOTIFICATION")) return "Notification";
  if (action.startsWith("LOGIN") || action.startsWith("REGISTER")) return "Auth";
  if (action.startsWith("EXPORT")) return "Report";
  return "Other";
};

const parseEntityText = (log) => {
  const { entity = "", entityKey = "" } = log || {};
  if (entity === "LeaveRequest") {
    const id = entityKey.match(/LeaveRequest:(\d+)/i)?.[1];
    return id ? `Leave Request #${id}` : "Leave Request";
  }
  if (entity === "TimeRecord") {
    const match = entityKey.match(/Employee:(\d+):WorkDate:(\d{4}-\d{2}-\d{2})/i);
    const dateStr = match?.[2] ? moment(match[2]).format("DD MMM YYYY") : "";
    return `Attendance${dateStr ? ` (${dateStr})` : ""}${match?.[1] ? ` • Emp #${match[1]}` : ""}`;
  }
  return entity && entityKey ? `${entity} • ${entityKey}` : (entity || entityKey || "-");
};

const JsonBlock = ({ value }) => (
  <pre style={{ margin: 0, padding: 12, borderRadius: 12, border: "1px solid #eef2f7", background: "#fafafa", fontSize: 12, overflow: "auto", maxHeight: 220 }}>
    {value ? JSON.stringify(value, null, 2) : "-"}
  </pre>
);

export default function AuditLogPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  // Filter States
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [action, setAction] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);

  const categories = useMemo(() => ["All", ...Object.keys(CATEGORY_LABELS)], []);
  const actionOptions = useMemo(() => ["All", ...Object.keys(ACTION_LABELS)], []);

  const handleClearFilters = () => {
    setQ("");
    setCategory("All");
    setAction("All");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const params = { q, category, action: action === "All" ? "" : action, dateFrom, dateTo, page, pageSize };
      const res = await getAuditLogs(params);
      setRows(Array.isArray(res) ? res : res?.rows || []);
      setTotal(Array.isArray(res) ? res.length : res?.total || 0);
    } catch (err) {
      alertError(t("Error"), t("Unable to load audit logs."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAudit(); }, [page, pageSize, category, action, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchAudit(); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const normalizedData = useMemo(() => (rows || []).map(log => {
    const cat = getCategoryByAction(log?.action);
    return {
      ...log,
      __actLabel: t(ACTION_LABELS[log?.action] || log?.action),
      __catLabel: t(CATEGORY_LABELS[cat] || cat),
      __user: log?.performer ? `${log.performer.firstName} ${log.performer.lastName}`.trim() : "-",
      __summary: parseEntityText(log)
    };
  }), [rows]);

  return (
    <section className="audit-wrapper">
      <div className="audit-card">
        {/* HEADER & TOOLS SECTION */}
        <div className="audit-head" style={{ flexDirection: "column", alignItems: "flex-start", gap: "20px" }}>
          {/* 1. TITLE (Always on Top) */}
          <div className="audit-header-title">
            <div className="audit-title"><FiShield />{t("Audit Log")}</div>
            <div className="audit-subtitle">{t("System activities and history")}</div>
          </div>

          {/* 2. TOOLS / FILTERS */}
          <div className="audit-tools">
            <div className="audit-field">
              <label className="audit-label"><FiFilter />{t("Category")}</label>
              <select className="audit-select" value={category} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => <option key={c} value={c}>{c === "All" ? "All" : CATEGORY_LABELS[c] || c}</option>)}
              </select>
            </div>

            <div className="audit-field">
              <label className="audit-label">{t("Action")}</label>
              <select className="audit-select" value={action} onChange={e => setAction(e.target.value)}>
                {actionOptions.map(a => <option key={a} value={a}>{a === "All" ? "All" : ACTION_LABELS[a] || a}</option>)}
              </select>
            </div>

            <div className="audit-field">
              <label className="audit-label">{t("From")}</label>
              <input className="audit-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>

            <div className="audit-field">
              <label className="audit-label">{t("To")}</label>
              <input className="audit-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>

            <div className="audit-search">
              <FiSearch className="audit-search-icon" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={t("Search User, ID...")} />
            </div>

            <div className="audit-action-btns">
              <button className="btn outline small" onClick={handleClearFilters} title={t("Clear all filters")}>
                <FiTrash2 />{t("Clear")}</button>
              <button className="btn primary small" onClick={fetchAudit} disabled={loading}>
                <FiRefreshCw className={loading ? "spin" : ""} />{t("Refresh")}</button>
            </div>
          </div>
        </div>

        {/* TABLE SECTION */}
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th className="audit-th-time">{t("Timestamp")}</th>
                <th className="audit-th-user">{t("User")}</th>
                <th className="audit-th-type">{t("Category")}</th>
                <th className="audit-th-desc">{t("Activity")}</th>
              </tr>
            </thead>
            <tbody>
              {normalizedData.length === 0 ? (
                <tr><td colSpan="4" className="audit-empty">{loading ? "Loading..." : t("No logs found")}</td></tr>
              ) : (
                normalizedData.map(log => (
                  <tr key={log.auditLogId} className="audit-row" onClick={() => setSelected(log)}>
                    <td className="audit-td-time">
                      <div className="audit-time">{moment(log.createdAt).format("DD MMM YYYY")}</div>
                      <div className="audit-time-sub">{moment(log.createdAt).format("HH:mm")}</div>
                    </td>
                    <td className="audit-td-user">
                      <div className="audit-user">{log.__user}</div>
                      <div className="audit-user-sub">{log?.performer?.role}</div>
                    </td>
                    <td className="audit-td-type">
                      <span className={`audit-badge audit-badge--${getCategoryByAction(log.action).toLowerCase()}`}>
                        {log.__catLabel}
                      </span>
                    </td>
                    <td className="audit-td-desc">
                      <div className="audit-action">{log.__actLabel}</div>
                      <div className="audit-desc">{log.__summary}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="audit-footer">
          <div className="audit-hint">{t("Click row for data comparison")}</div>
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selected && (
        <div className="audit-modal-overlay" onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="audit-modal-content" onClick={e => e.stopPropagation()} style={{ background: "white", width: "min(960px, 95vw)", borderRadius: "18px", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>{t(ACTION_LABELS[selected.action] || selected.action)}</h3>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{moment(selected.createdAt).format("DD MMM YYYY, HH:mm:ss")}</div>
              </div>
              <button className="btn outline small" onClick={() => setSelected(null)}><FiX />{t("Close")}</button>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                <div style={{ border: "1px solid #f0f0f0", padding: "15px", borderRadius: "12px" }}>
                  <h4 style={{ marginTop: 0, fontSize: "14px", borderBottom: "1px solid #f0f0f0", paddingBottom: "8px" }}>{t("General Information")}</h4>
                  <div style={{ fontSize: "13px", lineHeight: "2" }}>
                    <div><b>{t("User:")}</b> {selected.__user}</div>
                    <div><b>{t("Role:")}</b> {selected?.performer?.role || "-"}</div>
                    <div><b>{t("IP Address:")}</b> {selected.ipAddress || "N/A"}</div>
                    <div><b>{t("Target:")}</b> {selected.__summary}</div>
                  </div>
                </div>
                <div style={{ border: "1px solid #f0f0f0", padding: "15px", borderRadius: "12px" }}>
                  <h4 style={{ marginTop: 0, fontSize: "14px", borderBottom: "1px solid #f0f0f0", paddingBottom: "8px" }}>{t("Changes Snapshot")}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div><label style={{ fontSize: "11px", fontWeight: 800, color: "#999" }}>{t("BEFORE")}</label><JsonBlock value={selected.oldValue} /></div>
                    <div><label style={{ fontSize: "11px", fontWeight: 800, color: "#999" }}>{t("AFTER")}</label><JsonBlock value={selected.newValue} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}