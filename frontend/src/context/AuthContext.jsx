import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState({
    name: "Jokec",
    role: "Worker", // "Worker" | "HR"
  });

  const value = useMemo(
    () => ({
      user,
      setRole: (role) => setUser((p) => ({ ...p, role })),
      loginMock: (role = "Worker") => setUser({ name: "Jokec", role }),
      logout: () => setUser({ name: "Guest", role: "Worker" }),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
