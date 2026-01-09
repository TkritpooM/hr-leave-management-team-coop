import React, { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import Pagination from "../components/Pagination";
import { alertConfirm, alertError, alertSuccess } from "../utils/sweetAlert";
import axiosClient from "../api/axiosClient";
import { FiUser, FiCheck, FiX, FiInfo, FiExternalLink, FiClock } from "react-icons/fi";
import moment from "moment";
import "moment/locale/th";
import "./HRLeaveApprovals.css";
import { useTranslation } from "react-i18next";

export default function HRProfileRequests() {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const mLocale = useMemo(() => {
    const lng = (i18n.resolvedLanguage || i18n.language || "en")
      .toLowerCase()
      .trim();
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

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      // ✅ Backend: GET /api/auth/admin/profile-requests
      const res = await axiosClient.get("/auth/admin/profile-requests");
      setRequests(res.data?.requests || res.data || []);
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        t("pages.hrProfileRequests.alert.loadFailed", "Failed to load profile requests.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // รองรับเข้ามาจาก HRNotifications (ถ้าส่ง state มาด้วย)
  useEffect(() => {
    const state = location.state;
    const targetId = Number(state?.requestId);
    if (!targetId) return;

    const target = requests.find((r) => Number(r.requestId) === targetId);
    if (target) {
      setActive(target);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, requests]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return requests;
    return requests.filter((r) => {
      const emp = `${r.employee?.firstName || ""} ${r.employee?.lastName || ""}`.toLowerCase();
      const oldN = `${r.currentFirstName || ""} ${r.currentLastName || ""}`.toLowerCase();
      const newN = `${r.newFirstName || ""} ${r.newLastName || ""}`.toLowerCase();
      const reason = String(r.reason || "").toLowerCase();
      return emp.includes(qq) || oldN.includes(qq) || newN.includes(qq) || reason.includes(qq);
    });
  }, [requests, q]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const formatDateTime = (d) => {
    if (!d) return "-";
    return moment(d).locale(mLocale).format("DD MMM YYYY, HH:mm");
  };

  const statusKey = (s) => String(s || "").toLowerCase();

  const handleAction = async (requestId, action) => {
    const isApprove = action === "approve";

    const ok = await alertConfirm(
      isApprove
        ? t("pages.hrProfileRequests.alert.confirmApproveTitle", "Approve request?")
        : t("pages.hrProfileRequests.alert.confirmRejectTitle", "Reject request?"),
      isApprove
        ? t("pages.hrProfileRequests.alert.confirmApproveText", "This will update employee profile with the new name.")
        : t("pages.hrProfileRequests.alert.confirmRejectText", "This will reject the request."),
      t("common.confirm", "Confirm")
    );
    if (!ok) return;

    try {
      // ✅ Backend: PUT /api/auth/admin/profile-approval/:requestId
      const res = await axiosClient.put(`/auth/admin/profile-approval/${requestId}`, { action });
      if (res.data?.success) {
        await alertSuccess(
          t("common.success", "Success"),
          isApprove
            ? t("pages.hrProfileRequests.alert.approved", "Request approved and profile updated.")
            : t("pages.hrProfileRequests.alert.rejected", "Request rejected.")
        );
        setActive(null);
        fetchRequests();
      } else {
        alertError(
          t("common.error", "Error"),
          res.data?.message || t("common.somethingWentWrong", "Something went wrong.")
        );
      }
    } catch (err) {
      alertError(
        t("common.error", "Error"),
        err.response?.data?.message || t("common.somethingWentWrong", "Something went wrong.")
      );
    }
  };

  return (
    <div className="page-card">
      <div className="la-header">
        <div>
          <h1 className="la-title">
            {t("pages.hrProfileRequests.title", "Profile Update Requests")}
          </h1>
          <p className="la-subtitle">
            {t(
              "pages.hrProfileRequests.subtitle",
              "Review and approve employee name change requests"
            )}
          </p>
        </div>

        <button className="btn outline" onClick={fetchRequests} disabled={isLoading}>
          {isLoading
            ? t("common.loading", "Loading...")
            : t("common.refreshList", "Refresh List")}
        </button>
      </div>

      <div style={{ margin: "16px 0" }}>
        <input
          className="audit-input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t(
            "pages.hrProfileRequests.searchPlaceholder",
            "Search employee / proposed name / reason..."
          )}
        />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t("pages.hrProfileRequests.table.requestId", "Request ID")}</th>
              <th>{t("pages.hrProfileRequests.table.employee", "Employee")}</th>
              <th>{t("pages.hrProfileRequests.table.currentName", "Current Name")}</th>
              <th>{t("pages.hrProfileRequests.table.proposedName", "Proposed Name")}</th>
              <th>{t("pages.hrProfileRequests.table.requestDate", "Request Date")}</th>
              <th>{t("pages.hrProfileRequests.table.status", "Status")}</th>
              <th style={{ textAlign: "center" }}>
                {t("pages.hrProfileRequests.table.actions", "Actions")}
              </th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="7" className="empty">
                  {t("common.loading", "Loading...")}
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty">
                  {t("common.noPendingRequests", "No pending requests")}
                </td>
              </tr>
            ) : (
              paged.map((r) => (
                <tr key={r.requestId}>
                  <td>{r.requestId}</td>

                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div className="p-name-badge">
                        <FiUser />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {r.employee?.firstName || t("common.unknown", "Unknown")}{" "}
                          {r.employee?.lastName || ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          {r.employee?.email || "-"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    {r.currentFirstName} {r.currentLastName}
                  </td>

                  <td style={{ fontWeight: 800 }}>
                    {r.newFirstName} {r.newLastName}
                  </td>

                  <td style={{ color: "#64748b" }}>
                    <FiClock style={{ marginRight: 6 }} />
                    {formatDateTime(r.createdAt)}
                  </td>

                  <td>
                    <span className={`badge badge-${statusKey(r.status)}`}>
                      {t(
                        `common.requestStatus.${statusKey(r.status)}`,
                        String(r.status || "-")
                      )}
                    </span>
                  </td>

                  <td style={{ textAlign: "center" }}>
                    <button
                      className="btn outline small"
                      onClick={() => setActive(r)}
                    >
                      <FiInfo />
                      <span style={{ marginLeft: 6 }}>
                        {t("common.details", "Details")}
                      </span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Pagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {active && (
        <div className="p-modal-backdrop" onClick={() => setActive(null)}>
          <div className="p-modal" onClick={(e) => e.stopPropagation()}>
            <div className="p-modal-head">
              <div>
                <div className="p-modal-title">
                  {t("pages.hrProfileRequests.modal.title", "Request Details")}
                </div>
                <div className="p-modal-sub">
                  {t("pages.hrProfileRequests.modal.subtitle", "Compare details before approval")}
                </div>
              </div>

              <button className="p-x" onClick={() => setActive(null)} aria-label={t("common.close", "Close")}>
                <FiX />
              </button>
            </div>

            <div className="p-modal-body">
              <div className="p-grid">
                <div className="p-card">
                  <div className="p-card-title">
                    {t("pages.hrProfileRequests.modal.currentNameOld", "Current Name (Old)")}
                  </div>
                  <div className="p-card-value">
                    {active.currentFirstName} {active.currentLastName}
                  </div>
                </div>

                <div className="p-card">
                  <div className="p-card-title">
                    {t("pages.hrProfileRequests.modal.proposedNameNew", "Proposed Name (New)")}
                  </div>
                  <div className="p-card-value highlight">
                    {active.newFirstName} {active.newLastName}
                  </div>
                </div>

                <div className="p-card full">
                  <div className="p-card-title">
                    {t("pages.hrProfileRequests.modal.reason", "Reason for change")}
                  </div>
                  <div className="p-card-value">
                    {active.reason || t("common.noData", "—")}
                  </div>
                </div>

                <div className="p-card full">
                  <div className="p-card-title">
                    {t("pages.hrProfileRequests.modal.supportingDocument", "Supporting Document")}
                  </div>

                  {active.attachmentUrl ? (
                    <a
                      href={active.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-attach"
                    >
                      <FiExternalLink />
                      <span style={{ marginLeft: 6 }}>
                        {t("pages.hrProfileRequests.modal.viewAttachment", "View Attachment")}
                      </span>
                    </a>
                  ) : (
                    <div className="p-card-value">
                      {t("common.noAttachment", "No attachment")}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-modal-footer" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="p-btn-cancel"
                  onClick={() => handleAction(active.requestId, "reject")}
                >
                  {t("pages.hrProfileRequests.actions.reject", "Reject Request")}
                </button>

                <button
                  type="button"
                  className="p-btn-submit"
                  onClick={() => handleAction(active.requestId, "approve")}
                >
                  {t("pages.hrProfileRequests.actions.approveUpdate", "Approve & Update Profile")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
