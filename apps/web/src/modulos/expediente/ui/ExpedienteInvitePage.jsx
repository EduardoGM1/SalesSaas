import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { fetchSession } from "@/lib/session-api.js";
import { sharingApi } from "@/lib/network-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { toast } from "@/lib/toast";
import { SalesModal } from "@/components/ui/sales-modal";

export function ExpedienteInvitePage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [pinPrompt, setPinPrompt] = useState(null);

  useEffect(() => {
    let active = true;

    async function resolve() {
      const inviteToken = token || searchParams.get("token");
      if (!inviteToken || String(inviteToken).includes("/") || String(inviteToken).includes("..")) {
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
        const data = await sharingApi.redeemInvite(inviteToken);
        if (!active) return;
        toast.success(t("messages.share.redeemToast"));
        const path = data?.path || `/red/contacto/${data.owner_id}/expediente/${data.prospect_id}`;
        const canPin = data?.can_add_to_workspace && !data?.added_to_workspace_at && data?.share?.id;
        if (canPin) {
          setPinPrompt({ shareId: data.share.id, path });
          setView("pin");
          return;
        }
        navigate(path, { replace: true });
      } catch (err) {
        if (!active) return;
        const msg = err.message || t("share.invite.expired");
        setErrorMsg(msg);
        setView("error");
      }
    }

    resolve();
    return () => { active = false; };
  }, [token, searchParams, navigate, t]);

  const inviteToken = token || searchParams.get("token");
  const next = inviteToken ? `/share/${inviteToken}` : "/";
  const nextQ = encodeURIComponent(next);

  const finishPin = async (add) => {
    if (!pinPrompt) return;
    if (add) {
      try {
        await sharingApi.addToWorkspace(pinPrompt.shareId);
        toast.success(t("clients.addToWorkspaceDone"));
      } catch (err) {
        toast.error(err.message);
      }
    }
    navigate(pinPrompt.path, { replace: true });
  };

  if (view === "loading" || view === "redeeming") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <p>{view === "redeeming" ? t("share.invite.redeeming") : t("share.gate.loading")}</p>
        </div>
      </div>
    );
  }

  if (view === "pin" && pinPrompt) {
    return (
      <div className="expediente-link-page">
        <SalesModal open onOpenChange={() => finishPin(false)} title={t("clients.addToWorkspace")} sub={t("clients.addToWorkspacePrompt")}>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => finishPin(true)}>
              {t("clients.addToWorkspaceYes")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => finishPin(false)}>
              {t("clients.addToWorkspaceNo")}
            </button>
          </div>
        </SalesModal>
      </div>
    );
  }

  if (view === "error") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <h1>{t("share.gate.title")}</h1>
          <p>{errorMsg || t("share.invite.expired")}</p>
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
