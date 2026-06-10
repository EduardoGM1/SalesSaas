import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

export function RegisterPage() {
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
      if (!res.ok) throw new Error(body.error ?? "No se pudo crear la cuenta.");
      if (body.redirect) {
        navigate(body.redirect, { replace: true });
        return;
      }
      setMessage(body.message ?? "Cuenta creada. Revisa tu correo para confirmar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Crear cuenta</div>
      <div className="auth-sub">Empieza a gestionar tus expedientes y metas.</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="field-label">Nombre completo</label>
            <input className="auth-input" type="text" name="fullName" placeholder="Tu nombre" autoComplete="name" />
          </div>
          <div className="auth-field">
            <label className="field-label">Correo</label>
            <input className="auth-input" type="email" name="email" placeholder="tu@correo.com" required autoComplete="email" />
          </div>
          <div className="auth-field">
            <label className="field-label">Contraseña</label>
            <input className="auth-input" type="password" name="password" placeholder="Mínimo 6 caracteres" required autoComplete="new-password" minLength={6} />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
      )}
      <div className="auth-foot">¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></div>
    </div>
  );
}
