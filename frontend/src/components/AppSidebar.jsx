import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import "./AppSidebar.css";

import {
  FiGrid,
  FiCalendar,
  FiClipboard,
  FiBell,
  FiUser,
  FiUsers,
  FiCheckSquare,
  FiLogOut,
  FiMenu,
  FiX,
  FiSettings,
} from "react-icons/fi";

const MENUS = {
  Worker: [
    {
      sectionKey: "sidebar.sections.main",
      items: [
        { to: "/worker/dashboard", labelKey: "sidebar.items.dashboard", icon: <FiGrid /> },
        { to: "/worker/attendance", labelKey: "sidebar.items.myAttendance", icon: <FiCalendar /> },
        { to: "/worker/calendar", labelKey: "sidebar.items.myCalendar", icon: <FiCalendar /> },
        { to: "/worker/leave", labelKey: "sidebar.items.myLeaves", icon: <FiClipboard /> },
        { to: "/worker/notifications", labelKey: "sidebar.items.notifications", icon: <FiBell />, badgeKey: "worker_unread_notifications" },
      ],
    },
    {
      sectionKey: "sidebar.sections.account",
      items: [{ to: "/worker/profile", labelKey: "sidebar.items.profile", icon: <FiUser /> }],
    },
  ],
  HR: [
    {
      sectionKey: "sidebar.sections.main",
      items: [
        { to: "/hr/dashboard", labelKey: "sidebar.items.dashboard", icon: <FiGrid /> },
        { to: "/hr/attendance", labelKey: "sidebar.items.employeeAttendance", icon: <FiCalendar /> },
        { to: "/hr/notifications", labelKey: "sidebar.items.notifications", icon: <FiBell />, badgeKey: "hr_unread_notifications" },
      ],
    },
    {
      sectionKey: "sidebar.sections.hrManagement",
      items: [
        { to: "/hr/profile-requests", labelKey: "sidebar.items.profileRequests", icon: <FiUser />, badgeKey: "profile_request_unread" },
        { to: "/hr/leave-approvals", labelKey: "sidebar.items.leaveApprovals", icon: <FiCheckSquare /> },
        { to: "/hr/employees", labelKey: "sidebar.items.employees", icon: <FiUsers /> },
        { to: "/hr/leave-settings", labelKey: "sidebar.items.leaveQuotaSettings", icon: <FiSettings /> },
        { to: "/hr/attendance-policy", labelKey: "sidebar.items.attendanceSettings", icon: <FiSettings /> },
      ],
    },
  ],
};

const safeJSON = (v, fallback = {}) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

export default function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useMemo(() => safeJSON(localStorage.getItem("user") || "{}", {}), []);
  const role = user.role === "HR" ? "HR" : "Worker";
  const sections = MENUS[role];

  const notificationKey = role === "HR" ? "hr_unread_notifications" : "worker_unread_notifications";

  const first = user.firstName || user.first_name || "";
  const last = user.lastName || user.last_name || "";
  const fullName = `${first || t("common.user")} ${last || ""}`.trim();
  const initials = (fullName || "U").charAt(0).toUpperCase();

  // Mobile drawer
  const [mobileOpen, setMobileOpen] = useState(false);

  // unread badge
  const [unread, setUnread] = useState(() => Number(localStorage.getItem(notificationKey) || "0") || 0);
  useEffect(() => {
    const tick = () => {
      const n = Number(localStorage.getItem(notificationKey) || "0");
      setUnread(Number.isFinite(n) ? n : 0);
    };
    const tmr = setInterval(tick, 700);
    window.addEventListener("storage", tick);
    return () => {
      clearInterval(tmr);
      window.removeEventListener("storage", tick);
    };
  }, [notificationKey]);

  // close mobile drawer on route change
  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // ✅ กันกรณี key บางตัวหาย: ถ้าไม่พบ key จะ fallback เป็นข้อความเดิมที่อ่านได้
  const tt = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  // =========================================================
  // 🌐 Language Dropdown (future-proof)
  // =========================================================
  const [langOpen, setLangOpen] = useState(false);

  // ✅ อนาคตเพิ่มภาษา 3/4 ภาษา เพิ่มใน array นี้ได้เลย
  const LANGS = [
    { code: "th", short: "TH", label: tt("common.thai", "ไทย") },
    { code: "en", short: "EN", label: tt("common.english", "English") },
    // { code: "jp", short: "JP", label: "日本語" },
    // { code: "zh", short: "ZH", label: "中文" },
  ];

  const activeLang = LANGS.find((x) => (i18n.language || "").startsWith(x.code)) || LANGS[0];

  useEffect(() => {
    const close = () => setLangOpen(false);
    if (langOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [langOpen]);

 const changeLang = async (code) => {
  try {
    // 1) เปลี่ยนภาษา i18next
    await i18n.changeLanguage(code);

    // 2) บังคับ persist ให้ detector ชัวร์ ๆ
    localStorage.setItem("i18nextLng", code);

    // 3) อัปเดต lang ของ html (ช่วยบาง lib/บางเคส)
    document.documentElement.lang = code;

    setLangOpen(false);
  } catch (e) {
    console.error("changeLang error:", e);
    setLangOpen(false);
  }
};


  return (
    <>
      <button
        className="sb-mobile-toggle"
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={t("sidebar.toggleSidebar")}
        title={t("sidebar.toggleSidebar")}
      >
        {mobileOpen ? <FiX /> : <FiMenu />}
      </button>

      {mobileOpen && <div className="sb-overlay" onClick={() => setMobileOpen(false)} />}

      <aside className={`sb ${mobileOpen ? "sb-mobile-open" : ""}`} aria-label={tt("sidebar.title", "Sidebar")}>
        <div className="sb-top">
          <div className="sb-profile">
            <div className="sb-avatar">{initials}</div>

            <div className="sb-profile-info">
              <div className="sb-name">{fullName}</div>

              <div className="sb-role">
                {role === "HR" ? tt("common.role.HR", "HR") : tt("common.role.Worker", "Worker")}
              </div>
            </div>

            <button
              className="sb-bell"
              type="button"
              title={t("common.notifications")}
              onClick={() => navigate(`/${role.toLowerCase()}/notifications`)}
            >
              <FiBell />
              {unread > 0 && <span className="sb-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
          </div>

          {/* 🌐 Language Dropdown */}
          <div className="sb-lang" onClick={(e) => e.stopPropagation()}>
            <span className="sb-lang-label">{t("common.language")}</span>

            <div className={`sb-lang-dd ${langOpen ? "open" : ""}`}>
              <button
                type="button"
                className="sb-lang-trigger"
                onClick={() => setLangOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={langOpen}
                title={`${t("common.language")}: ${activeLang.label}`}
              >
                <span className="sb-lang-globe" aria-hidden="true">🌐</span>
                <span className="sb-lang-current">{activeLang.short}</span>
                <span className="sb-lang-caret" aria-hidden="true">▾</span>
              </button>

              {langOpen && (
                <div className="sb-lang-menu" role="menu">
                  {LANGS.map((x) => (
                    <button
                      key={x.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={activeLang.code === x.code}
                      className={`sb-lang-item ${activeLang.code === x.code ? "active" : ""}`}
                      onClick={() => changeLang(x.code)}
                    >
                      <span className="sb-lang-item-left">
                        <span className="sb-lang-item-short">{x.short}</span>
                        <span className="sb-lang-item-label">{x.label}</span>
                      </span>
                      {activeLang.code === x.code && <span className="sb-lang-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="sb-nav">
          {sections.map((sec) => (
            <div className="sb-section" key={sec.sectionKey}>
              <div className="sb-section-label">{t(sec.sectionKey)}</div>

              {sec.items.map((item) => {
                const showBadge = item.badgeKey === notificationKey;
                const badgeCount = showBadge ? unread : 0;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`}
                  >
                    <span className="sb-item-ico">
                      {item.icon}
                      {badgeCount > 0 && <span className="sb-item-badge">{badgeCount > 99 ? "99+" : badgeCount}</span>}
                    </span>

                    <span className="sb-item-text">{t(item.labelKey)}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sb-bottom">
          <button className="sb-logout" onClick={logout} type="button">
            <FiLogOut className="sb-logout-ico" />
            <span className="sb-logout-text">{t("common.logout")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
