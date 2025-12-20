import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";

import WorkerDashboard from "./pages/WorkerDashboard";
import WorkerLeave from "./pages/WorkerLeave";
import HRDashboard from "./pages/HRDashboard";
import HRLeaveApprovals from "./pages/HRLeaveApprovals";

import Placeholder from "./pages/Placeholder";
import LoginPage from "./pages/LoginPage";

import HRAttendancePage from "./pages/HRAttendancePage";
import HRNotifications from "./pages/HRNotifications";
import WorkerCalendar from "./pages/WorkerCalendar";
import WorkerNotifications from "./pages/WorkerNotifications";
import WorkerProfile from "./pages/WorkerProfile";

import Employees from "./pages/HREmployees";
import LeaveSettings from "./pages/HRLeaveTypeSettings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* ทุกหน้าหลัง login ใช้ layout เดียว + sidebar เดียว */}
      <Route path="/" element={<AppLayout />}>
        {/* Worker */}
        <Route path="worker/dashboard" element={<WorkerDashboard />} />
        <Route path="worker/attendance" element={<Placeholder title="My Attendance" />} />
        <Route path="worker/leave" element={<WorkerLeave />} />
        <Route path="worker/calendar" element={<WorkerCalendar />} />
        <Route path="worker/notifications" element={<WorkerNotifications />} />
        <Route path="worker/profile" element={<WorkerProfile />} />

        {/* HR */}
        <Route path="/hr/attendance" element={<HRAttendancePage />} />
        <Route path="hr/notifications" element={<HRNotifications />} />
        <Route path="hr/dashboard" element={<HRDashboard />} />
        <Route path="hr/calendar" element={<HRDashboard />} />
        <Route path="hr/leave-approvals" element={<HRLeaveApprovals />} />
        <Route path="hr/employees" element={<Employees />} />
        <Route path="hr/leave-settings" element={<LeaveSettings />} />

        {/* default */}
        <Route index element={<Navigate to="/login" replace />} />
        
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
