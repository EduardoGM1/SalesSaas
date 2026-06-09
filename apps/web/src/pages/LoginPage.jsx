import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Home } from "lucide-react";
import { notifyAuthChanged } from "@/lib/session-api.js";

const QUERY_MSG = {
  auth: "No se pudo completar la autenticación. Intenta de nuevo.",
  deactivated: "Tu cuenta fue desactivada. Contacta al administrador.",
};

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(searchParams.get("error") ? QUERY_MSG[searchParams.get("error")] ?? "Error de autenticación." : null);

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
      if (!res.ok) throw new Error(body.error ?? "No se pudo iniciar sesión.");
      notifyAuthChanged();
      navigate("/");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("El servidor tardó demasiado. Revisa la conexión e intenta de nuevo.");
      } else {
        setError(err instanceof Error ? err.message : "Error");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Iniciar sesión</div>
      <div className="auth-sub">Accede a tu panel de ventas timeshare.</div>
      {error && <div className="auth-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="auth-field">
          <label className="field-label">Correo</label>
          <input className="auth-input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="auth-field">
          <label className="field-label">Contraseña</label>
          <input className="auth-input" type="password" name="password" required autoComplete="current-password" />
          <div className="auth-field-foot"><Link to="/forgot-password">¿Olvidaste tu contraseña?</Link></div>
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
      <div className="auth-foot">¿No tienes cuenta? <Link to="/register">Crear cuenta</Link></div>
    </div>
  );
}
