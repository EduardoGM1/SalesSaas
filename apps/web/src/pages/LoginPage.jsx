import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { notifyAuthChanged } from "@/lib/session-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { AuthField } from "@/components/auth/auth-field.jsx";
import { safeNextPath } from "@/lib/safe-next.js";

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
  const nextPath = safeNextPath(searchParams.get("next"), "/");
  const [error, setError] = useState(errorKey ? t(QUERY_KEYS[errorKey] ?? "auth.login.errorGeneric") : null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    fetch("/api/v1/auth/session", { credentials: "include" })
      .then((r) => {
        if (r.ok) navigate(nextPath, { replace: true });
      })
      .catch(() => {});
  }, [navigate, nextPath]);

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
      navigate(nextPath, { replace: true });
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

  const registerHref = nextPath !== "/" ? `/register?next=${encodeURIComponent(nextPath)}` : "/register";

  return (
    <>
      <div className="auth-title auth-landing-title">{t("auth.login.title")}</div>
      <div className="auth-sub auth-landing-subtitle">{t("auth.login.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <AuthField
          label={t("auth.login.email")}
          name="email"
          type="email"
          placeholder={t("auth.login.emailPlaceholder")}
          required
          autoComplete="email"
          icon={Mail}
        />
        <AuthField
          label={t("auth.login.password")}
          name="password"
          placeholder={t("auth.register.passwordPlaceholder")}
          required
          autoComplete="current-password"
          icon={Lock}
          showToggle
        />
        <div className="auth-field-foot auth-landing-forgot">
          <Link to="/forgot-password">{t("auth.login.forgot")}</Link>
        </div>
        <button type="submit" className="btn btn-primary btn-full auth-landing-submit" disabled={pending}>
          {pending ? t("auth.login.pending") : t("auth.login.submit")}
        </button>
      </form>
      <div className="auth-foot auth-landing-foot">
        {t("auth.login.noAccount")} <Link to={registerHref}>{t("auth.login.createAccount")}</Link>
      </div>
    </>
  );
}
