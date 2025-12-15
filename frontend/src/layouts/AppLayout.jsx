import React from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import "./AppLayout.css";

export default function AppLayout() {
  return (
    <div className="app-layout">
      <AppSidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
