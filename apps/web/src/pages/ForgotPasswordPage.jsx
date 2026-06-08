import { useState } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export function ForgotPasswordPage() {
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
      if (!res.ok) throw new Error(body.error ?? "No se pudo enviar el enlace.");
      setMessage(body.message ?? "Si existe una cuenta con ese correo, recibirás un enlace.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Recuperar contraseña</div>
      <div className="auth-sub">Te enviaremos un enlace para restablecer tu contraseña.</div>
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-ok">{message}</div>}
      {!message && (
        <form onSubmit={onSubmit}>
          <div className="auth-field">
            <label className="field-label">Correo</label>
            <input className="auth-input" type="email" name="email" placeholder="tu@correo.com" required autoComplete="email" />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}
      <div className="auth-foot"><Link to="/login">Volver al inicio de sesión</Link></div>
    </div>
  );
}
