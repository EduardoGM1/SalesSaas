import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { safeNextPath } from "@/lib/safe-next.js";
import { consumeAuthParamsFromUrl } from "@/lib/auth-callback.js";

export function AuthCallbackPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let active = true;

    async function finish() {
      const hash = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hash);
      const recovery =
        searchParams.get("type") === "recovery"
        || hashParams.get("type") === "recovery";

      // Si Supabase strippea ?next=..., recovery debe ir a reset-password (no a / → login).
      const nextRaw = searchParams.get("next");
      const next = recovery
        ? safeNextPath(nextRaw, "/reset-password")
        : safeNextPath(nextRaw, "/");

      try {
        await consumeAuthParamsFromUrl({ searchParams, t });
        if (active) navigate(next, { replace: true });
      } catch (err) {
        if (active) {
          setMessage(err instanceof Error ? err.message : t("auth.login.errorAuth"));
          const fallback = recovery ? "/forgot-password" : "/login?error=auth";
          window.setTimeout(() => navigate(fallback, { replace: true }), 1400);
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
