
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";

async function fetchSharedProspect(prospectId) {
  const res = await fetch(`/api/v1/shared-prospects/${prospectId}`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error");
  return body.data;
}

export function SharedProspectPage({ prospectId }) {
  const { t } = useI18n();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured() || !prospectId) return;
    fetchSharedProspect(prospectId)
      .then(setPayload)
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [prospectId]);

  const prospect = payload?.prospect;
  const name = [prospect?.name1, prospect?.name2].filter(Boolean).join(" / ")
    || prospect?.name
    || prospect?.prospect_code
    || t("network.sharedTitle");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("network.sharedTitle")} subtitle="" />
        <div className="sales-page">
          <PageBack href="/network" />
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title={t("network.sharedTitle")} subtitle={name} />
      <div className="sales-page">
        <PageBack href="/network" />
        {loading && <div className="dp-empty">{t("common.loading")}</div>}
        {!loading && prospect && (
          <div className="settings-card">
            <div className="card-heading">{name}</div>
            <div className="card-sub">
              {payload.permission === "edit" ? t("network.permEdit") : t("network.permView")}
            </div>
            <div className="prospect-summary-grid" style={{ marginTop: 16 }}>
              <div><span className="settings-label">{t("exp.prospect.id")}</span><div>{prospect.prospect_code}</div></div>
              {prospect.city && <div><span className="settings-label">{t("exp.edit.city")}</span><div>{prospect.city}</div></div>}
              {prospect.country && <div><span className="settings-label">{t("exp.edit.country")}</span><div>{prospect.country}</div></div>}
              {prospect.phone && <div><span className="settings-label">{t("exp.edit.phone")}</span><div>{prospect.phone}</div></div>}
              {prospect.email && <div><span className="settings-label">{t("exp.edit.email")}</span><div>{prospect.email}</div></div>}
              {prospect.contract && <div><span className="settings-label">{t("exp.edit.contract")}</span><div>{prospect.contract}</div></div>}
            </div>
            <div className="ethic-box" style={{ marginTop: 16 }}>{t("network.sharedReadOnlyHint")}</div>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <Link to="/network" className="btn btn-ghost">{t("network.backToNetwork")}</Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
