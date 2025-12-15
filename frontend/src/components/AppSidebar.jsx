import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MENU = [
  // Worker
  { label: "Worker Dashboard", to: "/worker/dashboard", roles: ["Worker"] },
  { label: "My Attendance", to: "/worker/attendance", roles: ["Worker"] },
  { label: "My Leave", to: "/worker/leave", roles: ["Worker"] },
  { label: "Calendar View", to: "/worker/calendar", roles: ["Worker"] },
  { label: "Leave Balance", to: "/worker/balance", roles: ["Worker"] },
  { label: "Notifications", to: "/worker/notifications", roles: ["Worker"] },
  { label: "Profile", to: "/worker/profile", roles: ["Worker"] },

  // HR
  { label: "HR Dashboard", to: "/hr/dashboard", roles: ["HR"] },
  { label: "HR Calendar", to: "/hr/calendar", roles: ["HR"] },
  { label: "Leave Approvals", to: "/hr/leave-approvals", roles: ["HR"] },
  { label: "Employees", to: "/hr/employees", roles: ["HR"] },

  // Shared
  { label: "Logout", to: "/login", roles: ["Worker", "HR"] },
];

export default function AppSidebar() {
  const { user, setRole } = useAuth();
  const visibleMenu = MENU.filter((m) => m.roles.includes(user.role));

  return (
    <aside className="app-sidebar">
      <div className="sidebar-inner">
        <div className="sidebar-topbox">
          <div className="brand-title">SYSTEM</div>
          <div className="role-pill">
            {user.name} • {user.role}
          </div>

          {/* MOCK: สลับ role เพื่อทดสอบ (ลบทิ้งได้ตอนมี backend) */}
          <div className="role-switch">
            <button
              className={`role-btn ${user.role === "Worker" ? "active" : ""}`}
              onClick={() => setRole("Worker")}
              type="button"
            >
              Worker
            </button>
            <button
              className={`role-btn ${user.role === "HR" ? "active" : ""}`}
              onClick={() => setRole("HR")}
              type="button"
            >
              HR
            </button>
          </div>
        </div>

        <nav className="nav-list">
          {visibleMenu.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`}
              style={{ textDecoration: "none", display: "block" }}
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
