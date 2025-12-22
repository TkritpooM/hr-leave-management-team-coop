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

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const user = useMemo(() => safeJSON(localStorage.getItem("user") || "{}", {}), []);
  const role = user.role === "HR" ? "HR" : "Worker";

  // ✅ Key ของ Notifications ตาม Role
  const notificationKey = role === "HR" ? "hr_unread_notifications" : "worker_unread_notifications";

  const fullName = `${user.firstName || user.first_name || "User"} ${user.lastName || user.last_name || ""}`.trim();
  const initials = (fullName || "U").charAt(0).toUpperCase();

  const sections = MENUS[role];
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
  }, [location.pathname]);

  const [unread, setUnread] = useState(() => {
    const n = Number(localStorage.getItem(notificationKey) || "0");
    return Number.isFinite(n) ? n : 0;
  });

  useEffect(() => {
    const onStorage = () => {
      const n = Number(localStorage.getItem(notificationKey) || "0");
      setUnread(Number.isFinite(n) ? n : 0);
    };
    window.addEventListener("storage", onStorage);
    const t = setInterval(onStorage, 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, [notificationKey]);

  const lastKey = role === "HR" ? "last_route_hr" : "last_route_worker";
  useEffect(() => {
    localStorage.setItem(lastKey, location.pathname);
  }, [location.pathname, lastKey]);

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
  const sidebarClass = `sb ${mobileOpen ? "sb-mobile-open" : ""}`;

  return (
    <>
      <button className="sb-mobile-toggle" type="button" onClick={mobileOpen ? closeMobile : openMobile}>
        {mobileOpen ? <FiX /> : <FiMenu />}
      </button>

      {mobileOpen && <div className="sb-overlay" onClick={closeMobile} />}

      <aside className={sidebarClass} aria-label="App Sidebar">
        <div className="sb-top">
          <div className="sb-profile">
            <div className="sb-avatar">{initials}</div>
            <div className="sb-profile-info">
              <div className="sb-name">{fullName}</div>
              <div className="sb-role">{role}</div>
            </div>

            <button
              className="sb-bell"
              type="button"
              title="Notifications"
              onClick={() => navigate(`/${role.toLowerCase()}/notifications`)}
            >
              <FiBell />
              {unread > 0 && <span className="sb-badge">{unread > 99 ? "99+" : unread}</span>}
            </button>
          </div>

          {canContinue && (
            <button className="sb-continue" type="button" onClick={() => navigate(lastRoute)}>
              กลับไปหน้าล่าสุด
            </button>
          )}
        </div>

        <nav className="sb-nav">
          {sections.map((sec) => (
            <div className="sb-section" key={sec.section}>
              <div className="sb-section-label">{sec.section}</div>

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
                      {badgeCount > 0 && (
                        <span className="sb-item-badge">{badgeCount > 99 ? "99+" : badgeCount}</span>
                      )}
                    </span>
                    <span className="sb-item-text">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

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
