"use client";

import { useActionState } from "react";
import { Home } from "lucide-react";
import { updatePassword, type AuthState } from "@/app/auth/actions";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthState | null, FormData>(updatePassword, null);

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Nueva contraseña</div>
      <div className="auth-sub">Elige una contraseña segura de al menos 6 caracteres.</div>

      {state?.error && <div className="auth-error">{state.error}</div>}

      <form action={formAction}>
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
