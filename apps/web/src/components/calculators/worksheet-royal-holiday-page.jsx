import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { useMonedaToolBucket } from "@/hooks/use-moneda-tool.js";
import { useFlushLibreToolOnLeave } from "@/hooks/use-flush-libre-tool-on-leave.js";
import { fetchSession } from "@/lib/session-api.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";
import {
  RH_EXTRA_DP_PLAZO_DIAS,
  extraDpFechaDentroPlazo,
  toDateStr,
  fechaLimiteExtraDp,
} from "@/lib/calculations/royal-holiday.js";
import { WorksheetRhFinancingPanel } from "@/components/calculators/worksheet-rh-financing-panel.jsx";
import { buildRhWorksheetState } from "@/lib/calculations/worksheet-rh-preview.js";
import { montoVentaWorksheet } from "@/lib/calculations/royal-holiday.js";
import {
  DEFAULT_RH_FORM,
  rhFormFromBucket,
  rhFormToBucket,
} from "@/lib/calculations/worksheet-rh-bucket.js";
import { markFieldsDirty } from "@/lib/collab-form-merge.js";
import { SelectorMoneda } from "@/components/currency/selector-moneda.jsx";
import { CampoMonedaCaptura } from "@/components/currency/campo-moneda-captura.jsx";
import {
  rhFormToOperational,
  rhMontoVentaOperational,
  switchRhFormCaptureCurrency,
} from "@/lib/currency/rh-form-currency.js";

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
  const { ready, backHref, readOnly, getBucket, saveBucket, isFileMode, toolsRevision } = session;
  const {
    captureCurrency,
    currencyMeta,
    currencyMetaSerialized,
    moneda,
    appendMonedaPayload,
    recordMoneyCapture,
    applyCaptureCurrency,
    refreshCurrencyMeta,
  } = useMonedaToolBucket({ getBucket, toolKey: "worksheet", ready, toolsRevision });
  const { fmtResult } = moneda;
  const [tab, setTab] = useState("financiamiento");
  const [empresaId, setEmpresaId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_RH_FORM });
  const dirtyKeysRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const skipAutosaveRef = useRef(true);

  const persistRhBucket = async () => {
    await saveBucket("worksheet", appendMonedaPayload(rhFormToBucket(form, tab)));
  };

  useFlushLibreToolOnLeave({
    enabled: ready && !isFileMode,
    tool: "worksheet",
    getSnapshot: () => appendMonedaPayload(rhFormToBucket(form, tab)),
    hasChanges: () => dirtyKeysRef.current.size > 0,
  });

  useEffect(() => {
    if (!ready) return;
    const restored = rhFormFromBucket(getBucket("worksheet"));
    if (restored) {
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        setForm(restored.form);
        setTab(restored.tab);
      } else if (dirtyKeysRef.current.size === 0) {
        setForm(restored.form);
        setTab(restored.tab);
      }
    } else if (!hydratedRef.current) {
      hydratedRef.current = true;
    }
    skipAutosaveRef.current = true;
  }, [ready, clientId, getBucket, shared?.prospectId, toolsRevision]);

  useEffect(() => {
    if (!ready || readOnly) return;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      void persistRhBucket();
    }, 700);
    return () => clearTimeout(timer);
  }, [form, tab, captureCurrency, currencyMetaSerialized, ready, readOnly]);

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
    const operationalMonto = rhMontoVentaOperational(form, captureCurrency, currencyMeta, moneda.ctx);
    const tmr = setTimeout(async () => {
      try {
        const p = await royalHolidayApi.preview(empresaId, {
          holiday_credits: form.holiday_credits,
          monto_venta: operationalMonto || undefined,
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
      } catch (err) {
        setPreview(null);
        if (import.meta.env.DEV) console.warn("[worksheet-rh] preview:", err?.message);
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
    captureCurrency,
    currencyMeta,
    moneda.ctx,
  ]);

  const operationalForm = useMemo(
    () => rhFormToOperational(form, captureCurrency, currencyMeta, moneda.ctx),
    [form, captureCurrency, currencyMeta, moneda.ctx],
  );

  const posicionesDisponibles = useMemo(() => {
    const fromCat = new Set((catalogo?.comisiones || []).map((c) => String(c.posicion).toLowerCase()));
    if (fromCat.size === 0) return POSICIONES.filter((p) => p !== "opc" && p !== "x");
    return POSICIONES.filter((p) => fromCat.has(p) || p === "opc" || p === "x");
  }, [catalogo]);

  const creditMatrix = useMemo(() => buildCreditMatrix(catalogo?.bottom_line), [catalogo]);
  const ws = useMemo(
    () => buildRhWorksheetState(catalogo, preview, operationalForm),
    [catalogo, preview, operationalForm],
  );
  const set = (key, value) => {
    markFieldsDirty(dirtyKeysRef, key);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const patchForm = (updater) => {
    markFieldsDirty(dirtyKeysRef, "__form");
    setForm(updater);
  };

  const setTabPersisted = (nextTab) => {
    markFieldsDirty(dirtyKeysRef, "__tab");
    setTab(nextTab);
  };

  const handleMoneyBlur = (key, formattedValue) => {
    set(key, formattedValue);
    recordMoneyCapture(key, formattedValue);
  };

  const handleValoresBlur = (index, formattedValue) => {
    markFieldsDirty(dirtyKeysRef, `valores_${index}`);
    patchForm((f) => {
      const next = [...f.valores];
      next[index] = formattedValue;
      return { ...f, valores: next, valor: index === 0 ? formattedValue : f.valor };
    });
    recordMoneyCapture(`valores_${index}`, formattedValue);
    if (index === 0) recordMoneyCapture("valor", formattedValue);
  };

  const handleCaptureCurrencyChange = (next) => {
    markFieldsDirty(dirtyKeysRef, "__captureCurrency");
    const { form: converted, meta } = switchRhFormCaptureCurrency(
      form,
      captureCurrency,
      next,
      moneda.ctx,
      moneda.language,
    );
    patchForm(() => converted);
    applyCaptureCurrency(next, meta);
  };

  const handleExchangeRateSaved = () => {
    refreshCurrencyMeta(form, moneda.ctx);
  };

  const bl = ws.bottom_line;
  const boardOnline = ws.board_online;
  const montoCapture = montoVentaWorksheet(form);
  const montoOperational = rhMontoVentaOperational(form, captureCurrency, currencyMeta, moneda.ctx);
  const blMonto = Number(bl?.precio_minimo_con_iva || boardOnline || 0);
  const blDifer = montoOperational && blMonto ? montoOperational - blMonto : null;
  const boardOk = ws.precio_ok;
  const regalosLista = ws.regalos;
  const maxDp = catalogo?.parametros?.max_extra_dp ?? 6;
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
      await persistRhBucket();
      await royalHolidayApi.saveVenta(empresaId, {
        empresa_id: empresaId,
        workspace_id: workspaceId,
        prospect_id: clientId || null,
        holiday_credits: form.holiday_credits,
        monto_venta: rhMontoVentaOperational(form, captureCurrency, currencyMeta, moneda.ctx) || undefined,
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
          enganche_plan: {
            hoy: form.enganche_hoy,
            num_pagos: form.enganche_num_pagos,
            pagos: form.enganche_pagos,
          },
          gasto_plan: {
            hoy: form.gasto_adm_hoy,
            num_pagos: form.gasto_num_pagos,
            pagos: form.gasto_pagos,
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
          <PageBack inline href={backHref} hasUnsavedChanges={() => dirtyKeysRef.current.size > 0} />
        </div>

        <nav className="admin-subnav worksheet-rh-tabs" aria-label="Pestañas worksheet">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`admin-subnav-item${tab === tb.id ? " active" : ""}`}
              onClick={() => setTabPersisted(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        {!empresaId && (
          <p className="muted">Activa un workspace de sala Royal Holiday para cargar el catálogo.</p>
        )}

        <fieldset className="shared-tool-fieldset" disabled={readOnly}>
        <SelectorMoneda
          value={captureCurrency}
          onChange={handleCaptureCurrencyChange}
          onRateSaved={handleExchangeRateSaved}
          disabled={readOnly}
          className="tool-moneda-selector"
        />

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
                  <div className="rh-bl-main">BL = <strong>{fmtResult(boardOnline ?? bl?.precio_minimo_con_iva ?? 0)}</strong>
                    {boardOk === true && <CheckCircle2 size={16} className="rh-ok" />}
                    {boardOk === false && <AlertTriangle size={16} className="rh-warn" />}
                  </div>
                  <ul className="rh-bl-list">
                    <li>Monto = <strong>{montoCapture ? moneda.fmtCaptureResult(montoCapture) : "—"}</strong></li>
                    <li>Difer = <strong className={blDifer != null && blDifer < 0 ? "rh-warn-text" : ""}>
                      {blDifer != null ? fmtResult(blDifer) : "—"}
                    </strong></li>
                    {bl?.precio_minimo_sin_iva != null && (
                      <li>BL sin IVA = <strong>{fmtResult(bl.precio_minimo_sin_iva)}</strong></li>
                    )}
                  </ul>
                </div>
                {ws.comision?.pendiente ? (
                  <p className="rh-warn-text rh-hint">{ws.comision.mensaje}</p>
                ) : ws.comision ? (
                  <p className="muted rh-hint">
                    Comisión {ws.comision.porcentaje}% → {fmtResult(ws.comision.monto)} · pago {ws.comision.fecha_pago}
                    {!ws.comision_enganche_exacto && ws.comision_enganche_tier != null
                      ? ` (tier enganche ${ws.comision_enganche_tier}%)`
                      : ""}
                  </p>
                ) : null}
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
                      <div className="flabel">{i + 1}</div>
                      <CampoMonedaCaptura
                        currency={captureCurrency}
                        value={v}
                        readOnly={readOnly}
                        onChange={(value) => {
                          markFieldsDirty(dirtyKeysRef, `valores_${i}`);
                          patchForm((f) => {
                            const next = [...f.valores];
                            next[i] = value;
                            return { ...f, valores: next, valor: i === 0 ? value : f.valor };
                          });
                        }}
                        onBlurCapture={() => handleValoresBlur(i, moneda.formatCapture(form.valores[i]))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card tool-calc-card">
                <div className="card-heading">Regalos</div>
                {!ws.regalos_filtrados_por_monto && regalosLista.length > 0 && (
                  <p className="muted rh-hint">Captura monto de venta para filtrar regalos por rango USD del catálogo.</p>
                )}
                <table className="client-table rh-mini-table">
                  <thead>
                    <tr><th>Venta</th><th>Closing/Sim</th></tr>
                  </thead>
                  <tbody>
                    {regalosLista.length === 0 && (
                      <tr><td colSpan={2} className="muted">Sin regalos en catálogo para esta venta</td></tr>
                    )}
                    {regalosLista.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <span>{g.nombre}{g.costo != null ? ` ($${g.costo})` : ""}</span>
                        </td>
                        <td>
                          <select
                            className="input input-compact"
                            disabled={readOnly}
                            value={form.regalosElegidos[g.id] || ""}
                            onChange={(e) => patchForm((f) => ({
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
          <WorksheetRhFinancingPanel
            form={form}
            set={set}
            setForm={patchForm}
            worksheetState={ws}
            catalogo={catalogo}
            readOnly={readOnly}
            captureCurrency={captureCurrency}
            montoOperational={montoOperational}
            moneda={moneda}
            onMoneyBlur={handleMoneyBlur}
            stacked={tab === "worksheet"}
          />
        )}
        </fieldset>

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
