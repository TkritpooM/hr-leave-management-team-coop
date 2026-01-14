import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import "moment/locale/th";
import {
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiFilter,
  FiX,
  FiTrash2,
  FiDownload,
} from "react-icons/fi";

import Pagination from "./Pagination";
import { getAuditLogs } from "../api/auditService";
import { alertError } from "../utils/sweetAlert";
import "./AuditLogPanel.css";
import { useTranslation } from "react-i18next";

// --- Constants (ใช้เป็น fallback เท่านั้น) ---
const ACTION_FALLBACK = {
  LEAVE_REQUEST_CREATE: "Leave Requested",
  LEAVE_REQUEST_CANCEL: "Leave Cancelled",
  LEAVE_REQUEST_APPROVE: "Leave Approved",
  LEAVE_REQUEST_REJECT: "Leave Rejected",
  LEAVE_REQUEST_DELETE: "Leave Deleted",
  CHECKIN: "Clock-In",
  CHECKIN_LATE: "Clock-In (Late)",
  CHECKOUT: "Clock-Out",
  LEAVE_TYPE_CREATE: "Created Leave Type",
  LEAVE_TYPE_UPDATE: "Updated Leave Type",
  LEAVE_TYPE_DELETE: "Deleted Leave Type",
  QUOTA_CREATE: "Created Quota",
  QUOTA_UPDATE: "Updated Quota",
  EMPLOYEE_QUOTA_BULK_UPDATE: "Bulk Quota Update",
  HOLIDAY_CREATE: "Added Holiday",
  HOLIDAY_DELETE: "Deleted Holiday",
  ATTENDANCE_POLICY_UPDATE: "Updated Attendance Policy",
  SYNC_DEFAULT_QUOTAS_ALL_EMPLOYEES: "Synced Global Quotas",
  PROCESS_YEAR_END_CARRY_FORWARD: "Processed Year-End Carry Forward",
  EMPLOYEE_CREATE: "Added Employee",
  EMPLOYEE_UPDATE_BY_HR: "Employee Info Updated",
  PROFILE_UPDATE: "Profile Updated",
  PROFILE_UPDATE_REQUEST_SUBMIT: "Profile Update Requested",
  PROFILE_UPDATE_REJECTED: "Profile Update Rejected",
  REGISTER: "Account Registered",
  LOGIN_SUCCESS: "Login Success",
  EXPORT_ATTENDANCE_CSV: "Exported Attendance (CSV)",
  NOTIFICATION_MARK_READ: "Marked Read",
  NOTIFICATION_MARK_ALL_READ: "Marked All Read",
  NOTIFICATION_CLEAR_ALL: "Cleared Notifications",
  NOTIFICATION_DELETE_ONE: "Deleted Notification",
};

const CATEGORY_FALLBACK = {
  Leave: "Leave Management",
  Attendance: "Attendance",
  Quota: "Quota",
  Holiday: "Holidays",
  Policy: "Policies",
  Employee: "Employee Records",
  Notification: "Notifications",
  Auth: "Account/Auth",
  Report: "Reports",
  Other: "Other",
};

// --- Helpers ---
const getCategoryByAction = (action = "") => {
  if (action.startsWith("LEAVE_")) return "Leave";
  if (action.startsWith("CHECK")) return "Attendance";
  if (action.includes("QUOTA")) return "Quota";
  if (action.includes("HOLIDAY")) return "Holiday";
  if (action.includes("POLICY")) return "Policy";
  if (action.startsWith("EMPLOYEE") || action.startsWith("PROFILE_UPDATE")) return "Employee";
  if (action.startsWith("NOTIFICATION")) return "Notification";
  if (action.startsWith("LOGIN") || action.startsWith("REGISTER"))
    return "Auth";
  if (action.startsWith("EXPORT")) return "Report";
  return "Other";
};

const formatAuditValue = (val, t) => {
  if (val === null || val === undefined || val === "") return "-";
  if (typeof val === "boolean") return val ? t("common.true", "Yes") : t("common.false", "No");
  if (Array.isArray(val)) {
    if (val.length === 0) return "-";
    // If array of strings/numbers
    return val.join(", ");
  }
  // Date check
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    return moment(val).format("DD MMM YYYY, HH:mm");
  }
  return String(val);
};

const ReadableChangeView = ({ data, t }) => {
  if (!data || typeof data !== "object") return <JsonBlock value={data} />;

  const keys = Object.keys(data);
  if (keys.length === 0) return <div style={{ color: "#999", fontStyle: "italic", fontSize: "12px" }}>-</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "#fafafa", borderRadius: "8px", padding: "10px", border: "1px solid #f1f5f9" }}>
      {keys.map((key) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", fontSize: "12px" }}>
          <span style={{ fontWeight: 600, color: "#64748b", minWidth: "120px" }}>
            {t(`auditFields.${key}`, key)}
          </span>
          <span style={{ color: "#334155", fontWeight: 500, wordBreak: "break-word", textAlign: "right", flex: 1 }}>
            {formatAuditValue(data[key], t)}
          </span>
        </div>
      ))}
    </div>
  );
};

const JsonBlock = ({ value }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #eef2f7",
      background: "#fafafa",
      fontSize: 12,
      overflow: "auto",
      maxHeight: 220,
    }}
  >
    {value ? JSON.stringify(value, null, 2) : "-"}
  </pre>
);

export default function AuditLogPanel() {
  const { t, i18n } = useTranslation();

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

  // ✅ moment locale ตามภาษา
  useEffect(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en")
      .toLowerCase()
      .trim();
    moment.locale(lng.startsWith("th") ? "th" : "en");
  }, [i18n.resolvedLanguage, i18n.language]);

  const tCat = (cat) =>
    t(
      `components.auditLogPanel.categories.${cat}`,
      CATEGORY_FALLBACK[cat] || cat
    );

  const tAct = (act) =>
    t(
      `components.auditLogPanel.actions.${act}`,
      ACTION_FALLBACK[act] || act || "-"
    );

  const tAll = () => t("common.all", "All");

  const categories = useMemo(
    () => ["All", ...Object.keys(CATEGORY_FALLBACK)],
    []
  );
  const actionOptions = useMemo(
    () => ["All", ...Object.keys(ACTION_FALLBACK)],
    []
  );

  const handleClearFilters = () => {
    setQ("");
    setCategory("All");
    setAction("All");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const parseEntityText = (log) => {
    const { entity = "", entityKey = "" } = log || {};

    if (entity === "LeaveRequest") {
      const id = entityKey.match(/LeaveRequest:(\d+)/i)?.[1];
      return id
        ? t(
          "components.auditLogPanel.entity.leaveRequestWithId",
          "Leave Request #{{id}}",
          { id }
        )
        : t(
          "components.auditLogPanel.entity.leaveRequest",
          "Leave Request"
        );
    }

    if (entity === "TimeRecord") {
      const match = entityKey.match(
        /Employee:(\d+):WorkDate:(\d{4}-\d{2}-\d{2})/i
      );
      const dateStr = match?.[2]
        ? moment(match[2]).format("DD MMM YYYY")
        : "";
      const empId = match?.[1];

      const base = t(
        "components.auditLogPanel.entity.attendance",
        "Attendance"
      );
      const partDate = dateStr ? ` (${dateStr})` : "";
      const partEmp = empId
        ? ` • ${t(
          "components.auditLogPanel.entity.empShort",
          "Emp"
        )} #${empId}`
        : "";

      return `${base}${partDate}${partEmp}`;
    }

    return entity && entityKey
      ? `${entity} • ${entityKey}`
      : entity || entityKey || "-";
  };

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const params = {
        q,
        category,
        action: action === "All" ? "" : action,
        dateFrom,
        dateTo,
        page,
        pageSize,
      };
      const res = await getAuditLogs(params);
      setRows(Array.isArray(res) ? res : res?.rows || []);
      setTotal(Array.isArray(res) ? res.length : res?.total || 0);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        t(
          "components.auditLogPanel.alert.loadFailed",
          "Unable to load audit logs."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, category, action, dateFrom, dateTo]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      fetchAudit();
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const normalizedData = useMemo(
    () =>
      (rows || []).map((log) => {
        const cat = getCategoryByAction(log?.action || "");
        return {
          ...log,
          __catKey: cat,
          __catLabel: tCat(cat),
          __actLabel: tAct(log?.action),
          __user: log?.performer
            ? `${log.performer.firstName} ${log.performer.lastName}`.trim()
            : "-",
          __summary: parseEntityText(log),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, i18n.resolvedLanguage, i18n.language]
  );

  const handleExportCSV = () => {
    if (!normalizedData || normalizedData.length === 0) {
      alertError(t("common.error"), t("common.noDataAvailable"));
      return;
    }

    const headers = [
      t("components.auditLogPanel.timestamp", "Timestamp"),
      t("components.auditLogPanel.user", "User"),
      t("components.auditLogPanel.modal.role", "Role"),
      t("components.auditLogPanel.category", "Category"),
      t("components.auditLogPanel.activity", "Activity"),
      t("components.auditLogPanel.modal.target", "Target"),
      "Details"
    ];

    const csvRows = normalizedData.map(log => [
      moment(log.createdAt).format("YYYY-MM-DD HH:mm:ss"),
      log.__user,
      log?.performer?.role || "-",
      log.__catLabel,
      log.__actLabel,
      `"${(log.__summary || "").replace(/"/g, '""')}"`,
      `"${(JSON.stringify(log.newValue || {})).replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `audit_logs_${moment().format("YYYYMMDD_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="audit-wrapper">
      <div className="audit-card">
        {/* HEADER & TOOLS SECTION */}
        <div
          className="audit-head"
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "20px",
          }}
        >
          {/* TITLE */}
          <div className="audit-header-title">
            <div className="audit-title">
              <FiShield />
              {t("components.auditLogPanel.title", "Audit Log")}
            </div>
            <div className="audit-subtitle">
              {t(
                "components.auditLogPanel.subtitle",
                "System activities and history"
              )}
            </div>
          </div>

          {/* TOOLS / FILTERS */}
          <div className="audit-tools">
            <div className="audit-field">
              <label className="audit-label">
                <FiFilter />
                {t("components.auditLogPanel.category", "Category")}
              </label>
              <select
                className="audit-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? tAll() : tCat(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-field">
              <label className="audit-label">
                {t("components.auditLogPanel.action", "Action")}
              </label>
              <select
                className="audit-select"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a === "All" ? tAll() : tAct(a)}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-field">
              <label className="audit-label">
                {t("components.auditLogPanel.from", "From")}
              </label>
              <input
                className="audit-input"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="audit-field">
              <label className="audit-label">
                {t("components.auditLogPanel.to", "To")}
              </label>
              <input
                className="audit-input"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>

            <div className="audit-search">
              <FiSearch className="audit-search-icon" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t(
                  "components.auditLogPanel.searchPlaceholder",
                  "Search user, ID..."
                )}
              />
            </div>

            <div className="audit-action-btns">
              <button
                className="btn outline small"
                onClick={handleExportCSV}
                title="Export CSV"
                disabled={loading || normalizedData.length === 0}
              >
                <FiDownload />
                Export CSV
              </button>

              <button
                className="btn outline small"
                onClick={handleClearFilters}
                title={t(
                  "components.auditLogPanel.clearAllFilters",
                  "Clear all filters"
                )}
              >
                <FiTrash2 />
                {t("components.auditLogPanel.clear", "Clear")}
              </button>

              <button
                className="btn primary small"
                onClick={fetchAudit}
                disabled={loading}
              >
                <FiRefreshCw className={loading ? "spin" : ""} />
                {t("components.auditLogPanel.refresh", "Refresh")}
              </button>
            </div>
          </div>
        </div>

        {/* TABLE SECTION */}
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th className="audit-th-time">
                  {t("components.auditLogPanel.timestamp", "Timestamp")}
                </th>
                <th className="audit-th-user">
                  {t("components.auditLogPanel.user", "User")}
                </th>
                <th className="audit-th-type">
                  {t("components.auditLogPanel.category", "Category")}
                </th>
                <th className="audit-th-desc">
                  {t("components.auditLogPanel.activity", "Activity")}
                </th>
              </tr>
            </thead>

            <tbody>
              {normalizedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="audit-empty">
                    {loading
                      ? t("components.auditLogPanel.loading", "Loading...")
                      : t("components.auditLogPanel.noLogs", "No logs found")}
                  </td>
                </tr>
              ) : (
                normalizedData.map((log) => (
                  <tr
                    key={log.auditLogId}
                    className="audit-row"
                    onClick={() => setSelected(log)}
                  >
                    <td className="audit-td-time">
                      <div className="audit-time">
                        {moment(log.createdAt).format("DD MMM YYYY")}
                      </div>
                      <div className="audit-time-sub">
                        {moment(log.createdAt).format("HH:mm")}
                      </div>
                    </td>

                    <td className="audit-td-user">
                      <div className="audit-user">{log.__user}</div>
                      <div className="audit-user-sub">
                        {log?.performer?.role ||
                          t("common.na", "N/A")}
                      </div>
                    </td>

                    <td className="audit-td-type">
                      <span
                        className={`audit-badge audit-badge--${String(
                          log.__catKey || "other"
                        ).toLowerCase()}`}
                      >
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
          <div className="audit-hint">
            {t(
              "components.auditLogPanel.footerHint",
              "Click a row to view detailed changes"
            )}
          </div>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selected && (
        <div
          className="audit-modal-overlay"
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="audit-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              width: "min(960px, 95vw)",
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>
                  {tAct(selected.action)}
                </h3>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginTop: "4px",
                  }}
                >
                  {moment(selected.createdAt).format("DD MMM YYYY, HH:mm:ss")}
                </div>
              </div>

              <button
                className="btn outline small"
                onClick={() => setSelected(null)}
              >
                <FiX />
                {t("components.auditLogPanel.modal.close", "Close")}
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "20px",
                }}
              >
                {/* General Info */}
                <div
                  style={{
                    border: "1px solid #f0f0f0",
                    padding: "15px",
                    borderRadius: "12px",
                  }}
                >
                  <h4
                    style={{
                      marginTop: 0,
                      fontSize: "14px",
                      borderBottom: "1px solid #f0f0f0",
                      paddingBottom: "8px",
                    }}
                  >
                    {t(
                      "components.auditLogPanel.modal.generalInfo",
                      "General Information"
                    )}
                  </h4>

                  <div style={{ fontSize: "13px", lineHeight: "2" }}>
                    <div>
                      <b>
                        {t("components.auditLogPanel.modal.user", "User")}:
                      </b>{" "}
                      {selected.__user}
                    </div>

                    <div>
                      <b>
                        {t("components.auditLogPanel.modal.role", "Role")}:
                      </b>{" "}
                      {selected?.performer?.role || "-"}
                    </div>

                    <div>
                      <b>{t("components.auditLogPanel.modal.ip", "IP")}:</b>{" "}
                      {selected.ipAddress ||
                        t("common.na", "N/A")}
                    </div>

                    <div>
                      <b>
                        {t("components.auditLogPanel.modal.target", "Target")}:
                      </b>{" "}
                      {selected.__summary}
                    </div>
                  </div>
                </div>

                {/* Changes */}
                <div
                  style={{
                    border: "1px solid #f0f0f0",
                    padding: "15px",
                    borderRadius: "12px",
                  }}
                >
                  <h4
                    style={{
                      marginTop: 0,
                      fontSize: "14px",
                      borderBottom: "1px solid #f0f0f0",
                      paddingBottom: "8px",
                    }}
                  >
                    {t(
                      "components.auditLogPanel.modal.changes",
                      "Changes Snapshot"
                    )}
                  </h4>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "#999",
                        }}
                      >
                        {t(
                          "components.auditLogPanel.modal.before",
                          "Before"
                        )}
                      </label>
                      <ReadableChangeView data={selected.oldValue} t={t} />
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: "11px",
                          fontWeight: 800,
                          color: "#999",
                        }}
                      >
                        {t(
                          "components.auditLogPanel.modal.after",
                          "After"
                        )}
                      </label>
                      <ReadableChangeView data={selected.newValue} t={t} />
                    </div>
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
