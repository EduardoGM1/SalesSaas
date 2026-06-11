import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

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
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <label className="field-label">{t("auth.reset.new")}</label>
          <input className="auth-input" type="password" name="password" placeholder={t("auth.register.passwordPlaceholder")} required autoComplete="new-password" minLength={6} />
        </div>
        <div className="auth-field">
          <label className="field-label">{t("auth.reset.confirm")}</label>
          <input className="auth-input" type="password" name="confirm" placeholder={t("auth.reset.confirmPlaceholder")} required autoComplete="new-password" minLength={6} />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? t("auth.reset.pending") : t("auth.reset.submit")}
        </button>
      </form>
    </div>
  );
}
