import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import "./LoginPage.css";
import { alertError, alertSuccess } from "../utils/sweetAlert";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const { login } = useAuth();
  const noti = useNotification();

  const [form, setForm] = useState({
    email: "",
    password: "",
    remember: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isValid = useMemo(() => {
    return form.email.trim() && form.password.trim();
  }, [form.email, form.password]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const goAfterLogin = (role) => {
    // If redirected by auth guard, go back to requested page
    const from = location.state?.from;
    if (from) return navigate(from, { replace: true });

    // Otherwise route by role
    return navigate(
      role === "HR" ? "/hr/dashboard" : "/worker/dashboard",
      { replace: true }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    try {
      setSubmitting(true);

      // ✅ Use AuthContext.login (handles token & user)
      const { user } = await login(form.email, form.password);

      // ✅ Sync unread notifications count
      try {
        await noti?.refresh?.();
      } catch {
        // ignore if provider not mounted
      }

      await alertSuccess(
        t("alerts.loginSuccessTitle"),
        t("alerts.welcomeBack", { name: user?.firstName || t("common.user") })
      );

      goAfterLogin(user?.role);
    } catch (err) {
      console.error("Login Error:", err);

      const msg =
        err?.response?.data?.message ||
        err?.message ||
        t("alerts.loginFailedDefault");

      await alertError(t("alerts.loginFailedTitle"), msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand">
            <span className="brand-title">{t("auth.login.title")}</span>
          </div>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="label">{t("auth.login.email")}</span>
            <input
              className="input"
              type="email"
              name="email"
              placeholder={t("auth.login.placeholders.email")}
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
            />
          </label>

          <label className="field">
            <div className="label-row">
              <span className="label">{t("auth.login.password")}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? t("auth.login.hide") : t("auth.login.show")}
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
              <span>{t("auth.login.rememberMe")}</span>
            </label>
          </div>

          <button
            className="primary"
            type="submit"
            disabled={!isValid || submitting}
          >
            {submitting ? t("auth.login.signingIn") : t("auth.login.signIn")}
          </button>
        </form>

        <div className="divider" />

        <div className="test-accounts">
          <div className="title">{t("auth.login.testAccounts")}</div>
          <div className="list">
            <div className="row">
              <span className="label">{t("auth.login.hr")}</span>
              <code>{"hr.manager@company.com"}</code>
            </div>
            <div className="row">
              <span className="label">{t("auth.login.worker")}</span>
              <code>{"worker.a@company.com"}</code>
            </div>
            <div className="row">
              <span className="label">{t("auth.login.password")}</span>
              <code>{"Password123"}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}