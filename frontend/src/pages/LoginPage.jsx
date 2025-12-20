import { useMemo, useState } from "react";
import axios from 'axios';
import "./LoginPage.css";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "", remember: false });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const syncNotifications = async (token, role) => {
    try {
        const res = await axios.get('http://localhost:8000/api/notifications/my', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const count = res.data.unreadCount || 0;
        const key = role === "HR" ? "hr_unread_notifications" : "worker_unread_notifications";
        localStorage.setItem(key, count.toString());
        window.dispatchEvent(new Event("storage"));
    } catch (err) {
        console.error("Initial sync failed", err);
    }
  };

  const isValid = useMemo(() => {
    return form.email.trim() && form.password.trim();
  }, [form.email, form.password]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    try {
      setSubmitting(true);

      // 1. ยิง API ไปที่ Backend
      const response = await axios.post('http://localhost:8000/api/auth/login', {
        email: form.email,
        password: form.password
      });

      const data = response.data;

      // 2. ถ้าสำเร็จ (Backend ตอบ 200 OK)
      if (data.success) {
        // เก็บ Token และข้อมูล User
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // เรียกใช้การ Sync ก่อน Redirect
        await syncNotifications(data.token, data.user.role);

        // Alert บอกผู้ใช้
        alert("Login สำเร็จ! ✅ ยินดีต้อนรับ " + (data.user?.firstName || "User"));

        // 3. --- 🔥 จุดที่แก้ไข: ย้ายหน้าตามที่ Backend บอก ---
        // ใช้ data.redirectUrl ที่ backend ส่งมา (ถ้าไม่มีให้กันเหนียวไป worker)
        window.location.href = data.redirectUrl || '/worker/dashboard'; 
      }

    } catch (err) {
      console.error("Login Error:", err);
      
      // ดึงข้อความ Error ที่ Backend ส่งมา
      const errorMessage = err.response?.data?.message || "เชื่อมต่อ Server ไม่ได้ หรือรหัสผ่านผิด";
      alert("❌ " + errorMessage);

    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand">
            <span className="brand-title">Login</span>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="label">อีเมล</span>
            <input
              className="input"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <div className="label-row">
              <span className="label">รหัสผ่าน</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? "ซ่อน" : "แสดง"}
              </button>
            </div>

            <input
              className="input"
              type={showPw ? "text" : "password"}
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
          </label>

          <div className="row">
            <label className="checkbox">
              <input
                type="checkbox"
                name="remember"
                checked={form.remember}
                onChange={handleChange}
              />
              <span>จดจำฉัน</span>
            </label>
          </div>

          <button className="primary" type="submit" disabled={!isValid || submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

        </form>
        {/* ===== Divider ===== */}
        <div className="divider" />

        {/* ===== Test Accounts ===== */}
        <div className="test-account">
          <div className="test-title">บัญชีทดสอบ:</div>

          <div className="test-row">
            <span className="test-role">HR :</span>
            <code className="test-value">hr.manager@company.com</code>
          </div>

          <div className="test-row">
            <span className="test-role">Worker :</span>
            <code className="test-value">worker.a@company.com</code>
          </div>

          <div className="test-row">
            <span className="test-role">Pass :</span>
            <code className="test-value">Password123</code>
          </div>
        </div>

      </div>
    </div>
  );
}