"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Home } from "lucide-react";
import { signup, type AuthState } from "@/app/auth/actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<AuthState | null, FormData>(signup, null);

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Crear cuenta</div>
      <div className="auth-sub">Empieza a gestionar tus expedientes y metas.</div>

      {state?.error && <div className="auth-error">{state.error}</div>}
      {state?.message && <div className="auth-ok">{state.message}</div>}

      {!state?.message && (
        <form action={formAction}>
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

      <div className="auth-foot">¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link></div>
    </div>
  );
}
