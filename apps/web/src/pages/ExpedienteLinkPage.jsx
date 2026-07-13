import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { fetchSession } from "@/lib/session-api.js";
import { sharingApi } from "@/lib/network-api.js";
import { useDbStore } from "@/stores/db-store";
import { isClientDeleted } from "@/lib/clients";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ExpedienteLinkPage() {
  const { prospectId } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState("loading"); // loading | gate | noAccess | invalid

  useEffect(() => {
    let active = true;

    async function resolve() {
      if (!prospectId || String(prospectId).includes("/") || String(prospectId).includes("..")) {
        if (active) setView("invalid");
        return;
      }

      const isUuid = UUID_RE.test(prospectId);

      if (!isSupabaseConfigured()) {
        const local = useDbStore.getState().getClient(prospectId);
        if (local && !isClientDeleted(local)) {
          navigate(`/clients/${prospectId}`, { replace: true });
          return;
        }
        if (active) setView("gate");
        return;
      }

      const session = await fetchSession().catch(() => null);
      const user = session?.user ?? null;
      if (!user) {
        if (active) setView("gate");
        return;
      }

      const local = useDbStore.getState().getClient(prospectId);
      if (local && !isClientDeleted(local)) {
        navigate(`/clients/${prospectId}`, { replace: true });
        return;
      }

      if (!isUuid) {
        if (active) setView("noAccess");
        return;
      }

      try {
        const data = await sharingApi.getSharedProspect(prospectId);
        if (!active) return;
        if (data?.permission === "owner") {
          navigate(`/clients/${prospectId}`, { replace: true });
          return;
        }
        const ownerId = data?.prospect?.user_id;
        if (ownerId) {
          navigate(`/red/contacto/${ownerId}/expediente/${prospectId}`, { replace: true });
          return;
        }
        if (active) setView("noAccess");
      } catch {
        if (active) setView("noAccess");
      }
    }

    resolve();
    return () => { active = false; };
  }, [prospectId, navigate]);

  const next = prospectId ? `/e/${prospectId}` : "/";
  const nextQ = encodeURIComponent(next);

  if (view === "loading") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <p>{t("share.gate.loading")}</p>
        </div>
      </div>
    );
  }

  if (view === "invalid") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <h1>{t("share.gate.title")}</h1>
          <p>{t("share.gate.invalid")}</p>
          <div className="expediente-link-actions">
            <Link className="btn btn-primary" to="/">{t("share.gate.home")}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (view === "noAccess") {
    return (
      <div className="expediente-link-page">
        <div className="expediente-link-card">
          <h1>{t("share.gate.noAccessTitle")}</h1>
          <p>{t("share.gate.noAccessBody")}</p>
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
        <p>{t("share.gate.body")}</p>
        <div className="expediente-link-actions">
          <Link className="btn btn-primary" to={`/login?next=${nextQ}`}>{t("share.gate.login")}</Link>
          <Link className="btn btn-ghost" to={`/register?next=${nextQ}`}>{t("share.gate.register")}</Link>
        </div>
      </div>
    </div>
  );
}
