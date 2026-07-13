import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { fetchSession } from "@/lib/session-api.js";
import { sharingApi } from "@/lib/network-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { toast } from "@/lib/toast";

export function ExpedienteInvitePage() {
  const { token } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState("loading"); // loading | gate | error | redeeming
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (!token || String(token).includes("/") || String(token).includes("..")) {
        if (active) {
          setErrorMsg(t("share.gate.invalid"));
          setView("error");
        }
        return;
      }

      if (!isSupabaseConfigured()) {
        if (active) setView("gate");
        return;
      }

      const session = await fetchSession().catch(() => null);
      if (!session?.user) {
        if (active) setView("gate");
        return;
      }

      if (active) setView("redeeming");
      try {
        const data = await sharingApi.redeemInvite(token);
        if (!active) return;
        toast.success(t("messages.share.redeemToast"));
        const path = data?.path || `/red/contacto/${data.owner_id}/expediente/${data.prospect_id}`;
        navigate(path, { replace: true });
      } catch (err) {
        if (!active) return;
        setErrorMsg(err.message || t("share.gate.noAccessBody"));
        setView("error");
      }
    }

    resolve();
    return () => { active = false; };
  }, [token, navigate, t]);

  const next = token ? `/e/i/${token}` : "/";
  const nextQ = encodeURIComponent(next);

  if (view === "loading" || view === "redeeming") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <p>{view === "redeeming" ? t("share.invite.redeeming") : t("share.gate.loading")}</p>
        </div>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <h1>{t("share.gate.title")}</h1>
          <p>{errorMsg || t("share.gate.noAccessBody")}</p>
          <div className="expediente-link-actions">
            <Link className="btn btn-primary" to="/">{t("share.gate.home")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="expediente-link-page">
      <div className="expediente-link-card">
        <h1>{t("share.gate.title")}</h1>
        <p>{t("share.invite.gateBody")}</p>
        <div className="expediente-link-actions">
          <Link className="btn btn-primary" to={`/login?next=${nextQ}`}>{t("share.gate.login")}</Link>
          <Link className="btn btn-ghost" to={`/register?next=${nextQ}`}>{t("share.gate.register")}</Link>
        </div>
      </div>
    </div>
  );
}
