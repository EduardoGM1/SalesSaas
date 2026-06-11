import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Home } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { notifyAuthChanged } from "@/lib/session-api.js";
import { useI18n } from "@/hooks/use-i18n.js";

const QUERY_KEYS = {
  auth: "auth.login.errorAuth",
  deactivated: "auth.login.errorDeactivated",
};

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const errorKey = searchParams.get("error");
  const [error, setError] = useState(errorKey ? t(QUERY_KEYS[errorKey] ?? "auth.login.errorGeneric") : null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    fetch("/api/v1/auth/session", { credentials: "include" })
      .then((r) => {
        if (r.ok) navigate("/", { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      clearTimeout(timeoutId);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("auth.login.errorGeneric"));
      notifyAuthChanged();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(t("auth.login.errorTimeout"));
      } else {
        setError(err instanceof Error ? err.message : t("auth.login.errorGeneric"));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">{t("auth.login.title")}</div>
      <div className="auth-sub">{t("auth.login.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <label className="field-label">{t("auth.login.email")}</label>
          <input className="auth-input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="auth-field">
          <label className="field-label">{t("auth.login.password")}</label>
          <input className="auth-input" type="password" name="password" required autoComplete="current-password" />
          <div className="auth-field-foot"><Link to="/forgot-password">{t("auth.login.forgot")}</Link></div>
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>{pending ? t("auth.login.pending") : t("auth.login.submit")}</button>
      </form>
      <div className="auth-foot">{t("auth.login.noAccount")} <Link to="/register">{t("auth.login.createAccount")}</Link></div>
    </div>
  );
}
