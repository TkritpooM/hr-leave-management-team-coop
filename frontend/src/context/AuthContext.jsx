import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axiosClient from "../api/axiosClient";
import { useTranslation } from "react-i18next";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { t } = useTranslation();

  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  const token = localStorage.getItem("token");
  const isAuthenticated = !!token;

  const persistUser = (u) => {
    setUser(u);
    if (u) localStorage.setItem("user", JSON.stringify(u));
    else localStorage.removeItem("user");
  };

  const logout = () => {
    localStorage.removeItem("token");
    persistUser(null);
  };

  const fetchMe = async () => {
    // ถ้า backend มี /auth/me หรือ /employees/me ให้ใช้
    // ถ้าไม่มี ให้ข้าม (ยังใช้ user ที่เก็บไว้ได้)
    try {
      const res = await axiosClient.get("/auth/me");
      persistUser(res.data?.user || res.data);
    } catch {
      // เงียบไว้ ไม่บังคับ
    }
  };

  const login = async (email, password) => {
    const res = await axiosClient.post("/auth/login", { email, password });
    const data = res.data;

    // รองรับรูปแบบ response หลายแบบ
    const receivedToken = data?.token || data?.accessToken;
    const u = data?.user || data?.employee || data?.data?.user;

    if (!receivedToken) throw new Error(t("Token not found in response"));

    localStorage.setItem("token", receivedToken);
    if (u) persistUser(u);
    else await fetchMe();

    return { token: receivedToken, user: u };
  };

  useEffect(() => {
    const init = async () => {
      try {
        if (localStorage.getItem("token")) {
          // ถ้ามี token แล้วลองดึง me เพื่อ sync user ให้ใหม่
          await fetchMe();
        }
      } finally {
        setIsReady(true);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onLogout = () => {
      persistUser(null);
      setIsReady(true);
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const value = useMemo(
    () => ({
      isReady,
      user,
      isAuthenticated,
      login,
      logout,
      setUser: persistUser,
    }),
    [isReady, user, isAuthenticated]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);