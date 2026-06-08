
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { computeVacaciones } from "@/lib/calculations/vacaciones";
import { fmt, fmtN, formatMoneyValue } from "@/lib/format/money";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useDbStore } from "@/stores/db-store";

const DEFAULTS = { vv: "2", vc: "3000", va: "20", vi: "8" };

interface VacacionesPageProps {
  clientId?;
  backHref;
}

export function VacacionesPage({ clientId, backHref }: VacacionesPageProps) {
  const { ready, mode } = useToolBucketReady(clientId);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const [fields, setFields] = useState({ ...DEFAULTS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const b = getToolBucket("vacaciones", mode, clientId);
    if (Object.keys(b).length) setFields({
      vv: String(b.vv ?? "2"), vc: String(b.vc ?? "3000"), va: String(b.va ?? "20"), vi: String(b.vi ?? "8"),
    });
  }, [ready, clientId, getToolBucket, mode]);

  const r = useMemo(() => computeVacaciones(fields), [fields]);

  const handleSave = () => {
    saveToolBucket("vacaciones", mode, fields, clientId);
    if (!clientId) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      <Topbar title="Proyección Vacaciones" subtitle={clientId ? "Costo futuro con inflación" : "Calculadora libre"} />
      <div className="sales-page">
        <div className="page-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link to={backHref} className="btn btn-ghost btn-sm">← Volver</Link>
            <div>
              <div className="page-title">Proyección de Vacaciones</div>
              <div className="page-sub">{clientId ? "Expediente" : "Calculadora libre"}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFields({ ...DEFAULTS })}>Limpiar</button>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">Datos de entrada</div>
            <div className="frow"><div className="flabel">Vacaciones por año</div>
              <input type="number" min={1} style={{ width: 80, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.vv} onChange={(e) => setFields({ ...fields, vv: e.target.value })} />
            </div>
            <div className="frow"><div className="flabel">Costo por vacación (USD)</div>
              <div className="mfield"><span className="mpfx">$</span>
                <input type="text" value={fields.vc} onChange={(e) => setFields({ ...fields, vc: e.target.value })} onBlur={(e) => setFields({ ...fields, vc: formatMoneyValue(e.target.value) })} />
              </div>
            </div>
            <div className="frow"><div className="flabel">Años a proyectar</div>
              <input type="number" min={1} max={60} style={{ width: 80, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.va} onChange={(e) => setFields({ ...fields, va: e.target.value })} />
            </div>
            <div className="frow"><div className="flabel">Inflación anual — <strong style={{ color: "var(--blue)" }}>{(r.inf * 100).toFixed(1)}%</strong></div>
              <input type="range" min={0} max={20} step={0.5} value={fields.vi} onChange={(e) => setFields({ ...fields, vi: e.target.value })} style={{ width: 130, accentColor: "var(--blue)" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <div className="card-heading" style={{ marginBottom: 16 }}>Costo de vacaciones en el futuro</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 14 }}>
                <div className="vbox blue">
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px", fontWeight: 700, marginBottom: 8 }}>Año actual</div>
                  <div className="vbox-val">{fmt(r.ga)}/año</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>${fmtN(r.costo)} × {r.viajes} vac.</div>
                </div>
                <div style={{ color: "var(--muted2)", fontSize: 24, fontWeight: 300 }}>→</div>
                <div className="vbox yellow">
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px", fontWeight: 700, marginBottom: 8 }}>AÑO {r.futAno}</div>
                  <div className="vbox-val">{fmt(r.cf)}/año</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Con inflación acumulada</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="vbox yellow" style={{ textAlign: "center", padding: 20 }}>
                  <div className="vbox-val" style={{ fontSize: 36, letterSpacing: "-2px" }}>{fmt(r.tc)}</div>
                  <div className="vbox-label" style={{ fontSize: 12, marginTop: 8 }}>Total con inflación</div>
                  <div className="vbox-sub">Suma acumulada · {r.anios} años</div>
                </div>
                <div className="g2">
                  <div className="vbox blue"><div className="vbox-val">{fmt(r.ts)}</div><div className="vbox-label">Sin inflación</div><div className="vbox-sub">${fmtN(r.ga)}/año × {r.anios}</div></div>
                  <div className="vbox red"><div className="vbox-val">{fmt(Math.max(0, r.tc - r.ts))}</div><div className="vbox-label">Impacto inflación</div><div className="vbox-sub">Costo extra acumulado</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="save-footer">
          <span className={`save-confirm${saved ? " show" : ""}`}>Guardado</span>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </div>
      <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="vacaciones" />
    </>
  );
}
