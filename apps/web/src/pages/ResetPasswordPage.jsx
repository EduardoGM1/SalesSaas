import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

export function ResetPasswordPage() {
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
      if (!res.ok) throw new Error(body.error ?? "No se pudo actualizar la contraseña.");
      navigate(body.redirect ?? "/settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Nueva contraseña</div>
      <div className="auth-sub">Elige una contraseña segura de al menos 6 caracteres.</div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <label className="field-label">Nueva contraseña</label>
          <input className="auth-input" type="password" name="password" placeholder="Mínimo 6 caracteres" required autoComplete="new-password" minLength={6} />
        </div>
        <div className="auth-field">
          <label className="field-label">Confirmar contraseña</label>
          <input className="auth-input" type="password" name="confirm" placeholder="Repite la contraseña" required autoComplete="new-password" minLength={6} />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? "Guardando…" : "Actualizar contraseña"}
        </button>
      </form>
    </div>
  );
}
