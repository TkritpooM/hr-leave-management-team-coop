import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import { FiRefreshCw, FiSearch, FiShield, FiFilter, FiX } from "react-icons/fi";

import Pagination from "./Pagination";
import { getAuditLogs } from "../api/auditService";
import { alertError } from "../utils/sweetAlert";
import "./AuditLogPanel.css";

// -----------------------
// 1) Mapping ให้คนอ่านง่าย
// -----------------------
const ACTION_LABELS = {
  // Leave
  LEAVE_REQUEST_CREATE: "ยื่นใบลา",
  LEAVE_REQUEST_CANCEL: "ยกเลิกใบลา",
  LEAVE_REQUEST_APPROVE: "อนุมัติใบลา",
  LEAVE_REQUEST_REJECT: "ไม่อนุมัติใบลา",
  LEAVE_REQUEST_DELETE: "ลบใบลา",

  // Attendance
  CHECKIN: "เช็คอินเข้างาน",
  CHECKIN_LATE: "เช็คอิน (มาสาย)",
  CHECKOUT: "เช็คเอาต์ออกงาน",

  // Leave Type / Policy / Quota / Holiday
  LEAVE_TYPE_CREATE: "สร้างประเภทการลา",
  LEAVE_TYPE_UPDATE: "แก้ไขประเภทการลา",
  LEAVE_TYPE_DELETE: "ลบประเภทการลา",

  QUOTA_CREATE: "ตั้งค่าโควต้า (สร้าง)",
  QUOTA_UPDATE: "ตั้งค่าโควต้า (แก้ไข)",
  EMPLOYEE_QUOTA_BULK_UPDATE: "ปรับโควต้า (รายบุคคล)",

  HOLIDAY_CREATE: "เพิ่มวันหยุด",
  HOLIDAY_DELETE: "ลบวันหยุด",

  ATTENDANCE_POLICY_UPDATE: "ปรับนโยบายเวลาเข้างาน",
  SYNC_DEFAULT_QUOTAS_ALL_EMPLOYEES: "ซิงค์โควต้าเริ่มต้นทั้งบริษัท",
  PROCESS_YEAR_END_CARRY_FORWARD: "ประมวลผลยกยอดโควต้า",

  // Employee
  EMPLOYEE_CREATE: "เพิ่มพนักงาน",
  EMPLOYEE_UPDATE_BY_HR: "แก้ไขข้อมูลพนักงาน",
  PROFILE_UPDATE: "แก้ไขโปรไฟล์",

  // Auth
  REGISTER: "สมัครบัญชี",
  LOGIN_SUCCESS: "เข้าสู่ระบบ",

  // Report
  EXPORT_ATTENDANCE_CSV: "Export รายงานลงเวลา (CSV)",

  // Notification
  NOTIFICATION_MARK_READ: "อ่านแจ้งเตือน",
  NOTIFICATION_MARK_ALL_READ: "อ่านแจ้งเตือนทั้งหมด",
  NOTIFICATION_CLEAR_ALL: "ล้างแจ้งเตือนทั้งหมด",
  NOTIFICATION_DELETE_ONE: "ลบแจ้งเตือน",
};

const CATEGORY_BY_ACTION = (action = "") => {
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

const CATEGORY_LABELS = {
  Leave: "การลา",
  Attendance: "ลงเวลา",
  Quota: "โควต้า",
  Holiday: "วันหยุด",
  Policy: "นโยบาย",
  Employee: "พนักงาน",
  Notification: "แจ้งเตือน",
  Auth: "บัญชี",
  Report: "รายงาน",
  Other: "อื่นๆ",
};

// -----------------------
// 2) Helper แปลง entityKey ให้เป็นคำอธิบาย
// -----------------------
const parseEntityText = (log) => {
  const entity = log?.entity || "";
  const key = log?.entityKey || "";

  if (entity === "LeaveRequest") {
    const m = key.match(/LeaveRequest:(\d+)/i);
    const id = m?.[1];
    return id ? `ใบลา #${id}` : "ใบลา";
  }

  if (entity === "TimeRecord") {
    const m = key.match(/Employee:(\d+):WorkDate:(\d{4}-\d{2}-\d{2})/i);
    const empId = m?.[1];
    const date = m?.[2];
    return `ลงเวลา${date ? ` (${moment(date).format("DD MMM YYYY")})` : ""}${empId ? ` • พนักงาน #${empId}` : ""}`;
  }

  if (entity === "Employee") {
    const m = key.match(/Employee:(\d+)/i);
    const id = m?.[1];
    return id ? `พนักงาน #${id}` : "พนักงาน";
  }

  if (entity && key) return `${entity} • ${key}`;
  return entity || key || "-";
};

// summary: ไม่ใส่ label ซ้ำ (ให้ label อยู่บรรทัดบน)
const buildSummary = (log) => {
  const action = log?.action || "";
  const target = parseEntityText(log);

  if (action === "LEAVE_REQUEST_CREATE") {
    const days = log?.newValue?.totalDaysRequested;
    return `${target}${days ? ` • ${days} วัน` : ""}`;
  }

  return target;
};

/**
 * ✅ สำคัญ: ใช้ class เฉพาะของ Audit Log เท่านั้น
 * เพื่อไม่ชน/ไม่โดน CSS จาก HRDashboard.css (.badge)
 */
const auditBadgeClass = (category) => {
  switch (category) {
    case "Leave":
      return "audit-badge audit-badge--leave";
    case "Attendance":
      return "audit-badge audit-badge--attendance";
    case "Quota":
      return "audit-badge audit-badge--quota";
    case "Holiday":
      return "audit-badge audit-badge--holiday";
    case "Policy":
      return "audit-badge audit-badge--policy";
    case "Employee":
      return "audit-badge audit-badge--employee";
    case "Notification":
      return "audit-badge audit-badge--notification";
    case "Auth":
      return "audit-badge audit-badge--auth";
    case "Report":
      return "audit-badge audit-badge--report";
    default:
      return "audit-badge audit-badge--other";
  }
};

const JsonBlock = ({ value }) => {
  if (!value) return <span className="audit-text-muted">-</span>;
  return (
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
      {JSON.stringify(value, null, 2)}
    </pre>
  );
};

export default function AuditLogPanel() {
  const [loading, setLoading] = useState(false);

  // server paging
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  // filters
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [action, setAction] = useState("All");
  const [dateFrom, setDateFrom] = useState(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState(""); // YYYY-MM-DD

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // detail modal
  const [selected, setSelected] = useState(null);

  const categories = useMemo(() => {
    return ["All", "Leave", "Attendance", "Quota", "Holiday", "Policy", "Employee", "Notification", "Auth", "Report", "Other"];
  }, []);

  const actionOptions = useMemo(() => {
    // All + keys of ACTION_LABELS
    return ["All", ...Object.keys(ACTION_LABELS)];
  }, []);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        q,
        category,
        action: action === "All" ? "" : action,
        dateFrom,
        dateTo,
        page,
        pageSize,
      });

      // รองรับทั้งแบบเดิม (array) และแบบใหม่ (object)
      if (Array.isArray(res)) {
        setRows(res);
        setTotal(res.length);
      } else {
        setRows(res?.rows || []);
        setTotal(res?.total || 0);
      }
    } catch (err) {
      console.error(err);
      alertError("Error", "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  // fetch เมื่อ paging / filters เปลี่ยน
  useEffect(() => {
    fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, category, action, dateFrom, dateTo]);

  // search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchAudit();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const normalized = useMemo(() => {
    return (rows || []).map((l) => {
      const cat = CATEGORY_BY_ACTION(l?.action || "");
      const user = l?.performer
        ? `${l.performer.firstName || ""} ${l.performer.lastName || ""}`.trim()
        : "-";

      return {
        ...l,
        __category: cat,
        __categoryLabel: CATEGORY_LABELS[cat] || cat,
        __actionLabel: ACTION_LABELS[l?.action] || l?.action || "-",
        __userLabel: user || "-",
        __summary: buildSummary(l),
      };
    });
  }, [rows]);

  return (
    <section className="audit-wrapper">
      <div className="audit-card">
        {/* HEADER */}
        <div className="audit-head">
          <div>
            <div className="audit-title">
              <FiShield /> Audit Log
            </div>
            <div className="audit-subtitle">ประวัติกิจกรรมการใช้งานในระบบบริษัท</div>
          </div>

          <div className="audit-tools">
            {/* Category */}
            <div className="audit-field">
              <label className="audit-label">
                <FiFilter /> ประเภท
              </label>
              <select
                className="audit-select"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? "ทั้งหมด" : CATEGORY_LABELS[c] || c}
                  </option>
                ))}
              </select>
            </div>

            {/* Action */}
            <div className="audit-field">
              <label className="audit-label">Action</label>
              <select
                className="audit-select"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(1);
                }}
              >
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a === "All" ? "ทั้งหมด" : ACTION_LABELS[a] || a}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From/To */}
            <div className="audit-field">
              <label className="audit-label">จากวันที่</label>
              <input
                className="audit-input"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="audit-field">
              <label className="audit-label">ถึงวันที่</label>
              <input
                className="audit-input"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Search */}
            <div className="audit-search">
              <FiSearch className="audit-search-icon" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา: ชื่อผู้ใช้, ใบลา #, IP..." />
            </div>

            <button className="btn outline small" onClick={fetchAudit} disabled={loading}>
              <FiRefreshCw className={loading ? "spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="audit-table-wrap">
          <table className="audit-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>

            <thead>
              <tr>
                <th style={{ width: 190 }}>เวลา</th>
                <th style={{ width: 170 }}>ผู้ใช้งาน</th>
                <th style={{ width: 130 }}>ประเภท</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>

            <tbody>
              {normalized.length === 0 ? (
                <tr>
                  <td colSpan="4" className="audit-empty">
                    {loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}
                  </td>
                </tr>
              ) : (
                normalized.map((l) => (
                  <tr key={l.auditLogId} className="audit-row" onClick={() => setSelected(l)} title="คลิกเพื่อดูรายละเอียด">
                    <td>
                      <div className="audit-time">{l.createdAt ? moment(l.createdAt).format("DD MMM YYYY") : "-"}</div>
                      <div className="audit-time-sub">{l.createdAt ? moment(l.createdAt).format("HH:mm") : ""}</div>
                    </td>

                    <td>
                      <div className="audit-user">{l.__userLabel}</div>
                      <div className="audit-user-sub">{l?.performer?.role || "-"}</div>
                    </td>

                    <td>
                      {/* ✅ ใช้ class เฉพาะ audit เท่านั้น */}
                      <span className={auditBadgeClass(l.__category)}>{l.__categoryLabel}</span>
                    </td>

                    <td>
                      <div className="audit-action">{l.__actionLabel}</div>
                      <div className="audit-desc">{l.__summary}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="audit-footer">
          <div className="audit-hint">คลิกแถวเพื่อดูรายละเอียด Before/After และ IP</div>
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              borderRadius: 18,
              background: "white",
              border: "1px solid #eef2f7",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid #eef2f7",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 900, fontSize: 14 }}>{ACTION_LABELS[selected.action] || selected.action}</div>
                <div className="audit-text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {selected.createdAt ? moment(selected.createdAt).format("DD MMM YYYY, HH:mm:ss") : "-"}
                  {" • "}
                  {selected.entity ? `${selected.entity}` : "-"}
                  {selected.entityKey ? ` • ${selected.entityKey}` : ""}
                </div>
              </div>

              <button className="btn outline small" onClick={() => setSelected(null)}>
                <FiX /> ปิด
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ border: "1px solid #eef2f7", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 10 }}>ข้อมูลการกระทำ</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <div>
                      <b>ผู้ทำ:</b>{" "}
                      {selected?.performer ? `${selected.performer.firstName} ${selected.performer.lastName}` : "-"}
                    </div>
                    <div>
                      <b>Role:</b> {selected?.performer?.role || "-"}
                    </div>
                    <div>
                      <b>IP:</b> {selected?.ipAddress || "-"}
                    </div>
                    <div>
                      <b>Target:</b> {parseEntityText(selected)}
                    </div>
                  </div>
                </div>

                <div style={{ border: "1px solid #eef2f7", borderRadius: 14, padding: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 10 }}>หลักฐาน (Before / After)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div className="audit-text-muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                        BEFORE
                      </div>
                      <JsonBlock value={selected.oldValue} />
                    </div>
                    <div>
                      <div className="audit-text-muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                        AFTER
                      </div>
                      <JsonBlock value={selected.newValue} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="audit-text-muted" style={{ fontSize: 12, marginTop: 12 }}>
                * คลิกนอกกรอบเพื่อปิด
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
