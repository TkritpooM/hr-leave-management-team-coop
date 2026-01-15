// frontend/src/pages/WorkerProfile.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import moment from "moment";
import {
  FiUser, FiMail, FiCalendar, FiShield,
  FiBriefcase, FiRefreshCw, FiEdit2, FiCheck, FiX, FiLock, FiUpload, FiLayers
} from "react-icons/fi";
import "./WorkerProfile.css";
import { alertConfirm, alertError, alertSuccess, alertInfo } from "../utils/sweetAlert";
import { useTranslation } from "react-i18next";

export default function WorkerProfile() {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState(() => {
    const savedUser = localStorage.getItem("user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(!profile);

  // State สำหรับโหมดแก้ไขเดิม (รหัสผ่าน)
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    currentPassword: "",
    newPassword: ""
  });

  // ✅ New States สำหรับการยื่นคำร้องเปลี่ยนชื่อ
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestData, setRequestData] = useState({
    newFirstName: "",
    newLastName: "",
    reason: "",
    attachment: null
  });

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:8000/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.success) {
        setProfile(res.data.user);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setFormData(prev => ({
          ...prev,
          firstName: res.data.user.firstName,
          lastName: res.data.user.lastName,
          currentPassword: "",
          newPassword: ""
        }));
        // Reset request data
        setRequestData(prev => ({
          ...prev,
          newFirstName: res.data.user.firstName,
          newLastName: res.data.user.lastName
        }));
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // ฟังก์ชันอัปเดตเดิม (รหัสผ่าน)
  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put("http://localhost:8000/api/auth/update-profile", formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.data.success) {
        await alertSuccess(
          t("common.success"),
          t("pages.workerProfile.alert.profileUpdated")
        );
        setIsEditing(false);
        await fetchProfile();
      }
    } catch (err) {
      await alertError(
        t("common.error"),
        (err.response?.data?.message || t("pages.workerProfile.alert.updateFailed"))
      );
    }
  };

  // ✅ ฟังก์ชันใหม่: จัดการส่งคำร้องขอเปลี่ยนชื่อ
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!requestData.newFirstName || !requestData.newLastName) {
      return alertError(
        t("pages.workerProfile.alert.validationTitle"),
        t("pages.workerProfile.alert.validationNameRequired")
      );
    }

    const ok = await alertConfirm(
      t("pages.workerProfile.alert.confirmTitle"),
      t("pages.workerProfile.alert.confirmSubmit")
    );
    if (!ok) return;

    try {
      setIsSubmittingRequest(true);
      const token = localStorage.getItem("token");

      const sendData = new FormData();
      sendData.append("newFirstName", requestData.newFirstName);
      sendData.append("newLastName", requestData.newLastName);
      sendData.append("reason", requestData.reason);
      if (requestData.attachment) sendData.append("attachment", requestData.attachment);

      const res = await axios.post("http://localhost:8000/api/auth/request-profile-update", sendData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        },
      });

      if (res.data.success) {
        await alertSuccess(
          t("pages.workerProfile.alert.requestSentTitle"),
          t("pages.workerProfile.alert.requestSentDesc")
        );
        setIsRequestModalOpen(false);
        fetchProfile(); // เพื่อโหลดสถานะ Pending (ถ้ามี)
      }
    } catch (err) {
      const msg = err.response?.data?.message || t("pages.workerProfile.alert.submitFailed");
      if (msg === "You already have pending request.") {
        await alertError(
          t("common.error"),
          t("pages.workerProfile.alert.duplicateRequest")
        );
      } else {
        await alertError(t("common.error"), msg);
      }
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  if (loading) return <div className="p-loader">{t("common.loadingProfile")}</div>;
  if (!profile) return <div className="p-error">{t("pages.workerProfile.userNotFound")}</div>;

  const initials = (profile.firstName?.charAt(0) || "U") + (profile.lastName?.charAt(0) || "");
  const hasPendingRequest = profile?.profileUpdateRequests?.some(r => r.status === 'Pending');

  return (
    <div className="profile-page-container">
      <header className="profile-page-header">
        <h1 className="profile-page-title">{t("pages.workerProfile.myProfile")}</h1>
      </header>

      <div className="profile-main-content">
        <aside className="profile-identity-card">
          <div className="avatar-section">
            <div className="avatar-circle">
              {profile.profileImageUrl ? (
                <img src={profile.profileImageUrl} alt={t("pages.workerProfile.profile")} />
              ) : (initials.toUpperCase())}
            </div>
            <h2 className="display-name">{profile.firstName} {profile.lastName}</h2>
            <span className="badge-role">{profile.role || t("pages.workerProfile.role.worker")}</span>

            {/* ✅ แสดงสถานะ Pending */}
            {hasPendingRequest ? (
              <div className="status-pill pending">
                <FiRefreshCw className="spin" />{t("pages.workerProfile.pendingApproval")}
              </div>
            ) : (
              <div className={`status-pill ${profile.isActive ? 'active' : 'inactive'}`}>
                <span className="dot"></span>
                {profile.isActive ? t("pages.workerProfile.status.activeEmployee") : t("pages.workerProfile.status.inactive")}
              </div>
            )}

            {/* ✅ ปุ่มยื่นคำร้องใหม่ */}
            <button
              className="btn outline full-width"
              style={{ marginTop: '20px', gap: '8px' }}
              onClick={() => setIsRequestModalOpen(true)}
              disabled={hasPendingRequest}
            >
              <FiEdit2 />{t("pages.workerProfile.requestNameChange")}
            </button>
          </div>
        </aside>

        <form className="profile-details-grid" onSubmit={handleUpdate}>
          <section className="info-section">
            <h3 className="section-header">
              <FiUser />{t("pages.workerProfile.personalInformation")}
            </h3>
            <div className="info-field-list">
              <div className="info-box">
                <label>{t("pages.workerProfile.firstName")}</label>
                <p>{profile.firstName}</p>
              </div>
              <div className="info-box">
                <label>{t("pages.workerProfile.lastName")}</label>
                <p>{profile.lastName}</p>
              </div>
              <div className="info-box">
                <label><FiMail />{t("pages.workerProfile.contactEmail")}</label>
                <p>{profile.email}</p>
              </div>
            </div>
          </section>

          {!isEditing ? (
            <section className="info-section">
              <h3 className="section-header">
                <FiBriefcase />{t("pages.workerProfile.employmentInformation")}
              </h3>
              <div className="info-field-list">
                <div className="info-box">
                  <label>{t("pages.workerProfile.employeeId")}</label>
                  <p>#{profile.employeeId}</p>
                </div>
                <div className="info-box">
                  <label><FiCalendar />{t("pages.workerProfile.startDate")}</label>
                  <p>{profile.joiningDate ? moment(profile.joiningDate).format("DD MMM YYYY") : "-"}</p>
                </div>
                <div className="info-box">
                  <label><FiLayers />{t("pages.workerProfile.department", "Department")}</label>
                  <p>{profile.department?.deptName || t("common.none", "None")}</p>
                </div>
                <div className={`info-box highlight ${profile.isActive ? 'ok' : 'danger'}`}>
                  <label><FiShield />{t("pages.workerProfile.employmentStatus")}</label>
                  <p>{profile.isActive ? t("pages.workerProfile.status.active") : t("pages.workerProfile.status.inactive")}</p>
                </div>
              </div>
            </section>
          ) : (
            <section className="info-section edit-password-section">
              <div className="section-header-row">
                <h3 className="section-header">
                  <FiLock />{t("pages.workerProfile.changePassword")}
                </h3>
                <button type="button" className="btn-close-edit" onClick={() => setIsEditing(false)}>
                  <FiX />
                </button>
              </div>
              <div className="info-field-list">
                <div className="info-box">
                  <label>{t("pages.workerProfile.currentPassword")}</label>
                  <input
                    type="password"
                    className="edit-input"
                    placeholder={t("auth.placeholders.currentPassword")}
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="info-box">
                  <label>{t("pages.workerProfile.newPassword")}</label>
                  <input
                    type="password"
                    className="edit-input"
                    placeholder={t("auth.placeholders.newPassword")}
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="btn primary full-width">
                  {t("pages.workerProfile.updatePassword")}
                </button>
              </div>
            </section>
          )}
        </form>
      </div>

      {/* ✅ MODAL: Request Profile Update */}
      {isRequestModalOpen && (
        <div className="p-modal-overlay" onClick={() => setIsRequestModalOpen(false)}>
          <div className="p-modal-content" onClick={e => e.stopPropagation()}>
            <div className="p-modal-header">
              <div className="p-header-icon"><FiEdit2 /></div>
              <div className="p-header-text">
                <h3>{t("pages.workerProfile.requestNameChange")}</h3>
                <p>{t("pages.workerProfile.nameChangeHint")}</p>
              </div>
              <button className="p-modal-close" onClick={() => setIsRequestModalOpen(false)}>
                <FiX />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="p-modal-form">
              <div className="p-current-info">
                <label>{t("pages.workerProfile.currentName")}</label>
                <div className="p-name-badge">{profile.firstName} {profile.lastName}</div>
              </div>

              <div className="p-form-row">
                <div className="p-input-group">
                  <label>{t("pages.workerProfile.newFirstName")}</label>
                  <input
                    type="text"
                    value={requestData.newFirstName}
                    onChange={e => setRequestData({ ...requestData, newFirstName: e.target.value })}
                    placeholder={t("pages.workerProfile.firstName")}
                  />
                </div>
                <div className="p-input-group">
                  <label>{t("pages.workerProfile.newLastName")}</label>
                  <input
                    type="text"
                    value={requestData.newLastName}
                    onChange={e => setRequestData({ ...requestData, newLastName: e.target.value })}
                    placeholder={t("pages.workerProfile.lastName")}
                  />
                </div>
              </div>

              <div className="p-input-group">
                <label>{t("pages.workerProfile.reason")}</label>
                <textarea
                  rows="2"
                  value={requestData.reason}
                  onChange={e => setRequestData({ ...requestData, reason: e.target.value })}
                  placeholder={t("pages.workerProfile.examples.nameChange")}
                ></textarea>
              </div>

              <div className="p-upload-zone">
                <input
                  type="file"
                  id="p-file"
                  hidden
                  onChange={e => setRequestData({ ...requestData, attachment: e.target.files[0] })}
                />
                <label htmlFor="p-file">
                  <FiUpload />
                  <span>
                    {requestData.attachment
                      ? requestData.attachment.name
                      : t("pages.workerProfile.uploadSupportingDocument")}
                  </span>
                </label>
              </div>

              <div className="p-modal-footer">
                <button
                  type="button"
                  className="p-btn-cancel"
                  onClick={() => setIsRequestModalOpen(false)}
                >
                  {t("common.cancel")}
                </button>

                <button type="submit" className="p-btn-submit" disabled={isSubmittingRequest}>
                  {isSubmittingRequest
                    ? t("pages.workerProfile.alert.sending")
                    : t("pages.workerProfile.submitRequest")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
