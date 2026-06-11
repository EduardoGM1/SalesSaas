import { useState } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";

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
        body: JSON.stringify({ email: fd.get("email") }),
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
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">{t("auth.forgot.title")}</div>
      <div className="auth-sub">{t("auth.forgot.sub")}</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="field-label">{t("auth.login.email")}</label>
            <input className="auth-input" type="email" name="email" placeholder={t("auth.common.emailPlaceholder")} required autoComplete="email" onFocus={selectOnFocus} />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? t("auth.forgot.pending") : t("auth.forgot.submit")}
          </button>
        </form>
      )}
      <div className="auth-foot"><Link to="/login">{t("auth.forgot.back")}</Link></div>
    </div>
  );
}
