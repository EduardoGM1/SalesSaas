import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { AuthField } from "@/components/auth/auth-field.jsx";

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
    <>
      <div className="auth-title auth-landing-title">{t("auth.reset.title")}</div>
      <div className="auth-sub auth-landing-subtitle">{t("auth.reset.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {sessionState === "loading" && (
        <div className="auth-sub">{t("auth.callback.pending")}</div>
      )}
      {sessionState === "missing" && (
        <>
          <div className="auth-error">{t("auth.reset.sessionExpired")}</div>
          <div className="auth-foot auth-landing-foot"><Link to="/forgot-password">{t("auth.reset.requestNew")}</Link></div>
        </>
      )}
      {sessionState === "ready" && (
        <form onSubmit={onSubmit}>
          <AuthField
            label={t("auth.reset.new")}
            name="password"
            placeholder={t("auth.register.passwordPlaceholder")}
            required
            autoComplete="new-password"
            minLength={6}
            icon={Lock}
            showToggle
          />
          <AuthField
            label={t("auth.reset.confirm")}
            name="confirm"
            placeholder={t("auth.reset.confirmPlaceholder")}
            required
            autoComplete="new-password"
            minLength={6}
            icon={Lock}
            showToggle
          />
          <button type="submit" className="btn btn-primary btn-full auth-landing-submit" disabled={pending}>
            {pending ? t("auth.reset.pending") : t("auth.reset.submit")}
          </button>
        </form>
      )}
    </>
  );
}
