import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";

export function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: fd.get("fullName"),
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("auth.register.submit"));
      if (body.redirect) {
        navigate(body.redirect, { replace: true });
        return;
      }
      setMessage(body.message ?? t("auth.register.success"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">{t("auth.register.title")}</div>
      <div className="auth-sub">{t("auth.register.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="field-label">{t("auth.register.fullName")}</label>
            <input className="auth-input" type="text" name="fullName" placeholder={t("auth.register.fullName")} autoComplete="name" onFocus={selectOnFocus} />
          </div>
          <div className="auth-field">
            <label className="field-label">{t("auth.register.email")}</label>
            <input className="auth-input" type="email" name="email" placeholder={t("auth.common.emailPlaceholder")} required autoComplete="email" onFocus={selectOnFocus} />
          </div>
          <div className="auth-field">
            <label className="field-label">{t("auth.register.password")}</label>
            <input className="auth-input" type="password" name="password" placeholder={t("auth.register.passwordPlaceholder")} required autoComplete="new-password" minLength={6} onFocus={selectOnFocus} />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? t("auth.register.pending") : t("auth.register.submit")}
          </button>
        </form>
      )}
      <div className="auth-foot">{t("auth.register.hasAccount")} <Link to="/login">{t("auth.register.signIn")}</Link></div>
    </div>
  );
}
