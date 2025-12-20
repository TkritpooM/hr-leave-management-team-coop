import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./AppSidebar.css";

// icons (mock)
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

/* ===============================
   Menu config (MATCH App.jsx)
================================ */
const MENUS = {
  Worker: [
    {
      section: "MAIN MENU",
      items: [
        { to: "/worker/dashboard", label: "แดชบอร์ด", icon: <FiGrid /> },
        { to: "/worker/calendar", label: "ปฏิทินของฉัน", icon: <FiCalendar /> },
        { to: "/worker/leave", label: "ประวัติการลา", icon: <FiClipboard /> },
        { to: "/worker/notifications", label: "แจ้งเตือน", icon: <FiBell />, badgeKey: "worker_unread_notifications" },
      ],
    },
    {
      section: "ACCOUNT",
      items: [{ to: "/worker/profile", label: "โปรไฟล์", icon: <FiUser /> }],
    },
  ],

  HR: [
    {
      section: "MAIN MENU",
      items: [
        { to: "/hr/dashboard", label: "แดชบอร์ด", icon: <FiGrid /> },
        { to: "/hr/attendance", label: "การลงเวลาพนักงาน", icon: <FiCalendar /> },
        { to: "/hr/notifications", label: "แจ้งเตือน", icon: <FiBell />, badgeKey: "hr_unread_notifications" },
      ],
    },
    {
      section: "HR MANAGEMENT",
      items: [
        { to: "/hr/leave-approvals", label: "อนุมัติการลา", icon: <FiCheckSquare /> },
        { to: "/hr/employees", label: "รายชื่อพนักงาน", icon: <FiUsers /> },
        { to: "/hr/leave-settings", label: "ตั้งค่าโควต้าการลา", icon: <FiSettings /> },
      ],
    },
  ],
};

// helpers
const safeJSON = (v, fallback = {}) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

const isMobile = () => window.matchMedia?.("(max-width: 980px)")?.matches ?? false;

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ auth user from localStorage (same pattern as you used)
  const user = useMemo(() => safeJSON(localStorage.getItem("user") || "{}", {}), []);

  const role = user.role === "HR" ? "HR" : "Worker";
  const fullName =
    `${user.firstName || user.first_name || "User"} ${user.lastName || user.last_name || ""}`.trim();
  const initials = (fullName || "U").charAt(0).toUpperCase();

  const sections = MENUS[role];

  // ===== Optional #1: Mobile toggle =====
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // close sidebar when route changes (mobile)
    if (mobileOpen) setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ===== Optional #2: Notification badge (mock from localStorage) =====
  const [unread, setUnread] = useState(() => {
    const key = "worker_unread_notifications";
    const n = Number(localStorage.getItem(key) || "0");
    return Number.isFinite(n) ? n : 0;
  });

  useEffect(() => {
    const onStorage = () => {
      const n = Number(localStorage.getItem("worker_unread_notifications") || "0");
      setUnread(Number.isFinite(n) ? n : 0);
    };
    window.addEventListener("storage", onStorage);

    // (optional) polling กันกรณีอัปเดตใน tab เดียวกัน
    const t = setInterval(onStorage, 1200);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);

  // ===== Optional #3: Remember last menu =====
  // เก็บ last route แยกตาม role
  const lastKey = role === "HR" ? "last_route_hr" : "last_route_worker";

  useEffect(() => {
    // ทุกครั้งที่เข้าหน้าใหม่ ให้จำ route ล่าสุด
    localStorage.setItem(lastKey, location.pathname);
  }, [location.pathname, lastKey]);

  // (optional) Quick continue button ถ้าอยากให้มี:
  const lastRoute = localStorage.getItem(lastKey) || "";
  const canContinue =
    lastRoute &&
    lastRoute !== location.pathname &&
    lastRoute.startsWith(role === "HR" ? "/hr/" : "/worker/");

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const openMobile = () => setMobileOpen(true);
  const closeMobile = () => setMobileOpen(false);

  // class for sidebar wrapper
  const sidebarClass = `sb ${mobileOpen ? "sb-mobile-open" : ""}`;

  return (
    <>
      {/* ===== Optional: mobile toggle button (top-left floating) ===== */}
      <button className="sb-mobile-toggle" type="button" onClick={mobileOpen ? closeMobile : openMobile}>
        {mobileOpen ? <FiX /> : <FiMenu />}
      </button>

      {/* overlay for mobile */}
      {mobileOpen && <div className="sb-overlay" onClick={closeMobile} />}

      <aside className={sidebarClass} aria-label="App Sidebar">
        {/* ===== Profile ===== */}
        <div className="sb-top">
          <div className="sb-profile">
            <div className="sb-avatar">{initials}</div>

            <div className="sb-profile-info">
              <div className="sb-name">{fullName}</div>
              <div className="sb-role">{role}</div>
            </div>

            {/* Bell with badge (mock) */}
            <button 
              className="sb-bell" 
              type="button" 
              title="Notifications" 
              // navigate ไปตาม role เช่น /worker/notifications หรือ /hr/notifications
              onClick={() => navigate(`/${role.toLowerCase()}/notifications`)}
            >
              <FiBell />
              {/* แสดง badge เมื่อ unread > 0 */}
              {unread > 0 && <span className="sb-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
          </div>

          {/* Optional: Continue last page */}
          {canContinue && (
            <button className="sb-continue" type="button" onClick={() => navigate(lastRoute)}>
              กลับไปหน้าล่าสุด
            </button>
          )}
        </div>

        {/* ===== Navigation ===== */}
        <nav className="sb-nav">
          {sections.map((sec) => (
            <div className="sb-section" key={sec.section}>
              <div className="sb-section-label">{sec.section}</div>

              {sec.items.map((item) => {
                const badge =
                  role === "Worker" && item.badgeKey
                    ? unread
                    : 0;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `sb-item ${isActive ? "active" : ""}`}
                  >
                    <span className="sb-item-ico">
                      {item.icon}
                      {badge > 0 && <span className="sb-item-badge">{badge > 99 ? "99+" : badge}</span>}
                    </span>
                    <span className="sb-item-text">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ===== Logout ===== */}
        <div className="sb-bottom">
          <button className="sb-logout" onClick={logout} type="button">
            <FiLogOut className="sb-logout-ico" />
            <span className="sb-logout-text">ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
}
