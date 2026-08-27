import { useEffect, useMemo, useRef, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
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
import { WorksheetRhVentaPanel } from "@/components/calculators/worksheet-rh-venta-panel.jsx";
import { WorksheetRhHojaPanel } from "@/components/calculators/worksheet-rh-hoja-panel.jsx";
import { WorksheetRhMoneyBoxPanel } from "@/components/calculators/worksheet-rh-money-box-panel.jsx";
import { useFlag } from "@/hooks/use-flag.js";
import { WORKSHEET_RH_MONEY_BOX_TAB_FLAG } from "@/lib/auth/tool-flags.js";
import { useDbStore } from "@/stores/db-store";
import { buildRhWorksheetState } from "@/lib/calculations/worksheet-rh-preview.js";
import { montoVentaWorksheet } from "@/lib/calculations/royal-holiday.js";
import {
  DEFAULT_RH_FORM,
  rhFormFromBucket,
  rhFormToBucket,
} from "@/lib/calculations/worksheet-rh-bucket.js";
import { markFieldsDirty } from "@/lib/collab-form-merge.js";
import { SelectorMoneda } from "@/components/currency/selector-moneda.jsx";
import {
  rhFormToOperational,
  rhMontoVentaOperational,
  switchRhFormCaptureCurrency,
} from "@/lib/currency/rh-form-currency.js";
import { resolveOperationalAmount } from "@/lib/currency/moneda-service";
import { WorksheetRhSkeleton } from "@/components/ui/content-skeleton.jsx";

const TABS = [
  { id: "financiamiento", label: "Datos Financiamiento" },
  { id: "venta", label: "Datos Venta" },
  { id: "moneybox", label: "Money Box", flagKey: WORKSHEET_RH_MONEY_BOX_TAB_FLAG },
  { id: "resumen", label: "Resumen", placeholder: true },
  { id: "prevlo", label: "Pre VLO", placeholder: true },
  { id: "worksheet", label: "Worksheet" },
];

const POSICIONES = ["liner", "closer", "ftb", "opc", "x"];

export function WorksheetRoyalHolidayPage({ clientId, shared }) {
  const getClient = useDbStore((s) => s.getClient);
  const client = clientId ? getClient(clientId) : null;
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
    const balanceAnterior = String(form.monto_pendiente ?? "").trim() !== ""
      ? resolveOperationalAmount(form.monto_pendiente, currencyMeta?.monto_pendiente, captureCurrency, moneda.ctx)
      : 0;
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
          balance_anterior: balanceAnterior || undefined,
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
    form.monto_pendiente,
    captureCurrency,
    currencyMeta,
    moneda.ctx,
  ]);

  const operationalForm = useMemo(
    () => rhFormToOperational(form, captureCurrency, currencyMeta, moneda.ctx),
    [form, captureCurrency, currencyMeta, moneda.ctx],
  );

  const moneyBoxFlag = useFlag(WORKSHEET_RH_MONEY_BOX_TAB_FLAG);

  const visibleTabs = useMemo(() => TABS.filter((tb) => {
    if (!tb.flagKey) return true;
    if (!moneyBoxFlag.hasCatalog) return false;
    return moneyBoxFlag.enabled;
  }), [moneyBoxFlag.hasCatalog, moneyBoxFlag.enabled]);

  useEffect(() => {
    if (!visibleTabs.some((tb) => tb.id === tab)) {
      setTab(visibleTabs[0]?.id || "financiamiento");
    }
  }, [visibleTabs, tab]);

  const posicionesDisponibles = useMemo(() => {
    const fromCat = new Set((catalogo?.comisiones || []).map((c) => String(c.posicion).toLowerCase()));
    if (fromCat.size === 0) return POSICIONES.filter((p) => p !== "opc" && p !== "x");
    return POSICIONES.filter((p) => fromCat.has(p) || p === "opc" || p === "x");
  }, [catalogo]);

  const ws = useMemo(
    () => buildRhWorksheetState(catalogo, preview, operationalForm, {
      mxnToUsd: (n) => moneda.convertir(n, "MXN", moneda.monedaOperativa),
    }),
    [catalogo, preview, operationalForm, moneda.ctx, moneda.monedaOperativa],
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
  const regalosCatalogo = catalogo?.regalos || [];
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
          regalos_cantidad: form.regalosCantidad,
          regalos_split: form.regalosSplit,
          monto_capturado: ws.monto_capturado,
          monto_contrato: ws.monto_contrato,
          regalos_totales: ws.regalos_totales,
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
    return (
      <>
        <Topbar title="Worksheet · Royal Holiday" subtitle="Sala Royal Holiday" />
        <div className="sales-page tool-calc-page" aria-busy="true">
          <div className="page-toolbar"><PageBack inline href={backHref} /></div>
          <WorksheetRhSkeleton />
        </div>
      </>
    );
  }

  const showVenta = tab === "venta";
  const showFin = tab === "financiamiento";
  const showMoneyBox = tab === "moneybox";
  const showHoja = tab === "worksheet";

  return (
    <>
      <Topbar title="Worksheet · Royal Holiday" subtitle="Sala Royal Holiday" />
      <div className={`sales-page tool-calc-page worksheet-rh content-ready${showHoja ? " worksheet-rh--hoja" : ""}${!readOnly ? " tool-calc-page--with-save" : ""}`}>
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline href={backHref} hasUnsavedChanges={() => dirtyKeysRef.current.size > 0} />
        </div>

        <nav className="admin-subnav worksheet-rh-tabs" aria-label="Pestañas worksheet">
          {visibleTabs.map((tb) => (
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
          <WorksheetRhVentaPanel
            form={form}
            set={set}
            patchForm={patchForm}
            readOnly={readOnly}
            dirtyKeysRef={dirtyKeysRef}
            ws={ws}
            catalogo={catalogo}
            bl={bl}
            boardOnline={boardOnline}
            boardOk={boardOk}
            blDifer={blDifer}
            montoCapture={montoCapture}
            montoOperational={montoOperational}
            moneda={moneda}
            posicionesDisponibles={posicionesDisponibles}
            regalosCatalogo={regalosCatalogo}
            showExtras={false}
          />
        )}

        {showHoja && (
          <WorksheetRhHojaPanel
            form={form}
            set={set}
            readOnly={readOnly}
            ws={ws}
            catalogo={catalogo}
            bl={bl}
            boardOnline={boardOnline}
            boardOk={boardOk}
            blDifer={blDifer}
            montoCapture={montoCapture}
            moneda={moneda}
            posicionesDisponibles={posicionesDisponibles}
            regalosCatalogo={regalosCatalogo}
            captureCurrency={captureCurrency}
            client={client}
          />
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
            stacked={false}
          />
        )}

        {showMoneyBox && (
          <WorksheetRhMoneyBoxPanel empresaId={empresaId} />
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
