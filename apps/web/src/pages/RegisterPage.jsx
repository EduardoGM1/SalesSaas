import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Lock, Mail, User } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { AuthField } from "@/components/auth/auth-field.jsx";
import { safeNextPath } from "@/lib/safe-next.js";

export function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"), "/");
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
          redirectOrigin: window.location.origin,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("auth.register.submit"));
      if (body.redirect) {
        navigate(body.redirect, { replace: true });
        return;
      }
      if (body.session || body.user) {
        navigate(nextPath, { replace: true });
        return;
      }
      setMessage(body.message ?? t("auth.register.success"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  const loginHref = nextPath !== "/" ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";

  return (
    <>
      <div className="auth-title auth-landing-title">{t("auth.register.title")}</div>
      <div className="auth-sub auth-landing-subtitle">{t("auth.register.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <AuthField
            label={t("auth.register.fullName")}
            name="fullName"
            type="text"
            placeholder={t("auth.register.fullNamePlaceholder")}
            autoComplete="name"
            icon={User}
          />
          <AuthField
            label={t("auth.register.email")}
            name="email"
            type="email"
            placeholder={t("auth.register.emailPlaceholder")}
            required
            autoComplete="email"
            icon={Mail}
          />
          <AuthField
            label={t("auth.register.password")}
            name="password"
            placeholder={t("auth.register.passwordPlaceholder")}
            required
            autoComplete="new-password"
            minLength={6}
            icon={Lock}
            showToggle
          />
          <button type="submit" className="btn btn-primary btn-full auth-landing-submit" disabled={pending}>
            {pending ? t("auth.register.pending") : t("auth.register.submit")}
          </button>
          <div className="auth-landing-trustline">
            <Check size={15} strokeWidth={3} aria-hidden />
            <span>{t("auth.register.noCard")}</span>
          </div>
        </form>
      )}
      <div className="auth-foot auth-landing-foot">
        {t("auth.register.hasAccount")} <Link to={loginHref}>{t("auth.register.signIn")}</Link>
      </div>
    </>
  );
}
