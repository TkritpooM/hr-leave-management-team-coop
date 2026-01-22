import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";

import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import { useAuth } from "./context/AuthContext";

import WorkerDashboard from "./pages/WorkerDashboard";
import WorkerAttendancePage from "./pages/WorkerAttendancePage";
import WorkerLeave from "./pages/WorkerLeave";
import WorkerCalendar from "./pages/WorkerCalendar";
import WorkerNotifications from "./pages/WorkerNotifications";
import WorkerProfile from "./pages/WorkerProfile";

import HRDashboard from "./pages/HRDashboard";
import HRAttendancePage from "./pages/HRAttendancePage";
import HRProfileRequests from "./pages/HRProfileRequests";
import HRLeaveApprovals from "./pages/HRLeaveApprovals";
import HRNotifications from "./pages/HRNotifications";
import Employees from "./pages/HREmployees";
import LeaveSettings from "./pages/HRLeaveTypeSettings";
import HRAttendancePolicy from "./pages/HRAttendancePolicy";

import LoginPage from "./pages/LoginPage";
import RoleManagementPage from "./pages/RoleManagementPage";

export default function App() {

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ทุกหน้าหลัง login ใช้ layout เดียว + sidebar เดียว */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        {/* หน้าเริ่มต้นหลัง login: เด้งตาม role */}
        <Route index element={<HomeRedirect />} />

        {/* Worker */}
        <Route
          path="worker/dashboard"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="worker/attendance"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerAttendancePage />
            </RoleRoute>
          }
        />
        <Route
          path="worker/leave"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerLeave />
            </RoleRoute>
          }
        />
        <Route
          path="worker/calendar"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerCalendar />
            </RoleRoute>
          }
        />
        <Route
          path="worker/notifications"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerNotifications />
            </RoleRoute>
          }
        />
        <Route
          path="worker/profile"
          element={
            <RoleRoute allow={["Worker"]}>
              <WorkerProfile />
            </RoleRoute>
          }
        />

        {/* HR */}
        <Route
          path="hr/dashboard"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRDashboard />
            </RoleRoute>
          }
        />
        <Route
          path="hr/attendance"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRAttendancePage />
            </RoleRoute>
          }
        />
        <Route
          path="hr/notifications"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRNotifications />
            </RoleRoute>
          }
        />
        <Route
          path="hr/profile-requests"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRProfileRequests />
            </RoleRoute>
          }
        />
        <Route
          path="hr/leave-approvals"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRLeaveApprovals />
            </RoleRoute>
          }
        />
        <Route
          path="hr/employees"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <Employees />
            </RoleRoute>
          }
        />
        <Route
          path="hr/leave-settings"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <LeaveSettings />
            </RoleRoute>
          }
        />

        {/* HR Attendance Policy (Phase 2.2) */}
        <Route
          path="hr/attendance-policy"
          element={
            <RoleRoute allow={["HR", "Admin"]}>
              <HRAttendancePolicy />
            </RoleRoute>
          }
        />
        {/* Admin */}
        <Route
          path="admin/roles"
          element={
            <RoleRoute allow={["Admin"]}>
              <RoleManagementPage />
            </RoleRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function HomeRedirect() {
  const { user, isReady } = useAuth();
  if (!isReady) return null;

  const role = user?.role;
  const target = (role === "HR" || role === "Admin") ? "/hr/dashboard" : "/worker/dashboard";
  return <Navigate to={target} replace />;
}