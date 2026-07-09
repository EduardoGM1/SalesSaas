import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { AuthField } from "@/components/auth/auth-field.jsx";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: fd.get("email"),
          redirectOrigin: window.location.origin,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("auth.forgot.submit"));
      setMessage(body.message ?? t("auth.forgot.success"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.login.errorGeneric"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="auth-title auth-landing-title">{t("auth.forgot.title")}</div>
      <div className="auth-sub auth-landing-subtitle">{t("auth.forgot.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <AuthField
            label={t("auth.login.email")}
            name="email"
            type="email"
            placeholder={t("auth.common.emailPlaceholder")}
            required
            autoComplete="email"
            icon={Mail}
          />
          <button type="submit" className="btn btn-primary btn-full auth-landing-submit" disabled={pending}>
            {pending ? t("auth.forgot.pending") : t("auth.forgot.submit")}
          </button>
        </form>
      )}
      <div className="auth-foot auth-landing-foot"><Link to="/login">{t("auth.forgot.back")}</Link></div>
    </>
  );
}
