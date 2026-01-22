import React, { useEffect, useMemo, useState, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import "./AppSidebar.css";
import axiosClient from "../api/axiosClient";

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
  Admin: [
    {
      sectionKey: "sidebar.sections.main",
      items: [
        { to: "/hr/dashboard", labelKey: "sidebar.items.dashboard", icon: <FiGrid /> },
        // Admin can access HR stuff too, or we can separate. Assuming Admin ~ Super HR.
        { to: "/hr/attendance", labelKey: "sidebar.items.employeeAttendance", icon: <FiCalendar /> },
      ],
    },
    {
      sectionKey: "sidebar.sections.hrManagement",
      items: [
        { to: "/hr/employees", labelKey: "sidebar.items.employees", icon: <FiUsers /> },
        { to: "/admin/roles", labelKey: "sidebar.items.rolesManagement", icon: <FiSettings /> }, // NEW
        { to: "/hr/leave-settings", labelKey: "sidebar.items.leaveQuotaSettings", icon: <FiSettings /> },
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

const safeTs = (ts) => {
  if (!ts) return 0;
  const d = new Date(ts);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export default function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useMemo(() => safeJSON(localStorage.getItem("user") || "{}", {}), []);
  const role = user.role === "HR" ? "HR" : (user.role === "Admin" ? "Admin" : "Worker");
  const sections = MENUS[role];

  // key ที่ sidebar ใช้แสดงเลข
  const notificationKey = role === "HR" ? "hr_unread_notifications" : "worker_unread_notifications";

  // ✅ key last seen ให้ตรงกับหน้า Notifications ที่คุณใช้จริง
  const lastSeenKey = role === "HR"
    ? "hr_unread_notifications_last_seen"     // จาก HRNotifications.jsx
    : "worker_notifications_last_seen";       // จาก WorkerNotifications.jsx

  const first = user.firstName || user.first_name || "";
  const last = user.lastName || user.last_name || "";
  const fullName = `${first || t("common.user")} ${last || ""}`.trim();
  const initials = (fullName || "U").charAt(0).toUpperCase();

  // Mobile drawer
  const [mobileOpen, setMobileOpen] = useState(false);

  // unread badge (ค่าใน state)
  const [unread, setUnread] = useState(() => Number(localStorage.getItem(notificationKey) || "0") || 0);

  // ✅ helper: เซ็ต unread=0 + อัปเดต lastSeen เพื่อให้ refresh แล้วไม่กลับมา
  const markAllSeenLocally = useCallback(() => {
    try {
      localStorage.setItem(notificationKey, "0");
      localStorage.setItem(lastSeenKey, String(Date.now()));
    } catch (_) { }
    setUnread(0);

    // ยิง event เผื่อที่อื่นฟังอยู่
    try {
      window.dispatchEvent(new Event(`${notificationKey}_updated`));
    } catch (_) { }
  }, [notificationKey, lastSeenKey]);

  // ✅ คำนวณ unread จาก server + lastSeen (แก้อาการ refresh แล้วเลขกลับมา)
  const syncUnreadFromServer = useCallback(async () => {
    try {
      const lastSeen = Number(localStorage.getItem(lastSeenKey) || "0") || 0;

      // ดึง noti ของตัวเอง
      const res = await axiosClient.get("/notifications/my");
      const fetched = res.data?.notifications || res.data || [];

      const unreadCount = fetched.reduce((acc, n) => {
        const ts = n.createdAt || n.timestamp;
        return safeTs(ts) > lastSeen ? acc + 1 : acc;
      }, 0);

      const finalCount = Number.isFinite(unreadCount) ? unreadCount : 0;

      localStorage.setItem(notificationKey, String(finalCount));
      setUnread(finalCount);
    } catch (e) {
      // ถ้าดึงไม่ได้ ก็ fallback ใช้ค่าเดิมใน localStorage
      const n = Number(localStorage.getItem(notificationKey) || "0");
      setUnread(Number.isFinite(n) ? n : 0);
    }
  }, [lastSeenKey, notificationKey]);

  // ✅ ตอนเริ่มแอป/refresh: ซิงก์ unread ให้ถูกต้องจาก server ทันที
  useEffect(() => {
    syncUnreadFromServer();
  }, [syncUnreadFromServer]);

  // ✅ ถ้าอยู่หน้า notifications ให้ถือว่าอ่านแล้วเสมอ (กันเคส refresh หน้า noti)
  useEffect(() => {
    const onNotiPage =
      location.pathname === "/hr/notifications" ||
      location.pathname === "/worker/notifications";

    if (onNotiPage) {
      markAllSeenLocally();
    }
  }, [location.pathname, markAllSeenLocally]);

  // ✅ ฟัง storage + custom events (กรณีมีที่อื่น set ค่า)
  useEffect(() => {
    const tick = () => {
      const n = Number(localStorage.getItem(notificationKey) || "0");
      setUnread(Number.isFinite(n) ? n : 0);
    };

    const onCustom = () => tick();

    window.addEventListener("storage", tick);
    window.addEventListener(`${notificationKey}_updated`, onCustom);

    // sync เป็นระยะเบา ๆ กันเคสมี noti มาแต่ lastSeen ยังไม่อัปเดต
    const tmr = setInterval(() => {
      // ถ้าอยู่หน้า noti ไม่ต้อง sync ให้มันกระพริบกลับมา
      const onNotiPage =
        location.pathname === "/hr/notifications" ||
        location.pathname === "/worker/notifications";
      if (!onNotiPage) syncUnreadFromServer();
    }, 20000);

    return () => {
      clearInterval(tmr);
      window.removeEventListener("storage", tick);
      window.removeEventListener(`${notificationKey}_updated`, onCustom);
    };
  }, [notificationKey, location.pathname, syncUnreadFromServer]);

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

  const LANGS = [
    { code: "en", short: "EN", label: tt("common.english", "English") },
    { code: "jp", short: "JP", label: tt("common.japanese", "Japanese") },
  ];

  const activeLang = LANGS.find((x) => (i18n.language || "").startsWith(x.code)) || LANGS[0];

  useEffect(() => {
    const close = () => setLangOpen(false);
    if (langOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [langOpen]);

  const changeLang = async (code) => {
    try {
      await i18n.changeLanguage(code);
      localStorage.setItem("i18nextLng", code);
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
                {role === "HR" ? tt("common.role.HR", "HR") : (role === "Admin" ? "Admin" : tt("common.role.Worker", "Worker"))}
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
