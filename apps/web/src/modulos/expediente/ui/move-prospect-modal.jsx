import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Store } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { sharingApi } from "@/lib/network-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { requestSyncRefresh } from "@/lib/sync-refresh.js";

/**
 * Modal para duplicar o transferir un expediente a otro workspace.
 * Desde el espacio personal la transferencia usa un asistente de 3 pasos
 * (Empresa → Sala → Confirmar) y es definitiva: mismo expediente, sin copias.
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
  const [step, setStep] = useState(1);
  const [empresaId, setEmpresaId] = useState("");
  const [salaId, setSalaId] = useState("");

  useEffect(() => {
    if (!open || !prospectId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected("");
    setStep(1);
    setEmpresaId("");
    setSalaId("");
    sharingApi.listTransferTargets(prospectId, mode)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setTargets(list);
        const firstOk = list.find((x) => x.allowed && !x.is_current);
        if (firstOk) setSelected(firstOk.id);
        else {
          const same = list.find((x) => x.is_current);
          if (same) setSelected(same.id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("exp.moveBlocked"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, prospectId, mode, t]);

  const current = targets.find((x) => x.is_current) || null;
  const wizard = mode === "transfer" && current?.tipo === "personal";

  const salas = useMemo(
    () => targets.filter((x) => x.allowed && !x.is_current && x.tipo === "sala_de_venta"),
    [targets],
  );
  const empresas = useMemo(() => {
    const map = new Map();
    for (const sala of salas) {
      const key = sala.empresa_id || sala.id;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          nombre: sala.empresa_nombre || sala.nombre,
          salas: [],
        });
      }
      map.get(key).salas.push(sala);
    }
    return [...map.values()];
  }, [salas]);
  const chosenEmpresa = empresas.find((e) => e.id === empresaId) || null;
  const chosenSala = salas.find((s) => s.id === salaId) || null;

  const doTransfer = async (targetId, okMessage) => {
    setBusy(true);
    setError("");
    try {
      await sharingApi.transfer(prospectId, { target_workspace_id: targetId });
      toast.success(okMessage);
      onOpenChange(false);
      await requestSyncRefresh({ force: true, reason: "transfer" });
      navigate("/clients");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exp.moveBlocked"));
    } finally {
      setBusy(false);
    }
  };

  const chosen = targets.find((x) => x.id === selected) || null;
  const blocked = chosen && !chosen.allowed;

  const submitFlat = async () => {
    if (!chosen || !chosen.allowed || busy) return;
    if (mode === "transfer") {
      await doTransfer(chosen.id, t("exp.moveOkTransfer"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await sharingApi.duplicate(prospectId, { target_workspace_id: chosen.id });
      toast.success(t("exp.moveOkDup"));
      onOpenChange(false);
      await requestSyncRefresh({ force: true, reason: "duplicate" });
      if (created?.id) navigate(`/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("exp.moveBlocked"));
    } finally {
      setBusy(false);
    }
  };

  const wizardBody = (
    <div className="transfer-wizard">
      <ol className="transfer-wizard-steps" aria-label="Pasos de la transferencia">
        {["Empresa", "Sala", "Confirmar"].map((label, index) => (
          <li
            key={label}
            className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}
            aria-current={step === index + 1 ? "step" : undefined}
          >
            <span>{step > index + 1 ? <CheckCircle2 size={13} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {!salas.length ? (
        <p className="admin-empty">
          No perteneces a ninguna Sala de Ventas. Pide a tu empresa que te añada a una sala para poder transferir el expediente.
        </p>
      ) : null}

      {salas.length > 0 && step === 1 ? (
        <div className="transfer-wizard-options">
          <p className="admin-cell-muted">Elige la empresa que recibirá el expediente.</p>
          {empresas.map((empresa) => (
            <label key={empresa.id} className={`transfer-wizard-option${empresaId === empresa.id ? " selected" : ""}`}>
              <input
                type="radio"
                name="transfer-empresa"
                checked={empresaId === empresa.id}
                onChange={() => {
                  setEmpresaId(empresa.id);
                  setSalaId("");
                }}
              />
              <Building2 size={16} aria-hidden />
              <span>
                <strong>{empresa.nombre}</strong>
                <small>{empresa.salas.length === 1 ? "1 sala disponible" : `${empresa.salas.length} salas disponibles`}</small>
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {step === 2 && chosenEmpresa ? (
        <div className="transfer-wizard-options">
          <p className="admin-cell-muted">Elige la Sala de Ventas de {chosenEmpresa.nombre}.</p>
          {chosenEmpresa.salas.map((sala) => (
            <label key={sala.id} className={`transfer-wizard-option${salaId === sala.id ? " selected" : ""}`}>
              <input
                type="radio"
                name="transfer-sala"
                checked={salaId === sala.id}
                onChange={() => setSalaId(sala.id)}
              />
              <Store size={16} aria-hidden />
              <span>
                <strong>{sala.nombre}</strong>
                {sala.empresa_nombre ? <small>{sala.empresa_nombre}</small> : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {step === 3 && chosenSala ? (
        <div className="transfer-wizard-summary">
          <p>
            El expediente se transferirá de forma <strong>permanente</strong> a la sala{" "}
            <strong>{chosenSala.nombre}</strong>
            {chosenSala.empresa_nombre ? <> de <strong>{chosenSala.empresa_nombre}</strong></> : null}.
          </p>
          <ul>
            <li>Sigue siendo el mismo expediente: conserva su historial, herramientas y notas.</li>
            <li>No se crean copias ni nuevos registros.</li>
            <li>No podrá regresar a tu espacio personal.</li>
          </ul>
        </div>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}

      <div className="btn-row">
        {step > 1 ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setStep(step - 1)}>
            <ArrowLeft size={15} /> Atrás
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </button>
        )}
        {step === 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!chosenEmpresa}
            onClick={() => {
              if (chosenEmpresa?.salas.length === 1) setSalaId(chosenEmpresa.salas[0].id);
              setStep(2);
            }}
          >
            Continuar <ArrowRight size={15} />
          </button>
        ) : null}
        {step === 2 ? (
          <button type="button" className="btn btn-primary" disabled={!chosenSala} onClick={() => setStep(3)}>
            Continuar <ArrowRight size={15} />
          </button>
        ) : null}
        {step === 3 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !chosenSala}
            onClick={() => void doTransfer(chosenSala.id, t("exp.moveOkTransfer"))}
          >
            {busy ? t("exp.moveBusy") : "Confirmar transferencia"}
          </button>
        ) : null}
      </div>
    </div>
  );

  const flatBody = (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="admin-cell-muted" style={{ margin: 0, fontSize: 13 }}>{t("exp.movePick")}</p>
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
          onClick={submitFlat}
        >
          {busy ? t("exp.moveBusy") : mode === "transfer" ? t("exp.transfer") : t("exp.duplicate")}
        </button>
      </div>
    </div>
  );

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={wizard ? "Transferir a una empresa" : mode === "transfer" ? t("exp.moveTransfer") : t("exp.moveDuplicate")}
      sub={wizard ? "Movimiento definitivo hacia una Sala de Ventas." : undefined}
    >
      {loading ? <p>{t("common.loading")}</p> : wizard ? wizardBody : flatBody}
    </SalesModal>
  );
}
