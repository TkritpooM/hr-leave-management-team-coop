import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

export default function RoleRoute({ allow = [], children }) {
  const { isReady, user } = useAuth();

  if (!isReady) return null;

  const role = user?.role;
  if (!role) return <Navigate to="/login" replace />;

  if (allow.length > 0 && !allow.includes(role)) {
    // ส่งไปหน้าแรกตาม role
    return <Navigate to={role === "HR" ? "/hr/dashboard" : "/worker/dashboard"} replace />;
  }

  return children;
}