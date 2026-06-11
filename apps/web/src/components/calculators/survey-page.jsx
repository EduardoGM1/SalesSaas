
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { SaveToolModal } from "@/components/calculators/save-tool-modal";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { computeSurvey } from "@/lib/calculations/survey";
import { resolveToolBackHref } from "@/lib/calculator-nav.js";
import { COUNTRY_CITY, COUNTRY_FLAGS } from "@/lib/constants";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatMoneyValue } from "@/lib/format/money";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useDbStore } from "@/stores/db-store";

const HIST = ["sh1", "sh2", "sh3"];
const FUT = ["sf1", "sf2", "sf3"];

const EMPTY_DATA: Record<string, string> = {
  nights: "", total: "", hpct: "",
  sh1c: "", sh1y: "", sh1n: "", sh1a: "",
  sh2c: "", sh2y: "", sh2n: "", sh2a: "",
  sh3c: "", sh3y: "", sh3n: "", sh3a: "",
  sf1c: "", sf1y: "", sf1n: "", sf1a: "",
  sf2c: "", sf2y: "", sf2n: "", sf2a: "",
  sf3c: "", sf3y: "", sf3n: "", sf3a: "",
  svp_name1: "", svp_name2: "", svp_country: "", svp_occ1: "", svp_occ2: "", svp_city: "",
};

interface SurveyPageProps {
  clientId?;
}

export function SurveyPage({ clientId }: SurveyPageProps) {
  const { t } = useI18n();
  const backHref = resolveToolBackHref(clientId);
  const { ready, mode } = useToolBucketReady(clientId);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const saveClient = useDbStore((s) => s.saveClient);
  const getClient = useDbStore((s) => s.getClient);
  const moneySettings = useDbStore((s) => s.db.settings);
  const { fmt, fmtD } = useMoney();

  const [data, setData] = useState<Record<string, string>>({ ...EMPTY_DATA });
  const [sType, setSType] = useState("hotel");
  const [futureType, setFutureType] = useState<"real" | "dream">("real");
  const [saved, setSaved] = useState(false);
  const [saveToolOpen, setSaveToolOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const bucket = getToolBucket("survey", mode, clientId);
    const loaded: Record<string, string> = { ...EMPTY_DATA };
    if (Object.keys(bucket).length) {
      Object.entries(bucket).forEach(([k, v]) => { loaded[k] = String(v); });
      if (bucket.stype) setSType(String(bucket.stype));
      if (bucket.futureType) setFutureType(bucket.futureType === "dream" ? "dream" : "real");
    }
    if (clientId) {
      const c = getClient(clientId);
      if (c) {
        loaded.svp_name1 = loaded.svp_name1 || c.name1 || c.name || "";
        loaded.svp_name2 = loaded.svp_name2 || c.name2 || "";
        loaded.svp_country = loaded.svp_country || c.country || "";
        loaded.svp_occ1 = loaded.svp_occ1 || c.occupation1 || "";
        loaded.svp_occ2 = loaded.svp_occ2 || c.occupation2 || "";
        loaded.svp_city = loaded.svp_city || c.city || "";
      }
    }
    setData(loaded);
  }, [ready, clientId, getToolBucket, getClient, mode]);

  const client = clientId ? getClient(clientId) : undefined;
  const pageCtx = clientId ? (clientDisplayName(client) || "Cliente") : "Calculadora libre";
  const countries = Object.keys(COUNTRY_CITY);
  const cities = COUNTRY_CITY[data.svp_country || ""] || ["Otro"];

  const result = useMemo(
    () => computeSurvey(data, sType),
    [data, sType, moneySettings?.currency, moneySettings?.exchangeRate, moneySettings?.language],
  );

  const syncProspectToClient = (next: Record<string, string>) => {
    if (!clientId) return;
    const c = getClient(clientId);
    if (!c) return;
    const name1 = next.svp_name1 || "";
    const name2 = next.svp_name2 || "";
    saveClient(ensureProspectIdentity({
      ...c,
      name1,
      name2,
      name: [name1, name2].filter(Boolean).join(" / ") || name1 || c.name || "Prospecto",
      country: next.svp_country || "",
      city: next.svp_city || "",
      occupation1: next.svp_occ1 || "",
      occupation2: next.svp_occ2 || "",
    }));
  };

  const update = (k, v) => {
    setData((d) => {
      const next = { ...d, [k]: v };
      if (k === "svp_country") next.svp_city = "";
      if (k.startsWith("svp_")) syncProspectToClient(next);
      return next;
    });
  };

  const handleSave = () => {
    saveToolBucket("survey", mode, { ...data, stype: sType, futureType }, clientId);
    if (clientId) syncProspectToClient(data);
    if (!clientId) { setSaveToolOpen(true); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleClear = () => {
    const cleared = { ...EMPTY_DATA };
    setData(cleared);
    setSType("hotel");
    setFutureType("real");
    if (ready) {
      saveToolBucket("survey", mode, { ...cleared, stype: "hotel", futureType: "real" }, clientId);
    }
  };

  return (
    <>
      <Topbar title="Survey" subtitle={clientId ? "Calculadora de viaje" : "Calculadora libre"} />
      <div className="sales-page">
        <div className="page-head tool-page-head">
          <div className="tool-page-head-main">
            <Link to={backHref} className="btn btn-ghost btn-sm">← {t("common.back")}</Link>
            <div className="tool-page-head-titles">
              <div className="page-title">Survey</div>
              <div className="page-sub">{pageCtx}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>{t("common.clear")}</button>
        </div>

        <div className={`card client-survey-prospect${clientId ? " show" : ""}`}>
          <div className="card-heading">Datos del prospecto</div>
          <div className="card-sub">Estos datos se sincronizan con la ficha del expediente.</div>
          <div className="client-survey-grid">
            <div className="client-survey-field left">
              <label>Nombre</label>
              <input type="text" id="svp-name1" placeholder="Nombre cliente" value={data.svp_name1 || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_name1", e.target.value)} />
            </div>
            <div className="client-survey-field center">
              <label>País</label>
              <select id="svp-country" value={data.svp_country || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_country", e.target.value)}>
                <option value="">Selecciona país</option>
                {countries.map((country) => (
                  <option key={country} value={country}>{COUNTRY_FLAGS[country] || "🌐"} {country}</option>
                ))}
                {data.svp_country && !countries.includes(data.svp_country) && (
                  <option value={data.svp_country}>{data.svp_country}</option>
                )}
              </select>
            </div>
            <div className="client-survey-field right">
              <label>Nombre</label>
              <input type="text" id="svp-name2" placeholder="Acompañante / copropietario" value={data.svp_name2 || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_name2", e.target.value)} />
            </div>
            <div className="client-survey-field left">
              <label>Ocupación</label>
              <input type="text" id="svp-occ1" placeholder="Ocupación cliente" value={data.svp_occ1 || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_occ1", e.target.value)} />
            </div>
            <div className="client-survey-field center">
              <label>Ciudad</label>
              <select id="svp-city" value={data.svp_city || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_city", e.target.value)}>
                <option value="">Selecciona ciudad</option>
                {cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
                {data.svp_city && !cities.includes(data.svp_city) && (
                  <option value={data.svp_city}>{data.svp_city}</option>
                )}
              </select>
            </div>
            <div className="client-survey-field right">
              <label>Ocupación</label>
              <input type="text" id="svp-occ2" placeholder="Ocupación acompañante" value={data.svp_occ2 || ""} onFocus={selectOnFocus} onChange={(e) => update("svp_occ2", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-heading">Tu viaje actual</div>
          <div className="card-sub">Lo que el cliente ya paga hoy</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
            <div>
              <div className="frow" style={{ paddingTop: 0, borderTop: "none" }}>
                <div className="flabel">Noches totales</div>
                <input type="number" id="sv-nights" min={1} style={{ width: 80 }} value={data.nights} onFocus={selectOnFocus} onChange={(e) => update("nights", e.target.value)} />
              </div>
              <div className="frow">
                <div className="flabel">Tipo de gasto</div>
                <div className="seg">
                  <button type="button" className={`seg-btn${sType === "hotel" ? " on" : ""}`} onClick={() => setSType("hotel")}>Solo hotel</button>
                  <button type="button" className={`seg-btn${sType === "paquete" ? " on" : ""}`} onClick={() => setSType("paquete")}>Hotel + vuelo</button>
                </div>
              </div>
              <div className="frow">
                <div className="flabel">Total pagado</div>
                <div className="mfield">
                  <span className="mpfx">$</span>
                  <input type="text" id="sv-total" value={data.total} onFocus={selectOnFocus} onChange={(e) => update("total", e.target.value)} onBlur={(e) => update("total", formatMoneyValue(e.target.value))} />
                </div>
              </div>
              <div id="sv-split" style={{ display: sType === "paquete" ? "block" : "none" }}>
                <div className="frow">
                  <div className="flabel">% Hotel</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" id="sv-hpct" min={1} max={99} style={{ width: 65 }} value={data.hpct} onFocus={selectOnFocus} onChange={(e) => update("hpct", e.target.value)} />
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>%</span>
                  </div>
                </div>
                <div className="g2" style={{ marginTop: 10 }}>
                  <div className="vbox blue"><div className="vbox-val">{fmt(result.split.hval)}</div><div className="vbox-label">Hotel ({result.split.hpct}%)</div></div>
                  <div className="vbox blue"><div className="vbox-val">{fmt(result.split.vval)}</div><div className="vbox-label">Vuelo ({100 - result.split.hpct}%)</div></div>
                </div>
              </div>
            </div>
            <div className="g2">
              <div className="vbox blue">
                <div className="vbox-val">{fmt(result.trip.dp)}</div>
                <div className="vbox-label">Enganche sugerido</div>
                <div className="vbox-sub">Igual a lo pagado</div>
              </div>
              <div className="vbox green">
                <div className="vbox-val">{fmt(result.trip.mi)}</div>
                <div className="vbox-label">Mensualidad ideal</div>
                <div className="vbox-sub">Pagado ÷ 12</div>
              </div>
            </div>
          </div>
        </div>

        <div className="g2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="card-heading">Últimas 3 vacaciones</div>
            <div className="card-sub">¿Cuáles fueron tus últimas 3 vacaciones?</div>
            <table className="mtbl">
              <thead><tr><th>Destino</th><th>Año</th><th>Noches</th><th>Monto</th></tr></thead>
              <tbody>
                {HIST.map((p) => (
                  <tr key={p}>
                    <td><input type="text" value={data[`${p}c`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}c`, e.target.value)} /></td>
                    <td className="nc"><input type="number" value={data[`${p}y`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}y`, e.target.value)} /></td>
                    <td className="nc"><input type="number" value={data[`${p}n`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}n`, e.target.value)} /></td>
                    <td className="mc">
                      <div className="mfield"><span className="mpfx">$</span>
                        <input type="text" value={data[`${p}a`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}a`, e.target.value)} onBlur={(e) => update(`${p}a`, formatMoneyValue(e.target.value))} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>TOTALES</td>
                  <td>{result.hist.nights}</td>
                  <td>{fmt(result.hist.spend)}</td>
                </tr>
              </tbody>
            </table>
            <div className="g2" style={{ marginTop: 14 }}>
              <div className="vbox blue">
                <div className="vbox-val">{fmt(result.hist.dp)}</div>
                <div className="vbox-label">Enganche sugerido</div>
                <div className="vbox-sub">Promedio de las 3</div>
              </div>
              <div className="vbox green">
                <div className="vbox-val">{fmt(result.hist.mi)}</div>
                <div className="vbox-label">Mensualidad ideal</div>
                <div className="vbox-sub">Promedio ÷ 12</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 4 }}>
              <div>
                <div className="card-heading" style={{ marginBottom: 4 }}>Futuras 3 vacaciones</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>¿A qué lugares vas a viajar en los siguientes años?</div>
              </div>
              <div className="choice-row" aria-label="Tipo de viaje futuro">
                <label className={`choice-pill${futureType === "real" ? " on" : ""}`} id="sf-real-pill">
                  <input type="checkbox" id="sf-real" checked={futureType === "real"} onChange={() => setFutureType("real")} /> Viajes reales
                </label>
                <label className={`choice-pill${futureType === "dream" ? " on" : ""}`} id="sf-dream-pill">
                  <input type="checkbox" id="sf-dream" checked={futureType === "dream"} onChange={() => setFutureType("dream")} /> Viajes de sueño
                </label>
              </div>
            </div>
            <table className="mtbl">
              <thead><tr><th>Destino</th><th>Año</th><th>Noches</th><th>Costo</th></tr></thead>
              <tbody>
                {FUT.map((p) => (
                  <tr key={p}>
                    <td><input type="text" value={data[`${p}c`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}c`, e.target.value)} /></td>
                    <td className="nc"><input type="number" value={data[`${p}y`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}y`, e.target.value)} /></td>
                    <td className="nc"><input type="number" value={data[`${p}n`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}n`, e.target.value)} /></td>
                    <td className="mc">
                      <div className="mfield"><span className="mpfx">$</span>
                        <input type="text" placeholder="0" value={data[`${p}a`]} onFocus={selectOnFocus} onChange={(e) => update(`${p}a`, e.target.value)} onBlur={(e) => update(`${p}a`, formatMoneyValue(e.target.value))} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="trow">
                  <td colSpan={2} style={{ color: "var(--muted2)", fontSize: 10 }}>TOTALES</td>
                  <td>{result.future.nights}</td>
                  <td>{fmt(result.future.spend)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14 }}>
              <div className="vbox yellow">
                <div className="vbox-val">{fmt(result.future.spend)}</div>
                <div className="vbox-label">Total a gastar en las 3 futuras</div>
              </div>
            </div>
          </div>
        </div>

        {!clientId && (
          <div className="card" id="sv-pattern-card">
            <div className="card-heading">Patrón de vacaciones</div>
            <div className="card-sub">Patrones encontrados</div>
            <table className="dtbl pattern-table">
              <thead>
                <tr>
                  <th>Fuente</th>
                  <th className="td-r">Vacaciones al año</th>
                  <th className="td-r">Noches al año</th>
                  <th className="td-r">Enganche</th>
                  <th className="td-r">Mensualidad</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Viaje actual</td>
                  <td className="td-r td-blue">{result.current.vac}</td>
                  <td className="td-r td-blue">{fmtD(result.current.night)}</td>
                  <td className="td-r td-blue">{fmt(result.current.dp)}</td>
                  <td className="td-r td-green">{fmt(result.current.mi)}</td>
                </tr>
                <tr>
                  <td>Histórico</td>
                  <td className="td-r td-blue">{fmtD(result.hist.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.hist.night)}</td>
                  <td className="td-r td-blue">{fmt(result.hist.dp)}</td>
                  <td className="td-r td-green">{fmt(result.hist.mi)}</td>
                </tr>
                <tr>
                  <td>Viajes futuros</td>
                  <td className="td-r td-blue">{fmtD(result.future.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.future.night)}</td>
                  <td className="td-r td-blue">{fmt(result.future.dp)}</td>
                  <td className="td-r td-green">{fmt(result.future.mi)}</td>
                </tr>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td>Patrones</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.vac)}</td>
                  <td className="td-r td-blue">{fmtD(result.pattern.night)}</td>
                  <td className="td-r td-blue">{fmt(result.pattern.dp)}</td>
                  <td className="td-r td-green">{fmt(result.pattern.mi)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="save-footer">
          <span className={`save-confirm${saved ? " show" : ""}`}>Guardado</span>
          <button type="button" className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </div>
      <SaveToolModal open={saveToolOpen} onOpenChange={setSaveToolOpen} tool="survey" />
    </>
  );
}
