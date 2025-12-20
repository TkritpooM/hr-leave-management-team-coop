import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import axios from "axios";
import AppSidebar from "../components/AppSidebar";
import "./AppLayout.css";

export default function AppLayout() {

  // ดึงข้อมูล User เพื่อเช็ค Role
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user.role === "HR" ? "HR" : "Worker";
  const notificationKey = role === "HR" ? "hr_unread_notifications" : "worker_unread_notifications";
  const token = localStorage.getItem("token");

useEffect(() => {
  if (!token || !user.employeeId) return;

  let isMounted = true;
  let socket = null;

  const connectWS = () => {
    socket = new WebSocket(`ws://localhost:8000/ws/notifications`);

    socket.onopen = () => {
      if (isMounted && socket.readyState === WebSocket.OPEN) {
        console.log("WebSocket Connected ✅");
        socket.send(JSON.stringify({ type: 'REGISTER', employeeId: user.employeeId }));
      }
    };

    socket.onmessage = (event) => {
      if (!isMounted) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'NOTIFICATION') {
          const current = parseInt(localStorage.getItem(notificationKey) || "0");
          localStorage.setItem(notificationKey, (current + 1).toString());
          window.dispatchEvent(new Event("storage"));
        }
      } catch (err) { console.error("WS Parse Error:", err); }
    };

    socket.onclose = () => {
      console.log("WebSocket Closed ℹ️");
    };
  };

  connectWS();

  return () => {
    isMounted = false;
    // ✅ เช็คให้ชัวร์ว่าเชื่อมต่อสำเร็จแล้วถึงค่อยปิด
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}, [token, user.employeeId, notificationKey]);

  return (
    <div className="app-layout">
      <AppSidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
