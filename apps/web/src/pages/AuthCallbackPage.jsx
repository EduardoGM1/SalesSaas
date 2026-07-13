import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { notifyAuthChanged } from "@/lib/session-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { safeNextPath } from "@/lib/safe-next.js";

export function AuthCallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;

    async function finish() {
      const next = safeNextPath(searchParams.get("next"));
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const authError = searchParams.get("error_description") || searchParams.get("error");

      const hash = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (authError) {
        if (active) navigate("/login?error=auth", { replace: true });
        return;
      }

      try {
        if (code) {
          const res = await fetch("/auth/exchange-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? t("auth.login.errorAuth"));
        } else if (tokenHash && type) {
          const res = await fetch("/auth/verify-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token_hash: tokenHash, type }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? t("auth.login.errorAuth"));
        } else if (accessToken && refreshToken) {
          const res = await fetch("/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error ?? t("auth.login.errorAuth"));
        } else {
          throw new Error(t("auth.login.errorAuth"));
        }

        notifyAuthChanged();
        if (active) navigate(next, { replace: true });
      } catch (err) {
        if (active) {
          setMessage(err instanceof Error ? err.message : t("auth.login.errorAuth"));
          window.setTimeout(() => navigate("/login?error=auth", { replace: true }), 1200);
        }
      }
    }

    finish();
    return () => { active = false; };
  }, [navigate, searchParams, t]);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-sub">{message ?? t("auth.callback.pending")}</div>
      </div>
    </div>
  );
}
