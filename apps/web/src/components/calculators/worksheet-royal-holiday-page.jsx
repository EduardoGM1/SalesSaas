import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { fetchSession } from "@/lib/session-api.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";
import {
  RH_EXTRA_DP_PLAZO_DIAS,
  extraDpFechaDentroPlazo,
  toDateStr,
  fechaLimiteExtraDp,
} from "@/lib/calculations/royal-holiday.js";

const TABS = [
  { id: "financiamiento", label: "Datos Financiamiento" },
  { id: "venta", label: "Datos Venta" },
  { id: "resumen", label: "Resumen", placeholder: true },
  { id: "prevlo", label: "Pre VLO", placeholder: true },
  { id: "worksheet", label: "Worksheet" },
];

const POSICIONES = ["liner", "closer", "ftb", "opc", "x"];
const CREDIT_ROWS = ["Alta", "Media", "Baja"];
const CREDIT_COLS = ["N.1", "N.2", "N.3"];

function fmtNum(v) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : String(v);
}

function ExtraTable({ title, rows, onChange, max, onAdd, readOnly }) {
  return (
    <div className="rh-extra-table">
      <div className="rh-extra-table-head">
        <span className="flabel">{title}</span>
        {!readOnly && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length >= max} onClick={onAdd}>
            + Extra
          </button>
        )}
      </div>
      <table className="client-table rh-mini-table">
        <thead>
          <tr>
            <th>% Extra</th>
            <th>Fecha</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={3} className="muted">Sin extras</td></tr>
          )}
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td>
                <input
                  type="number"
                  className="input input-compact"
                  disabled={readOnly}
                  value={row.porcentaje}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...next[idx], porcentaje: e.target.value };
                    onChange(next);
                  }}
                />
              </td>
              <td>
                <input
                  type="date"
                  className="input input-compact"
                  disabled={readOnly}
                  value={row.fecha}
                  onChange={(e) => {
                    const next = [...rows];
                    next[idx] = { ...next[idx], fecha: e.target.value };
                    onChange(next);
                  }}
                />
              </td>
              <td>
                {!readOnly && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted rh-hint">Máximo {max} (catálogo).</p>
    </div>
  );
}

/** Agrupa bottom_line en matriz 3×3 (N.1–N.3 × Alta/Media/Baja) por HC. */
function buildCreditMatrix(bottomLine) {
  const sorted = [...(bottomLine || [])].sort((a, b) => Number(a.holiday_credits) - Number(b.holiday_credits));
  const matrix = CREDIT_ROWS.map(() => CREDIT_COLS.map(() => null));
  sorted.slice(0, 9).forEach((row, i) => {
    const r = Math.floor(i / 3);
    const c = i % 3;
    if (r < 3 && c < 3) matrix[r][c] = row;
  });
  return matrix;
}

export function WorksheetRoyalHolidayPage({ clientId, shared }) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "worksheet" });
  const { ready, backHref, readOnly } = session;
  const [tab, setTab] = useState("venta");
  const [empresaId, setEmpresaId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    holiday_credits: "10000",
    valor: "",
    valores: ["", "", "", ""],
    epvFvi: ["", "", "", "", ""],
    posicion: "ftb",
    monto_venta: "",
    enganche_pct: "15",
    enganche_hoy: "",
    gasto_adm_hoy: "",
    nacionalidad: "mexicano",
    plazo_meses: "",
    costo_administrativo_usd: "",
    regalosElegidos: {},
    extrasDp: [],
    extrasCc: [],
    opc: "",
    liner: "",
    closer1: "",
    closer2: "",
    exit: "",
    tarjeta_inmex: "",
    tarjeta_rci: "",
    tarjeta_inmex_on: false,
    tarjeta_rci_on: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await fetchSession();
      const ws = s?.workspace_activo || s?.profile?.workspace_activo;
      const eid = ws?.empresa_id;
      const wid = ws?.id || s?.workspace_activo_id || s?.profile?.workspace_activo_id;
      if (cancelled) return;
      setEmpresaId(eid || null);
      setWorkspaceId(wid || null);
      if (eid) {
        try {
          const cat = await royalHolidayApi.getCatalogo(eid);
          if (!cancelled) setCatalogo(cat);
        } catch (err) {
          toast.error(err.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    const tmr = setTimeout(async () => {
      try {
        const p = await royalHolidayApi.preview(empresaId, {
          holiday_credits: form.holiday_credits,
          monto_venta: form.monto_venta || form.valor || form.valores.find(Boolean),
          enganche_pct: form.enganche_pct,
          posicion: form.posicion,
          nacionalidad: form.nacionalidad,
          plazo_meses: form.plazo_meses || undefined,
          costo_administrativo_usd: form.costo_administrativo_usd || undefined,
        });
        setPreview(p);
        if (!form.costo_administrativo_usd && p.costo_administrativo_usd != null) {
          setForm((f) => ({ ...f, costo_administrativo_usd: String(p.costo_administrativo_usd) }));
        }
      } catch {
        setPreview(null);
      }
    }, 280);
    return () => clearTimeout(tmr);
  }, [
    empresaId,
    form.holiday_credits,
    form.monto_venta,
    form.valor,
    form.valores,
    form.enganche_pct,
    form.posicion,
    form.nacionalidad,
    form.plazo_meses,
    form.costo_administrativo_usd,
  ]);

  const posicionesDisponibles = useMemo(() => {
    const fromCat = new Set((catalogo?.comisiones || []).map((c) => String(c.posicion).toLowerCase()));
    if (fromCat.size === 0) return POSICIONES.filter((p) => p !== "opc" && p !== "x");
    return POSICIONES.filter((p) => fromCat.has(p) || p === "opc" || p === "x");
  }, [catalogo]);

  const creditMatrix = useMemo(() => buildCreditMatrix(catalogo?.bottom_line), [catalogo]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const bl = preview?.bottom_line;
  const boardOnline = preview?.board_online;
  const monto = Number(form.monto_venta || form.valor || 0);
  const blMonto = Number(bl?.precio_minimo_con_iva || boardOnline || 0);
  const blDifer = monto && blMonto ? monto - blMonto : null;
  const boardOk = preview?.precio_ok;
  const maxDp = catalogo?.parametros?.max_extra_dp ?? 6;
  const maxCc = catalogo?.parametros?.max_extra_cc ?? 6;
  const adminOptions = (catalogo?.costo_administrativo || []).map((c) => c.monto_usd);
  const tarjetas = catalogo?.parametros?.tarjetas_internas || ["Invex", "RCI"];
  const fechaVentaRef = toDateStr(new Date());
  const extraDpLimite = fechaLimiteExtraDp(fechaVentaRef);

  const save = async () => {
    if (!empresaId || !workspaceId || readOnly) return;
    if (form.extrasDp.length > maxDp) {
      toast.error(`Máximo ${maxDp} Extra DP permitidos.`);
      return;
    }
    for (const ex of form.extrasDp) {
      if (!extraDpFechaDentroPlazo(ex.fecha, fechaVentaRef)) {
        toast.error(
          `Extra DP: la fecha debe estar dentro de ${RH_EXTRA_DP_PLAZO_DIAS} días desde hoy (límite ${extraDpLimite ? toDateStr(extraDpLimite) : "—"}).`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      const regalos = Object.entries(form.regalosElegidos)
        .filter(([, carga]) => carga)
        .map(([id, carga]) => ({ id, carga }));
      const extras = [
        ...form.extrasDp.map((e) => ({ tipo: "extra_dp", porcentaje: e.porcentaje, fecha: e.fecha })),
        ...form.extrasCc.map((e) => ({ tipo: "extra_cc", porcentaje: e.porcentaje, fecha: e.fecha })),
      ];
      await royalHolidayApi.saveVenta(empresaId, {
        empresa_id: empresaId,
        workspace_id: workspaceId,
        prospect_id: clientId || null,
        holiday_credits: form.holiday_credits,
        monto_venta: form.monto_venta || form.valor || form.valores.find(Boolean),
        enganche_pct: form.enganche_pct,
        posicion: form.posicion,
        nacionalidad: form.nacionalidad,
        plazo_meses: form.plazo_meses || null,
        costo_administrativo_usd: form.costo_administrativo_usd,
        regalos,
        extras,
        allow_pending_commission: true,
        meta: {
          epv_fvi: form.epvFvi,
          valores: form.valores,
          roles: { opc: form.opc, liner: form.liner, closer1: form.closer1, closer2: form.closer2, exit: form.exit },
          tarjetas: {
            inmex: form.tarjeta_inmex_on ? form.tarjeta_inmex : null,
            rci: form.tarjeta_rci_on ? form.tarjeta_rci : null,
          },
        },
      });
      toast.success("Venta Royal Holiday guardada");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="sales-page" style={{ padding: 24 }}>{t("common.loading") || "Cargando…"}</div>;
  }

  const showVenta = tab === "venta" || tab === "worksheet";
  const showFin = tab === "financiamiento" || tab === "worksheet";

  return (
    <>
      <Topbar title="Worksheet · Royal Holiday" subtitle="Sala Royal Holiday" />
      <div className={`sales-page tool-calc-page worksheet-rh${!readOnly ? " tool-calc-page--with-save" : ""}`}>
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} />
        </div>

        <nav className="admin-subnav worksheet-rh-tabs" aria-label="Pestañas worksheet">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`admin-subnav-item${tab === tb.id ? " active" : ""}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        {!empresaId && (
          <p className="muted">Activa un workspace de sala Royal Holiday para cargar el catálogo.</p>
        )}

        {(tab === "resumen" || tab === "prevlo") && (
          <div className="card tool-calc-card">
            <div className="card-heading">{tab === "resumen" ? "Resumen" : "Pre VLO"}</div>
            <p className="muted">Próxima iteración — pestaña placeholder sin funcionalidad aún.</p>
          </div>
        )}

        {showVenta && (
          <section className="worksheet-rh-venta">
            <div className="worksheet-rh-row3">
              <div className="card tool-calc-card">
                <div className="card-heading">Programa</div>
                <div className="tool-calc-fields">
                  <div className="frow tool-frow">
                    <div className="flabel">Puntos</div>
                    <input
                      className="input tool-num-input"
                      type="number"
                      disabled={readOnly}
                      value={form.holiday_credits}
                      onChange={(e) => set("holiday_credits", e.target.value)}
                    />
                  </div>
                  <div className="frow tool-frow">
                    <div className="flabel">Cuota anual</div>
                    <div className="vbox-val rh-readonly">{fmtNum(bl?.cuota_anual_mfee)}</div>
                  </div>
                  {bl?.programa && (
                    <p className="muted rh-hint">Programa: {bl.programa}</p>
                  )}
                </div>
              </div>

              <div className="card tool-calc-card">
                <div className="card-heading">Créditos</div>
                <table className="client-table rh-credit-matrix">
                  <thead>
                    <tr>
                      <th />
                      {CREDIT_COLS.map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {CREDIT_ROWS.map((rowLabel, ri) => (
                      <tr key={rowLabel}>
                        <th scope="row">{ri + 1}-{rowLabel}</th>
                        {CREDIT_COLS.map((col, ci) => {
                          const cell = creditMatrix[ri][ci];
                          const hc = cell ? String(cell.holiday_credits) : "";
                          const selected = hc && hc === String(form.holiday_credits);
                          return (
                            <td key={col}>
                              <button
                                type="button"
                                className={`rh-matrix-cell${selected ? " selected" : ""}`}
                                disabled={readOnly || !cell}
                                onClick={() => cell && set("holiday_credits", String(cell.holiday_credits))}
                                title={cell ? `${cell.programa} · ${cell.holiday_credits} HC` : "Sin dato"}
                              >
                                {cell ? Number(cell.holiday_credits).toLocaleString("es-MX") : "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card tool-calc-card">
                <div className="card-heading">Bottom Line</div>
                <div className="rh-bl-box">
                  <div className="rh-bl-main">BL = <strong>{fmtNum(boardOnline ?? bl?.precio_minimo_con_iva)}</strong>
                    {boardOk === true && <CheckCircle2 size={16} className="rh-ok" />}
                    {boardOk === false && <AlertTriangle size={16} className="rh-warn" />}
                  </div>
                  <ul className="rh-bl-list">
                    <li>Monto = <strong>{fmtNum(monto || null)}</strong></li>
                    <li>Difer = <strong className={blDifer != null && blDifer < 0 ? "rh-warn-text" : ""}>{fmtNum(blDifer)}</strong></li>
                  </ul>
                </div>
                <div className="frow tool-frow" style={{ marginTop: 10 }}>
                  <div className="flabel">Posición</div>
                  <select className="input" disabled={readOnly} value={form.posicion} onChange={(e) => set("posicion", e.target.value)}>
                    {posicionesDisponibles.map((p) => (
                      <option key={p} value={p} disabled={p === "opc" || p === "x"}>
                        {p.toUpperCase()}{p === "opc" || p === "x" ? " (pendiente catálogo)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="worksheet-rh-row3">
              <div className="card tool-calc-card">
                <div className="card-heading">EPV – FVI</div>
                <div className="tool-calc-fields">
                  {form.epvFvi.map((v, i) => (
                    <div className="frow tool-frow" key={i}>
                      <div className="flabel">{i + 1}</div>
                      <select
                        className="input"
                        disabled={readOnly}
                        value={v}
                        onChange={(e) => {
                          const next = [...form.epvFvi];
                          next[i] = e.target.value;
                          set("epvFvi", next);
                        }}
                      >
                        <option value="">—</option>
                        {posicionesDisponibles.map((p) => (
                          <option key={p} value={p}>{p.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card tool-calc-card">
                <div className="card-heading">Valor</div>
                <div className="tool-calc-fields">
                  {form.valores.map((v, i) => (
                    <div className="frow tool-frow" key={i}>
                      <div className="flabel">$</div>
                      <input
                        className="input tool-num-input"
                        type="number"
                        disabled={readOnly}
                        value={v}
                        onChange={(e) => {
                          const next = [...form.valores];
                          next[i] = e.target.value;
                          set("valores", next);
                          if (i === 0) set("valor", e.target.value);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card tool-calc-card">
                <div className="card-heading">Regalos</div>
                <table className="client-table rh-mini-table">
                  <thead>
                    <tr><th>Venta</th><th>Closing/Sim</th></tr>
                  </thead>
                  <tbody>
                    {(preview?.regalos || catalogo?.regalos || []).length === 0 && (
                      <tr><td colSpan={2} className="muted">Sin regalos en catálogo</td></tr>
                    )}
                    {(preview?.regalos || catalogo?.regalos || []).map((g) => (
                      <tr key={g.id}>
                        <td>
                          <span>{g.nombre}{g.costo != null ? ` ($${g.costo})` : ""}</span>
                        </td>
                        <td>
                          <select
                            className="input input-compact"
                            disabled={readOnly}
                            value={form.regalosElegidos[g.id] || ""}
                            onChange={(e) => setForm((f) => ({
                              ...f,
                              regalosElegidos: { ...f.regalosElegidos, [g.id]: e.target.value },
                            }))}
                          >
                            <option value="">—</option>
                            {(g.cargas_permitidas || []).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card tool-calc-card worksheet-rh-roles">
              <div className="card-heading">Equipo</div>
              <div className="worksheet-rh-roles-grid">
                {[
                  ["opc", "OPC"],
                  ["liner", "Liner"],
                  ["closer1", "Closer 1"],
                  ["closer2", "Closer 2"],
                  ["exit", "Exit"],
                ].map(([key, label]) => (
                  <div className="frow tool-frow" key={key}>
                    <div className="flabel">{label}</div>
                    <input
                      className="input"
                      disabled={readOnly}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder="Nombre"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {showFin && (
          <section className={`worksheet-rh-fin${tab === "worksheet" ? " worksheet-rh-fin--stacked" : ""}`}>
            <div className="worksheet-rh-fin-grid">
              <div className="card tool-calc-card">
                <div className="card-heading">Monto venta</div>
                <div className="tool-calc-fields">
                  <div className="frow tool-frow">
                    <div className="flabel">Monto venta</div>
                    <input className="input tool-num-input" type="number" disabled={readOnly}
                      value={form.monto_venta} onChange={(e) => set("monto_venta", e.target.value)} />
                  </div>
                  <div className="frow tool-frow">
                    <div className="flabel">Enganche %</div>
                    <div className="frow-inline">
                      <input className="input tool-num-input" type="number" disabled={readOnly}
                        value={form.enganche_pct} onChange={(e) => set("enganche_pct", e.target.value)} />
                      <span className="frow-suffix">%</span>
                    </div>
                  </div>
                  <div className="frow tool-frow">
                    <div className="flabel">Hoy =</div>
                    <input className="input tool-num-input" type="number" disabled={readOnly}
                      value={form.enganche_hoy} onChange={(e) => set("enganche_hoy", e.target.value)}
                      placeholder={preview?.totales?.enganche != null ? String(preview.totales.enganche) : ""} />
                  </div>
                </div>
                <ExtraTable
                  title="(+) Extra DP"
                  rows={form.extrasDp}
                  max={maxDp}
                  readOnly={readOnly}
                  onChange={(rows) => set("extrasDp", rows)}
                  onAdd={() => set("extrasDp", [...form.extrasDp, { porcentaje: "10", fecha: new Date().toISOString().slice(0, 10) }])}
                />
                <p className="muted rh-hint">
                  Extra DP: máximo {maxDp} y fecha dentro de {RH_EXTRA_DP_PLAZO_DIAS} días desde la venta
                  {extraDpLimite ? ` (hasta ${toDateStr(extraDpLimite)})` : ""}. Pasado ese plazo sin cobrar, no aplica diferencial de comisión.
                </p>
                <div className="tool-calc-fields" style={{ marginTop: 12 }}>
                  <div className="frow tool-frow">
                    <div className="flabel">Gasto Adm.</div>
                    <select className="input" disabled={readOnly} value={form.costo_administrativo_usd}
                      onChange={(e) => set("costo_administrativo_usd", e.target.value)}>
                      {adminOptions.length === 0 && <option value="">—</option>}
                      {adminOptions.map((m) => (
                        <option key={m} value={m}>{m} USD</option>
                      ))}
                    </select>
                  </div>
                  <div className="frow tool-frow">
                    <div className="flabel">Hoy =</div>
                    <input className="input tool-num-input" type="number" disabled={readOnly}
                      value={form.gasto_adm_hoy} onChange={(e) => set("gasto_adm_hoy", e.target.value)} />
                  </div>
                </div>
                <ExtraTable
                  title="(+) Extra CC"
                  rows={form.extrasCc}
                  max={maxCc}
                  readOnly={readOnly}
                  onChange={(rows) => set("extrasCc", rows)}
                  onAdd={() => set("extrasCc", [...form.extrasCc, { porcentaje: "10", fecha: new Date().toISOString().slice(0, 10) }])}
                />
                <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
                  <div className="vbox blue">
                    <div className="vbox-val">{fmtNum(preview?.totales?.enganche)}</div>
                    <div className="vbox-label">Enganche</div>
                  </div>
                  <div className="vbox green">
                    <div className="vbox-val">{fmtNum(preview?.totales?.engancheMasAdmin)}</div>
                    <div className="vbox-label">Enganche + Gast</div>
                  </div>
                  <div className="vbox yellow span2">
                    <div className="vbox-val">{fmtNum(preview?.totales?.balanceAFinanciar)}</div>
                    <div className="vbox-label">Balance</div>
                  </div>
                </div>
                <p className="muted rh-hint">Costo admin: 750 USD (enganche ≥15%), 950 USD (enganche ≥27.5%).</p>
              </div>

              <div className="worksheet-rh-fin-right">
                <div className="card tool-calc-card">
                  <div className="card-heading">Financiamiento = {form.nacionalidad === "mexicano" ? "MEX" : form.nacionalidad === "argentino" ? "ARG" : "RESTO"}</div>
                  <div className="frow tool-frow">
                    <div className="flabel">Nacionalidad</div>
                    <select className="input" disabled={readOnly} value={form.nacionalidad}
                      onChange={(e) => set("nacionalidad", e.target.value)}>
                      <option value="mexicano">Mexicano</option>
                      <option value="argentino">Argentino</option>
                      <option value="resto">Resto del mundo</option>
                    </select>
                  </div>
                  <div className="rh-plazo-grid">
                    {(preview?.plazos || []).map((p) => (
                      <label key={p.plazo_meses} className={`rh-plazo-item${String(form.plazo_meses) === String(p.plazo_meses) ? " selected" : ""}`}>
                        <input
                          type="radio"
                          name="plazo-rh"
                          disabled={readOnly}
                          checked={String(form.plazo_meses) === String(p.plazo_meses)}
                          onChange={() => set("plazo_meses", String(p.plazo_meses))}
                        />
                        <span>{p.plazo_meses} meses</span>
                      </label>
                    ))}
                    {!preview?.plazos?.length && <span className="muted">Sin plazos para esta combinación.</span>}
                  </div>
                  <div className="tool-calc-fields" style={{ marginTop: 12 }}>
                    <div className="frow tool-frow">
                      <div className="flabel">Selección</div>
                      <div className="vbox-val rh-readonly">{form.plazo_meses ? `${form.plazo_meses} m` : "—"}</div>
                    </div>
                    <div className="frow tool-frow">
                      <div className="flabel">Enganche</div>
                      <div className="vbox-val rh-readonly">{fmtNum(preview?.totales?.enganche)}</div>
                    </div>
                    {preview?.mensualidad != null && (
                      <div className="frow tool-frow">
                        <div className="flabel">Mensualidad</div>
                        <div className="vbox-val rh-readonly">{fmtNum(preview.mensualidad)}</div>
                      </div>
                    )}
                  </div>
                  {preview?.comision?.pendiente ? (
                    <p className="rh-warn-text">{preview.comision.mensaje}</p>
                  ) : preview?.comision ? (
                    <p className="muted rh-hint">
                      Comisión {preview.comision.porcentaje}% → {fmtNum(preview.comision.monto)} · pago {preview.comision.fecha_pago}
                    </p>
                  ) : null}
                </div>

                <div className="card tool-calc-card">
                  <div className="card-heading">Tarjetas para financiamiento</div>
                  <div className="tool-calc-fields">
                    <label className="rh-card-check">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={form.tarjeta_inmex_on}
                        onChange={(e) => set("tarjeta_inmex_on", e.target.checked)}
                      />
                      <span>{tarjetas[0] || "INMEX"}</span>
                      <input
                        className="input tool-num-input"
                        type="number"
                        disabled={readOnly || !form.tarjeta_inmex_on}
                        value={form.tarjeta_inmex}
                        onChange={(e) => set("tarjeta_inmex", e.target.value)}
                        placeholder="Monto"
                      />
                    </label>
                    <label className="rh-card-check">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={form.tarjeta_rci_on}
                        onChange={(e) => set("tarjeta_rci_on", e.target.checked)}
                      />
                      <span>{tarjetas[1] || "RCI"}</span>
                      <input
                        className="input tool-num-input"
                        type="number"
                        disabled={readOnly || !form.tarjeta_rci_on}
                        value={form.tarjeta_rci}
                        onChange={(e) => set("tarjeta_rci", e.target.value)}
                        placeholder="Monto"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!readOnly && tab !== "resumen" && tab !== "prevlo" && (
          <div className="save-footer tool-save-footer">
            <button type="button" className="btn btn-primary" disabled={saving || !empresaId} onClick={save}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
