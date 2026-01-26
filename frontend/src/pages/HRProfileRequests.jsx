import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { useLocation } from "react-router-dom";
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import { FiUser, FiCheck, FiX, FiExternalLink, FiClock } from "react-icons/fi";
import moment from "moment";
import "moment/locale/th";
import "./HRLeaveApprovals.css";
import { useTranslation } from "react-i18next";

export default function HRProfileRequests() {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  // 1. จัดการ Locale สำหรับ Moment และ UI
  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en").toLowerCase().trim();
    return lng.startsWith("th") ? "th" : "en";
  }, [i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    moment.locale(mLocale);
  }, [mLocale]);

  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [active, setActive] = useState(null);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 2. ล้างตัวเลขแจ้งเตือนที่ Sidebar
  const setSidebarUnreadZero = () => {
    try {
      localStorage.setItem("hr_unread_notifications", "0");
      window.dispatchEvent(new Event("storage"));
    } catch (_) { }
  };

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const res = await axiosClient.get("/auth/admin/profile-requests");
      const fetchedData = res.data?.requests || res.data || [];
      setRequests(fetchedData);

      // ✅ Logic: autoOpenId จากหน้า Notification
      if (location.state?.autoOpenId) {
        const targetId = Number(location.state.autoOpenId);
        const targetRequest = fetchedData.find(r => Number(r.requestId) === targetId);
        if (targetRequest) {
          setActive(targetRequest);
          window.history.replaceState({}, document.title);
        }
      }
    } catch (err) {
      alertError(t("common.error"), t("pages.hrProfileRequests.alert.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    setSidebarUnreadZero();
  }, []);

  // 3. จัดการการอนุมัติ/ปฏิเสธ
  const handleAction = async (requestId, actionType) => {
    const isApprove = actionType === "approve";
    const ok = await alertConfirm(
      isApprove ? t("pages.hrProfileRequests.alert.confirmApproveTitle") : t("pages.hrProfileRequests.alert.confirmRejectTitle"),
      isApprove ? t("pages.hrProfileRequests.alert.confirmApproveText") : t("pages.hrProfileRequests.alert.confirmRejectText"),
      isApprove ? t("common.approve") : t("common.reject")
    );
    if (!ok) return;

    try {
      await axiosClient.put(`/auth/admin/profile-approval/${requestId}`, { action: actionType });
      await alertSuccess(t("common.success"), isApprove ? t("pages.hrProfileRequests.alert.approved") : t("pages.hrProfileRequests.alert.rejected"));
      setActive(null);
      fetchRequests();
    } catch (err) {
      alertError(t("common.error"), err.response?.data?.message || t("common.somethingWentWrong"));
    }
  };

  // 4. ระบบค้นหาและแบ่งหน้า
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return requests.filter((r) => {
      const name = `${r.employee?.firstName || ""} ${r.employee?.lastName || ""}`.toLowerCase();
      const oldN = `${r.currentFirstName || r.oldFirstName || ""} ${r.currentLastName || r.oldLastName || ""}`.toLowerCase();
      const newN = `${r.newFirstName || ""} ${r.newLastName || ""}`.toLowerCase();
      const reason = String(r.reason || "").toLowerCase();
      return name.includes(s) || oldN.includes(s) || newN.includes(s) || reason.includes(s);
    });
  }, [requests, q]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page-card hr-leave-approvals">
      {/* Header Section */}
      <header className="la-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="la-title">{t("pages.hrProfileRequests.profileUpdateRequests")}</h1>
          <p className="la-subtitle">{t("pages.hrProfileRequests.Review and approve employee name change requests")}</p>
        </div>
        <button className="btn outline" onClick={fetchRequests} disabled={isLoading}>
          {isLoading ? t("common.loading") : t("common.refreshList")}
        </button>
      </header>

      {/* Filter Input */}
      <div style={{ marginBottom: "20px" }}>
        <input
          className="audit-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder={t("common.placeholders.searchEmployeeNameOrProposed")}
          style={{ width: "320px", borderRadius: "12px" }}
        />
      </div>

      {/* Table Section */}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("pages.hrProfileRequests.Request ID")}</th>
              <th>{t("pages.hrProfileRequests.Employee")}</th>
              <th>{t("pages.hrProfileRequests.Current Name")}</th>
              <th>{t("pages.hrProfileRequests.Proposed Name")}</th>
              <th>{t("pages.hrProfileRequests.Request Date")}</th>
              <th>{t("pages.hrProfileRequests.Status")}</th>
              <th style={{ textAlign: "right" }}>{t("pages.hrProfileRequests.Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="7" className="empty">{t("common.loading")}</td></tr>
            ) : paged.length > 0 ? (
              paged.map((r) => (
                <tr key={r.requestId} className="hrla-row" onClick={() => setActive(r)}>
                  <td>#{r.requestId}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div className="p-name-badge" style={{ background: '#f1f5f9', color: '#64748b', padding: '8px', borderRadius: '8px', display: 'flex' }}><FiUser /></div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{r.employee?.firstName} {r.employee?.lastName}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>ID: {r.employeeId}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{r.oldFirstName || r.currentFirstName} {r.oldLastName || r.currentLastName}</td>
                  <td style={{ fontWeight: 700, color: '#16a34a' }}>{r.newFirstName} {r.newLastName}</td>
                  <td>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      <FiClock style={{ marginBottom: -2, marginRight: 4 }} />
                      {moment(r.requestedAt || r.createdAt).format("DD MMM YYYY")}
                    </div>
                  </td>
                  <td><span className="badge badge-pending">{t("pages.workerLeave.Pending")}</span></td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn small outline" onClick={() => setActive(r)}>{t("common.details")}</button>
                      <button className="btn small primary" style={{ background: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleAction(r.requestId, "approve")}><FiCheck /></button>
                      <button className="btn small outline danger" style={{ borderColor: '#ef4444', color: '#ef4444', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => handleAction(r.requestId, "reject")}><FiX /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7" className="empty">{t("common.noPendingRequests")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, width: "100%" }}>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>

      {/* ✅ FIXED MODAL OVERLAY (Class-based) */}
      {active && ReactDOM.createPortal(
        <div
          className="p-modal-overlay"
          onClick={() => setActive(null)}
        >
          <div
            className="p-modal-content"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="p-modal-header-icon"><FiUser size={20} /></div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{t("pages.hrProfileRequests.Request Details")}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{t("pages.hrProfileRequests.Compare details before approval")}</p>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="p-modal-close">
                <FiX />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-modal-body">
              <div className="p-info-grid">
                <div className="p-current-info">
                  <label className="p-label">
                    {t("pages.hrProfileRequests.Current Name (Old)")}
                  </label>
                  <div className="p-val-box">
                    {active.oldFirstName || active.currentFirstName} {active.oldLastName || active.currentLastName}
                  </div>
                </div>
                <div className="p-current-info">
                  <label className="p-label">
                    {t("pages.hrProfileRequests.Proposed Name (New)")}
                  </label>
                  <div className="p-val-box new">
                    {active.newFirstName} {active.newLastName}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <label className="p-label">
                  {t("pages.hrProfileRequests.Reason for change")}
                </label>
                <div className="p-reason-box">
                  {active.reason || t("common.noDataAvailable")}
                </div>
              </div>

              {active.attachmentUrl && (
                <div style={{ marginTop: '24px' }}>
                  <label className="p-label">
                    {t("pages.hrProfileRequests.Supporting Document")}
                  </label>
                  <a
                    href={`http://localhost:8000/uploads/profiles/${active.attachmentUrl}`}
                    target="_blank" rel="noreferrer"
                    className="p-attach-link"
                  >
                    <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '10px', color: '#475569' }}><FiExternalLink size={18} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{t("pages.hrProfileRequests.View Attachment")}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t("pages.hrProfileRequests.Official document (PDF/Image)")}</div>
                    </div>
                    <div style={{ color: '#3b82f6', fontWeight: 700, fontSize: '13px' }}>{t("pages.hrProfileRequests.Open")}</div>
                  </a>
                </div>
              )}

              {/* Modal Footer */}
              <div className="p-modal-footer">
                <button
                  className="btn outline"
                  onClick={() => handleAction(active.requestId, "reject")}
                >
                  {t("common.reject")}
                </button>
                <button
                  className="btn primary"
                  onClick={() => handleAction(active.requestId, "approve")}
                >
                  {t("common.approve")} & {t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}