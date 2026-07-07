import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [sessionState, setSessionState] = useState(
    isSupabaseConfigured() ? "loading" : "ready",
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    fetch("/api/v1/auth/session", { credentials: "include" })
      .then((r) => setSessionState(r.ok ? "ready" : "missing"))
      .catch(() => setSessionState("missing"));
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          password: fd.get("password"),
          confirm: fd.get("confirm"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("auth.reset.submit"));
      navigate(body.redirect ?? "/settings", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">{t("auth.reset.title")}</div>
      <div className="auth-sub">{t("auth.reset.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {sessionState === "loading" && (
        <div className="auth-sub">{t("auth.callback.pending")}</div>
      )}
      {sessionState === "missing" && (
        <>
          <div className="auth-error">{t("auth.reset.sessionExpired")}</div>
          <div className="auth-foot"><Link to="/forgot-password">{t("auth.reset.requestNew")}</Link></div>
        </>
      )}
      {sessionState === "ready" && (
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <label className="field-label">{t("auth.reset.new")}</label>
          <input className="auth-input" type="password" name="password" placeholder={t("auth.register.passwordPlaceholder")} required autoComplete="new-password" minLength={6} onFocus={selectOnFocus} />
        </div>
        <div className="auth-field">
          <label className="field-label">{t("auth.reset.confirm")}</label>
          <input className="auth-input" type="password" name="confirm" placeholder={t("auth.reset.confirmPlaceholder")} required autoComplete="new-password" minLength={6} onFocus={selectOnFocus} />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? t("auth.reset.pending") : t("auth.reset.submit")}
        </button>
      </form>
      )}
    </div>
  );
}
