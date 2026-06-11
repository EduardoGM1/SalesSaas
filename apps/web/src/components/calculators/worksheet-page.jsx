
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { Topbar } from "@/components/layout/topbar";
import { WS_CONFIG_IDS, WS_DEFAULTS } from "@/lib/constants";
import { computeWorksheet, ensureWSConfig } from "@/lib/calculations/worksheet";
import { formatMoneyValue } from "@/lib/format/money";
import { useMoney } from "@/hooks/use-money.js";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useDbStore } from "@/stores/db-store";

const FIELD_DEFAULTS = { wv: "20000", we: "30", wcc: "0", wob: "0" };

interface WorksheetPageProps {
  clientId?;
  backHref;
}

export function WorksheetPage({ clientId, backHref }: WorksheetPageProps) {
  const { fmt } = useMoney();
  const moneySettings = useDbStore((s) => s.db.settings);
  const { ready, mode } = useToolBucketReady(clientId);
  const db = useDbStore((s) => s.db);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const [fields, setFields] = useState({ ...FIELD_DEFAULTS });
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({ ...WS_DEFAULTS });
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const b = getToolBucket("worksheet", mode, clientId);
    const globalCfg = db.settings?.worksheetConfig || {};
    const cfg = ensureWSConfig({ ...globalCfg, ...b });
    setConfig(Object.fromEntries(WS_CONFIG_IDS.map((k) => [k, String(cfg[k] ?? WS_DEFAULTS[k])])));
    setFields({
      wv: String(b.wv ?? "20000"), we: String(b.we ?? "30"),
      wcc: String(b.wcc ?? "0"), wob: String(b.wob ?? "0"),
    });
  }, [ready, clientId, getToolBucket, mode, db.settings?.worksheetConfig]);

  const result = useMemo(
    () => computeWorksheet(fields, config),
    [fields, config, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const saveAll = () => {
    saveToolBucket("worksheet", mode, { ...fields, ...config }, clientId);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleSave = () => {
    saveToolBucket("worksheet", mode, { ...fields, ...config }, clientId);
    if (!clientId) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const moneyField = (key: keyof typeof fields) => (
    <div className="mfield"><span className="mpfx">$</span>
      <input type="text" value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} onBlur={(e) => setFields({ ...fields, [key]: formatMoneyValue(e.target.value) })} />
    </div>
  );

  return (
    <>
      <Topbar title="Worksheet" subtitle={clientId ? "Financiamiento" : "Calculadora libre"} />
      <div className="sales-page">
        <div className="page-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link to={backHref} className="btn btn-ghost btn-sm">← Volver</Link>
            <div>
              <div className="page-title">Worksheet</div>
              <div className="page-sub">{clientId ? "Expediente" : "Calculadora libre"}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFields({ ...FIELD_DEFAULTS })}>Limpiar</button>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">Datos de la venta</div>
            <div className="frow"><div className="flabel">Monto de venta</div>{moneyField("wv")}</div>
            <div className="frow"><div className="flabel">% Enganche</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={100} style={{ width: 65, padding: "7px 8px", border: "1px solid var(--border2)", borderRadius: 8, background: "var(--surface2)" }} value={fields.we} onChange={(e) => setFields({ ...fields, we: e.target.value })} />
                <span style={{ color: "var(--muted)", fontSize: 13 }}>%</span>
              </div>
            </div>
            <div className="frow"><div className="flabel">Costo de contrato</div>{moneyField("wcc")}</div>
            <div className="frow"><div className="flabel">Balance anterior</div>{moneyField("wob")}</div>
            <div className="g2" style={{ marginTop: 14 }}>
              <div className="vbox blue"><div className="vbox-val">{fmt(result.eng)}</div><div className="vbox-label">Enganche</div></div>
              <div className="vbox green"><div className="vbox-val">{fmt(result.engCc)}</div><div className="vbox-label">Eng. + Contrato</div></div>
              <div className="vbox yellow span2"><div className="vbox-val">{fmt(result.bal)}</div><div className="vbox-label">Balance a financiar</div><div className="vbox-sub">Venta − Enganche + Balance anterior</div></div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="card-heading">Opciones de financiamiento</div>
                <div className="card-sub">Hasta 3 opciones configurables</div>
              </div>
              <button type="button" className="config-btn" onClick={() => setConfigOpen(true)} title="Configurar opciones de financiamiento" aria-label="Configurar opciones de financiamiento">
                <Settings />
              </button>
            </div>
            {result.options.map((opt, i) => (
              <div key={i} className="opt-block">
                <div className="opt-head">
                  <div>
                    <div className="opt-tag">Opción {i + 1}</div>
                    <div className="opt-info">{config[`wo${i + 1}m`]} meses — {config[`wo${i + 1}r`]}%</div>
                  </div>
                  <div className="opt-result">{fmt(opt.monthly)}/mes</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="save-footer">
          <span className={`save-confirm${saved ? " show" : ""}`}>Guardado</span>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
        {clientId && (
          <div className="save-footer" style={{ marginTop: 8 }}>
            <Link to={`/clients/${clientId}?openSale=1&from=worksheet`} className="btn btn-primary">Registrar venta desde Worksheet</Link>
          </div>
        )}
      </div>

      <SalesModal open={configOpen} onOpenChange={setConfigOpen} title="Configurar financiamiento" sub="Define los meses e interés anual de cada opción. Se usarán en el Worksheet.">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[1, 2, 3].map((n) => (
            <div key={n} className="opt-block" style={{ marginTop: 0 }}>
              <div className="opt-head">
                <div><div className="opt-tag">Opción {n}</div><div className="opt-info">Meses e interés</div></div>
              </div>
              <div className="opt-body">
                <div className="opt-field"><label>Meses</label>
                  <input type="number" min={1} value={config[`wo${n}m`]} onChange={(e) => setConfig({ ...config, [`wo${n}m`]: e.target.value })} />
                </div>
                <div className="opt-field"><label>Interés anual %</label>
                  <input type="number" min={0} step={0.01} value={config[`wo${n}r`]} onChange={(e) => setConfig({ ...config, [`wo${n}r`]: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setConfigOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => { setConfigOpen(false); saveAll(); }}>Guardar</button>
        </div>
      </SalesModal>
      <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="worksheet" />
    </>
  );
}
