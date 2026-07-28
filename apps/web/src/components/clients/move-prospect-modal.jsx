import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SalesModal } from "@/components/ui/sales-modal";
import { sharingApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";

/**
 * Modal para duplicar o transferir un expediente a otro workspace (frontera).
 */
export function MoveProspectModal({
  open,
  onOpenChange,
  prospectId,
  mode = "duplicate",
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !prospectId) return;
    setLoading(true);
    setError("");
    setSelected("");
    sharingApi.listTransferTargets(prospectId)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setTargets(list);
        const firstOk = list.find((x) => x.allowed && !x.is_current);
        if (firstOk) setSelected(firstOk.id);
        else {
          const same = list.find((x) => x.is_current);
          if (same) setSelected(same.id);
        }
      })
      .catch((err) => setError(err.message || t("exp.moveBlocked")))
      .finally(() => setLoading(false));
  }, [open, prospectId, t]);

  const chosen = targets.find((x) => x.id === selected) || null;
  const blocked = chosen && !chosen.allowed;

  const submit = async () => {
    if (!chosen || !chosen.allowed || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "transfer") {
        await sharingApi.transfer(prospectId, { target_workspace_id: chosen.id });
        toast.success(t("exp.moveOkTransfer"));
        onOpenChange(false);
        await requestSyncRefresh({ force: true, reason: "transfer" });
        navigate("/clients");
      } else {
        const created = await sharingApi.duplicate(prospectId, { target_workspace_id: chosen.id });
        toast.success(t("exp.moveOkDup"));
        onOpenChange(false);
        await requestSyncRefresh({ force: true, reason: "duplicate" });
        if (created?.id) navigate(`/clients/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exp.moveBlocked"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "transfer" ? t("exp.moveTransfer") : t("exp.moveDuplicate")}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <p className="admin-cell-muted" style={{ margin: 0, fontSize: 13 }}>{t("exp.movePick")}</p>
        {loading && <p>{t("common.loading")}</p>}
        {!loading && (
          <div style={{ display: "grid", gap: 8 }}>
            {targets.map((w) => (
              <label
                key={w.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  opacity: w.allowed ? 1 : 0.65,
                  cursor: w.allowed ? "pointer" : "not-allowed",
                }}
              >
                <input
                  type="radio"
                  name="move-ws"
                  value={w.id}
                  checked={selected === w.id}
                  disabled={!w.allowed}
                  onChange={() => setSelected(w.id)}
                />
                <span>
                  <strong>{w.nombre}</strong>
                  {w.tipo === "personal" ? " · Personal" : w.empresa_nombre ? ` · ${w.empresa_nombre}` : ""}
                  {w.is_current ? " (actual)" : ""}
                  {!w.allowed && (
                    <span className="auth-error" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                      {w.reason || t("exp.moveBlocked")}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {!targets.length && <p className="admin-empty">{t("exp.movePick")}</p>}
          </div>
        )}
        {blocked && (
          <div className="auth-error">{chosen.reason || t("exp.moveBlocked")}</div>
        )}
        {error && <div className="auth-error">{error}</div>}
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || loading || !chosen || !chosen.allowed}
            onClick={submit}
          >
            {busy ? t("exp.moveBusy") : mode === "transfer" ? t("exp.transfer") : t("exp.duplicate")}
          </button>
        </div>
      </div>
    </SalesModal>
  );
}
