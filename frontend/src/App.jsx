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
        <Route path="worker/calendar" element={<Placeholder title="Calendar View" />} />
        <Route path="worker/balance" element={<Placeholder title="Leave Balance" />} />
        <Route path="worker/notifications" element={<Placeholder title="Notifications" />} />
        <Route path="worker/profile" element={<Placeholder title="Profile" />} />

        {/* HR */}
        <Route path="/hr/attendance" element={<HRAttendancePage />} />
        <Route path="hr/dashboard" element={<HRDashboard />} />
        <Route path="hr/calendar" element={<HRDashboard />} />
        <Route path="hr/leave-approvals" element={<HRLeaveApprovals />} />
        <Route path="hr/employees" element={<Placeholder title="Employees" />} />

        {/* default */}
        <Route index element={<Navigate to="/login" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
