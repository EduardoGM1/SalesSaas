import { useEffect, useMemo } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { CampoMonedaCaptura } from "@/components/currency/campo-moneda-captura.jsx";
import {
  calcularMensualidad,
  costoUnitarioRegalo,
  montoVentaWorksheet,
  ordenarRegalosExcel,
  toDateStr,
  totalLineaRegalo,
} from "@/lib/calculations/royal-holiday.js";
import { parseMoney } from "@/lib/format/money";

const PAGO_OPTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];

function pagoOptLabel(n) {
  return `${n} ${n === 1 ? "pago" : "pagos"}`;
}

function pagoSelectOptions(current) {
  const n = Number(current);
  if (Number.isFinite(n) && !PAGO_OPTS.includes(n)) return [...PAGO_OPTS, n].sort((a, b) => a - b);
  return PAGO_OPTS;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function splitSaldo(saldo, numPagos) {
  const n = Math.max(0, Number(numPagos) || 0);
  if (n <= 0) return [];
  const total = Math.max(0, Number(saldo) || 0);
  if (total === 0) return Array(n).fill(0);
  const per = roundMoney(total / n);
  const montos = Array(n).fill(per);
  const sumPrev = montos.slice(0, -1).reduce((a, b) => a + b, 0);
  montos[n - 1] = roundMoney(total - sumPrev);
  return montos;
}

function defaultPagoFecha(index, day = 15) {
  const d = new Date();
  d.setMonth(d.getMonth() + index + 1);
  d.setDate(day);
  return toDateStr(d);
}

function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} %`;
}

function montoDeltaVisible(pactadoPct, hoyPct) {
  return Math.abs(Number(pactadoPct) - Number(hoyPct)) > 0.005 || Number(pactadoPct) > Number(hoyPct);
}

function fmtPlazoTasa(plazo, tasa) {
  const t = Number(tasa);
  const tStr = Number.isFinite(t) ? t.toFixed(2) : "0.00";
  return `${plazo} meses — ${tStr}%`;
}

function plazoSubtitle(tasa) {
  const t = Number(tasa);
  return t === 0 ? "Sin intereses" : "Tasa fija anual";
}

function emptyExtraItem() {
  return { regaloId: "", cantidad: "1" };
}

function ExtraCatalogTable({
  rows = [],
  regalos = [],
  cuotaAnual = 0,
  readOnly,
  onChange,
  fmtResult,
  testId,
}) {
  const catalog = ordenarRegalosExcel(regalos).filter((g) => costoUnitarioRegalo(g, { cuotaAnual }) != null);
  const byId = new Map(catalog.map((g) => [String(g.id), g]));
  const subtotal = rows.reduce((sum, row) => {
    const g = byId.get(String(row.regaloId));
    if (!g) return sum;
    return sum + totalLineaRegalo(g, { qty: Number(row.cantidad) || 0, cuotaAnual });
  }, 0);

  const patchRow = (idx, next) => {
    const copy = rows.map((r, i) => (i === idx ? { ...r, ...next } : r));
    onChange(copy);
  };
  const fmt = fmtResult || ((n) => String(n ?? ""));

  return (
    <div className="rh-extra-catalog" data-testid={testId}>
      <div className="rh-regalos-table-wrap">
        <table className="client-table rh-regalos-table rh-extra-catalog-table">
          <thead>
            <tr>
              <th className="rh-col-name">Concepto</th>
              <th className="rh-col-qty">Cantidad</th>
              <th className="rh-col-cost">Costo unit.</th>
              <th className="rh-col-total">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="muted">Sin renglones. Pulsa + para agregar un concepto del catálogo.</td></tr>
            ) : null}
            {rows.map((row, idx) => {
              const g = byId.get(String(row.regaloId));
              const unit = g ? costoUnitarioRegalo(g, { cuotaAnual }) : null;
              const total = g ? totalLineaRegalo(g, { qty: Number(row.cantidad) || 0, cuotaAnual }) : 0;
              return (
                <tr key={`${row.regaloId || "new"}-${idx}`}>
                  <td className="rh-col-name">
                    <select
                      className="input"
                      disabled={readOnly}
                      value={row.regaloId || ""}
                      aria-label="Concepto"
                      onChange={(e) => patchRow(idx, { regaloId: e.target.value, cantidad: row.cantidad || "1" })}
                    >
                      <option value="">Selecciona un concepto</option>
                      {catalog.map((item) => (
                        <option key={item.id} value={item.id}>{item.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="rh-col-qty">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      step="1"
                      className="input input-compact rh-qty-input"
                      disabled={readOnly || !row.regaloId}
                      value={row.cantidad ?? "1"}
                      aria-label="Cantidad"
                      onChange={(e) => patchRow(idx, { cantidad: e.target.value })}
                    />
                  </td>
                  <td className="rh-col-cost">{unit == null ? "—" : fmt(unit)}</td>
                  <td className="rh-col-total">{g ? fmt(total) : "—"}</td>
                  <td>
                    {!readOnly && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        aria-label="Quitar renglón"
                        onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rh-extra-catalog-foot">
        {!readOnly && (
          <button
            type="button"
            className="btn btn-ghost btn-sm rh-fin-extra-add"
            onClick={() => onChange([...rows, emptyExtraItem()])}
          >
            +
          </button>
        )}
        <div className="rh-extra-catalog-subtotal">
          Subtotal {fmt(subtotal)}
        </div>
      </div>
    </div>
  );
}

function ExtraCollapsible({
  title,
  catalogRows,
  regalos,
  cuotaAnual,
  readOnly,
  onCatalogChange,
  fmtResult,
  hint,
  testId,
}) {
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={false}
      className="rh-fin-nested-collapsible"
    >
      <ExtraCatalogTable
        rows={catalogRows}
        regalos={regalos}
        cuotaAnual={cuotaAnual}
        readOnly={readOnly}
        onChange={onCatalogChange}
        fmtResult={fmtResult}
        testId={testId}
      />
      {hint ? <p className="muted rh-hint">{hint}</p> : null}
    </CollapsibleSection>
  );
}

const EXTRAS_VENTA_ENGANCHE = [
  { key: "all_inclusive", label: "ALL INCLUSIVE" },
  { key: "cert_vuelos", label: "CERT. VUELOS" },
  { key: "tours", label: "TOURS" },
];

function emptyExtrasVentaEnganche() {
  return { flyback: false, all_inclusive: "", cert_vuelos: "", tours: "" };
}

function emptyExtrasVentaGastos() {
  return { flyback: false, move_in: "", cert_vuelos: "", tours: "" };
}

const EXTRAS_VENTA_GASTOS = [
  { key: "move_in", label: "MOVE IN" },
  { key: "cert_vuelos", label: "CERT. VUELOS" },
  { key: "tours", label: "TOURS" },
];

function ExtrasVentaEnganche({
  value,
  readOnly,
  onChange,
  captureCurrency,
  items = EXTRAS_VENTA_ENGANCHE,
  testId = "rh-extras-venta-enganche",
  emptyValue = emptyExtrasVentaEnganche,
}) {
  const row = { ...emptyValue(), ...(value || {}) };
  const patch = (next) => onChange?.({ ...row, ...next });

  return (
    <CollapsibleSection
      title="(+) Extras venta"
      defaultOpen={false}
      className="rh-fin-nested-collapsible"
    >
      <div className="rh-extras-venta" data-testid={testId}>
        <div className="rh-extras-venta-head">
          <span>Concepto</span>
          <span>Monto</span>
        </div>
        <label className="rh-extras-venta-row">
          <span>FLYBACK</span>
          <span className="rh-extras-venta-check">
            <input
              type="checkbox"
              checked={!!row.flyback}
              disabled={readOnly}
              onChange={(e) => patch({ flyback: e.target.checked })}
            />
            Incluido (sí / no)
          </span>
        </label>
        {items.map((item) => (
          <div key={item.key} className="rh-extras-venta-row">
            <span>{item.label}</span>
            <CampoMonedaCaptura
              currency={captureCurrency}
              value={row[item.key] ?? ""}
              readOnly={readOnly}
              placeholder=""
              onChange={(next) => patch({ [item.key]: next })}
            />
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function PaymentCaptureBlock({
  title,
  tone = "blue",
  hoyLabel,
  hoyValue,
  onHoyChange,
  onHoyBlur,
  captureCurrency,
  pctHoy,
  pctHoyLabel,
  pctPactado,
  saldoFmt,
  saldo,
  saldoPct,
  saldoHint,
  numPagos,
  onNumPagosChange,
  pagos,
  onPagosChange,
  onPagoBlur,
  readOnly,
  extraTitle,
  extraCatalogRows,
  extraRegalos,
  extraCuotaAnual,
  onExtraCatalogChange,
  extraFmtResult,
  extraHint,
  extraTestId,
  extraNode,
  pctEditable,
  onPctHoyChange,
  topContent,
}) {
  const hoyAmount = Number(hoyValue) || 0;
  const pactado = pctPactado != null ? Number(pctPactado) : null;
  const showEngancheDelta = pactado != null && hoyAmount > 0 && montoDeltaVisible(pactado, pctHoy);
  const pagosSelectId = `rh-num-pagos-${String(title || "plan").replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <CollapsibleSection
      title={title}
      defaultOpen={false}
      className={`rh-fin-block-collapsible rh-fin-block--${tone}`}
    >
      <div className="rh-fin-block-inner">
        {topContent}
        <div className="rh-fin-hoy-block">
          <div className="rh-fin-hoy-block-label">{hoyLabel}</div>
          <div className="rh-fin-hoy-block-inputs">
            <CampoMonedaCaptura
              currency={captureCurrency}
              value={hoyValue}
              readOnly={readOnly}
              onChange={onHoyChange}
              onBlurCapture={onHoyBlur}
              className="rh-fin-hoy-mfield"
            />
            {pctEditable ? (
              <label className="rh-fin-pct-edit">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input input-compact"
                  disabled={readOnly}
                  aria-label="Porcentaje del pago inicial"
                  value={pctHoy}
                  onChange={(e) => onPctHoyChange?.(e.target.value.replace(/[^\d.]/g, ""))}
                />
                <span>%</span>
              </label>
            ) : (
              <span className={`rh-fin-pct-badge rh-fin-pct-badge--${tone}`}>{fmtPct(pctHoy)}</span>
            )}
          </div>
          <div className="rh-fin-hoy-block-meta">
            {pctHoyLabel ? (
              <p className="muted rh-hint rh-fin-hoy-block-hint">{pctHoyLabel}</p>
            ) : null}
            {showEngancheDelta ? (
              <p className="muted rh-hint rh-fin-enganche-delta">
                Pactado {fmtPct(pactado)} · Entregado hoy {fmtPct(pctHoy)}
                {" · "}
                Pendiente {fmtPct(Math.max(0, pactado - pctHoy))}
                {saldoFmt ? ` (${saldoFmt})` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className={`rh-fin-saldo rh-fin-saldo--${tone}`}>
          <div className="rh-fin-saldo-copy">
            <div className="rh-fin-saldo-label">Saldo pendiente</div>
            <div className="rh-fin-saldo-val">{saldoFmt}</div>
            <div className="rh-fin-saldo-pct">{fmtPct(saldoPct)}{saldoPctLabel(saldoHint)}</div>
          </div>
          <div className="rh-fin-saldo-pagos">
            <label className="rh-fin-saldo-pagos-label" htmlFor={`${pagosSelectId}-m`}>Número de pagos</label>
            <select
              id={`${pagosSelectId}-m`}
              className="input"
              disabled={readOnly}
              value={numPagos}
              onChange={(e) => onNumPagosChange(e.target.value)}
            >
              {pagoSelectOptions(numPagos).map((n) => (
                <option key={n} value={String(n)}>{pagoOptLabel(n)}</option>
              ))}
            </select>
          </div>
          {saldoHint ? <p className="muted rh-hint rh-fin-saldo-hint">{saldoHint}</p> : null}
        </div>

        {pagos.length > 0 && (
          <>
            <div className={`rh-fin-pagos-table-wrap${pagos.length >= 4 ? " rh-fin-pagos-scroll" : ""}`}>
              <table className="client-table rh-fin-pagos-table">
                <thead>
                  <tr>
                    <th />
                    <th>Monto por pago</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p, idx) => (
                    <tr key={idx}>
                      <td className="rh-fin-pago-num">{idx + 1}</td>
                      <td>
                        <CampoMonedaCaptura
                          currency={captureCurrency}
                          value={p.monto}
                          readOnly={readOnly}
                          onChange={(value) => {
                            const next = [...pagos];
                            next[idx] = { ...next[idx], monto: value };
                            onPagosChange(next);
                          }}
                          onBlurCapture={() => onPagoBlur?.(idx, p.monto)}
                          className="rh-fin-pago-mfield"
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input input-compact"
                          disabled={readOnly}
                          value={p.fecha}
                          onChange={(e) => {
                            const next = [...pagos];
                            next[idx] = { ...next[idx], fecha: e.target.value };
                            onPagosChange(next);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted rh-hint rh-fin-pagos-hint">El saldo se divide automáticamente; ajusta las fechas según el calendario acordado.</p>
          </>
        )}

        {extraNode}
        {extraTitle ? (
          <ExtraCollapsible
            title={extraTitle}
            catalogRows={extraCatalogRows}
            regalos={extraRegalos}
            cuotaAnual={extraCuotaAnual}
            readOnly={readOnly}
            onCatalogChange={onExtraCatalogChange}
            fmtResult={extraFmtResult}
            hint={extraHint}
            testId={extraTestId}
          />
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

function saldoPctLabel(hint) {
  if (!hint) return "";
  return hint.includes("gasto") ? " del gasto administrativo" : " del monto de venta";
}

function syncPagos(prevPagos, saldo, numPagos) {
  const montos = splitSaldo(saldo, numPagos);
  return montos.map((m, i) => ({
    monto: String(m),
    fecha: prevPagos[i]?.fecha || defaultPagoFecha(i),
  }));
}

export function WorksheetRhFinancingPanel({
  form,
  set,
  setForm,
  worksheetState,
  catalogo,
  readOnly,
  captureCurrency = "USD",
  montoOperational = 0,
  moneda,
  onMoneyBlur,
  stacked,
}) {
  const { fmtResult, fmtCaptureResult, formatCapture, toCaptureDisplay } = moneda || {};
  const ws = worksheetState || {};
  const montoCapture = montoVentaWorksheet(form);
  const engPct = Number(form.enganche_pct || 0);
  const regalosVenta = Number(ws.regalos_totales?.venta || 0);
  const regalosClosing = Number(ws.regalos_totales?.closing || 0);
  const montoContratoCapture = ws.monto_contrato != null
    ? toCaptureDisplay(Number(ws.monto_contrato))
    : montoCapture + toCaptureDisplay(regalosVenta);
  const engancheTotalCapture = ws.totales?.enganche != null
    ? toCaptureDisplay(ws.totales.enganche)
    : (montoContratoCapture * engPct) / 100;
  const engancheHoy = parseMoney(form.enganche_hoy);
  const saldoEnganche = Math.max(0, engancheTotalCapture - engancheHoy);
  const montoVentaCapture = parseMoney(form.monto_venta);
  const pctEngancheHoy = montoVentaCapture > 0 ? (engancheHoy / montoVentaCapture) * 100 : 0;
  const engancheHoyPctInput = pctEngancheHoy ? String(roundMoney(pctEngancheHoy)) : "";
  const onEngancheHoyPctChange = (raw) => {
    const pct = Number(raw);
    if (!raw) {
      set("enganche_hoy", "");
      return;
    }
    if (!Number.isFinite(pct) || montoVentaCapture <= 0) return;
    set("enganche_hoy", String(roundMoney((montoVentaCapture * pct) / 100)));
  };
  const pctSaldoEnganche = montoContratoCapture > 0 ? (saldoEnganche / montoContratoCapture) * 100 : 0;

  const gastoTotalCapture = toCaptureDisplay(Number(ws.costo_administrativo_usd || 0));
  const gastoHoy = parseMoney(form.gasto_adm_hoy);
  const saldoGasto = Math.max(0, gastoTotalCapture - gastoHoy);
  const pctGastoHoy = gastoTotalCapture > 0 ? (gastoHoy / gastoTotalCapture) * 100 : 0;
  const pctSaldoGasto = gastoTotalCapture > 0 ? (saldoGasto / gastoTotalCapture) * 100 : 0;

  const tarjetas = catalogo?.parametros?.tarjetas_internas || ["Invex", "RCI"];

  const balanceFinanciarOperational = ws.totales?.balanceAFinanciar != null
    ? Number(ws.totales.balanceAFinanciar)
    : Math.max(
      0,
      Number(montoOperational || 0) - (ws.totales?.enganche ?? (Number(montoOperational || 0) * engPct) / 100),
    );

  const finTier = useMemo(() => ({
    rows: ws.plazos || [],
    tier: ws.financiamiento_enganche_tier,
    exact: ws.financiamiento_enganche_exacto !== false,
  }), [ws.plazos, ws.financiamiento_enganche_tier, ws.financiamiento_enganche_exacto]);

  useEffect(() => {
    const n = Number(form.enganche_num_pagos) || 0;
    setForm((f) => {
      const next = syncPagos(f.enganche_pagos || [], saldoEnganche, n);
      const same = JSON.stringify(next) === JSON.stringify(f.enganche_pagos);
      return same ? f : { ...f, enganche_pagos: next };
    });
  }, [saldoEnganche, form.enganche_num_pagos, setForm]);

  useEffect(() => {
    const n = Number(form.gasto_num_pagos) || 0;
    setForm((f) => {
      const next = syncPagos(f.gasto_pagos || [], saldoGasto, n);
      const same = JSON.stringify(next) === JSON.stringify(f.gasto_pagos);
      return same ? f : { ...f, gasto_pagos: next };
    });
  }, [saldoGasto, form.gasto_num_pagos, setForm]);

  const plazoCards = useMemo(() => {
    return (finTier.rows || []).map((p) => ({
      ...p,
      mensualidad: calcularMensualidad(balanceFinanciarOperational, p.factor_mensual),
    }));
  }, [finTier.rows, balanceFinanciarOperational]);

  const fmtSaldo = (amount) => fmtCaptureResult(roundMoney(amount));

  const handlePagoBlur = (planKey, index, rawValue) => {
    const formatted = formatCapture(rawValue);
    setForm((f) => {
      const rows = [...(f[planKey] || [])];
      rows[index] = { ...rows[index], monto: formatted };
      return { ...f, [planKey]: rows };
    });
    onMoneyBlur?.(`${planKey === "enganche_pagos" ? "enganche" : "gasto"}_pago_${index}`, formatted);
  };

  return (
    <section className={`worksheet-rh-fin${stacked ? " worksheet-rh-fin--stacked" : ""}`}>
      <div className="worksheet-rh-fin-grid">
        <div className="card tool-calc-card rh-fin-left">
          <div className="card-heading">Datos de la venta</div>
          <div className="tool-calc-fields">
            <div className="frow frow-first tool-frow">
              <div className="flabel">Monto de venta</div>
              <CampoMonedaCaptura
                currency={captureCurrency}
                value={form.monto_venta}
                readOnly={readOnly}
                onChange={(value) => set("monto_venta", value)}
                onBlurCapture={() => onMoneyBlur?.("monto_venta", formatCapture(form.monto_venta))}
              />
            </div>
            {regalosVenta > 0 ? (
              <div className="frow tool-frow">
                <div className="flabel">Contrato (venta + regalos)</div>
                <div className="rh-readonly rh-fin-field-val">{fmtCaptureResult(montoContratoCapture)}</div>
              </div>
            ) : null}
            <div className="frow tool-frow">
              <div className="flabel">% Enganche</div>
              <div className="frow-inline">
                <input
                  className="input tool-num-input"
                  type="number"
                  disabled={readOnly}
                  value={form.enganche_pct}
                  onChange={(e) => set("enganche_pct", e.target.value)}
                />
                <span className="frow-suffix">%</span>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Gastos administrativos</div>
              <div className="rh-readonly rh-fin-field-val">{fmtCaptureResult(gastoTotalCapture)}</div>
            </div>
            {regalosClosing > 0 ? (
              <p className="muted rh-hint">Incluye regalos cargados a closing.</p>
            ) : null}
            <div className="frow tool-frow">
              <div className="flabel">Monto pendiente</div>
              <CampoMonedaCaptura
                currency={captureCurrency}
                value={form.monto_pendiente}
                readOnly={readOnly}
                onChange={(value) => set("monto_pendiente", value)}
                onBlurCapture={() => onMoneyBlur?.("monto_pendiente", formatCapture(form.monto_pendiente))}
              />
            </div>
          </div>

          <div className="rh-fin-accordions">
          <PaymentCaptureBlock
            title="Datos de Venta - Enganche"
            tone="blue"
            captureCurrency={captureCurrency}
            hoyLabel="Hoy (pago inicial)"
            hoyValue={form.enganche_hoy}
            onHoyChange={(v) => set("enganche_hoy", v)}
            onHoyBlur={() => onMoneyBlur?.("enganche_hoy", formatCapture(form.enganche_hoy))}
            pctEditable
            pctHoy={engancheHoyPctInput}
            onPctHoyChange={onEngancheHoyPctChange}
            pctPactado={Number(form.enganche_pct) || 0}
            pctHoyLabel="Pagos hoy."
            saldo={saldoEnganche}
            saldoFmt={fmtSaldo(saldoEnganche)}
            saldoPct={pctSaldoEnganche}
            saldoHint="Falta por completar el enganche."
            numPagos={form.enganche_num_pagos}
            onNumPagosChange={(v) => set("enganche_num_pagos", v)}
            pagos={form.enganche_pagos}
            onPagosChange={(rows) => set("enganche_pagos", rows)}
            onPagoBlur={(idx, raw) => handlePagoBlur("enganche_pagos", idx, raw)}
            readOnly={readOnly}
            extraNode={(
              <ExtrasVentaEnganche
                value={form.extrasVentaEnganche}
                readOnly={readOnly}
                captureCurrency={captureCurrency}
                onChange={(next) => set("extrasVentaEnganche", next)}
              />
            )}
          />

          <PaymentCaptureBlock
            title="Datos de Venta - Gastos Administrativos"
            tone="green"
            captureCurrency={captureCurrency}
            hoyLabel="Hoy (pago inicial)"
            hoyValue={form.gasto_adm_hoy}
            onHoyChange={(v) => set("gasto_adm_hoy", v)}
            onHoyBlur={() => onMoneyBlur?.("gasto_adm_hoy", formatCapture(form.gasto_adm_hoy))}
            pctHoy={pctGastoHoy}
            pctHoyLabel="Respecto al gasto administrativo."
            saldo={saldoGasto}
            saldoFmt={fmtSaldo(saldoGasto)}
            saldoPct={pctSaldoGasto}
            saldoHint="Falta por completar el gasto."
            numPagos={form.gasto_num_pagos}
            onNumPagosChange={(v) => set("gasto_num_pagos", v)}
            pagos={form.gasto_pagos}
            onPagosChange={(rows) => set("gasto_pagos", rows)}
            onPagoBlur={(idx, raw) => handlePagoBlur("gasto_pagos", idx, raw)}
            readOnly={readOnly}
            extraNode={(
              <ExtrasVentaEnganche
                value={form.extrasVentaGastos}
                readOnly={readOnly}
                captureCurrency={captureCurrency}
                items={EXTRAS_VENTA_GASTOS}
                testId="rh-extras-venta-gastos"
                emptyValue={emptyExtrasVentaGastos}
                onChange={(next) => set("extrasVentaGastos", next)}
              />
            )}
            topContent={(
              <div className="frow tool-frow rh-fin-gasto-select">
                <div className="flabel">Gasto Adm.</div>
                <CampoMonedaCaptura
                  currency={captureCurrency}
                  value={form.costo_administrativo_usd}
                  readOnly={readOnly}
                  onChange={(value) => set("costo_administrativo_usd", value)}
                  onBlurCapture={() => onMoneyBlur?.("costo_administrativo_usd", formatCapture(form.costo_administrativo_usd))}
                />
              </div>
            )}
          />
          </div>

          <div className="g2 survey-result-pair rh-fin-totales">
            <div className="vbox blue">
              <div className="vbox-val">{ws.totales?.enganche != null ? fmtResult(ws.totales.enganche) : "—"}</div>
              <div className="vbox-label">Enganche</div>
            </div>
            <div className="vbox green">
              <div className="vbox-val">{ws.totales?.engancheMasAdmin != null ? fmtResult(ws.totales.engancheMasAdmin) : "—"}</div>
              <div className="vbox-label">Enganche + Gasto administrativo</div>
            </div>
            <div className="vbox yellow span2">
              <div className="vbox-val">{ws.totales?.balanceAFinanciar != null ? fmtResult(ws.totales.balanceAFinanciar) : "—"}</div>
              <div className="vbox-label">Balance a financiar</div>
              <div className="vbox-sub">Contrato − Enganche + Monto pendiente</div>
            </div>
          </div>
        </div>

        <div className="worksheet-rh-fin-right">
          <div className="card tool-calc-card">
            <div className="card-heading">Opciones de financiamiento</div>
            <div className="frow tool-frow">
              <div className="flabel">Nacionalidad</div>
              <select
                className="input"
                disabled={readOnly}
                value={form.nacionalidad}
                onChange={(e) => set("nacionalidad", e.target.value)}
              >
                <option value="mexicano">🇲🇽 Mexicano</option>
                <option value="argentino">🇦🇷 Argentino</option>
                <option value="resto">🌎 Resto del mundo</option>
              </select>
            </div>
            <p className="rh-fin-options-banner">
              Selecciona una opción de financiamiento. La opción elegida quedará guardada en esta venta.
            </p>
            {!finTier.exact && finTier.tier != null && (
              <p className="muted rh-hint rh-fin-tier-hint">
                Mostrando plazos del catálogo para enganche {finTier.tier}%. Ajusta % Enganche si necesitas otro tier.
              </p>
            )}

            <div className="rh-fin-plazo-list">
              {plazoCards.map((p) => {
                const selected = String(form.plazo_meses) === String(p.plazo_meses);
                return (
                  <label
                    key={p.plazo_meses}
                    className={`rh-fin-plazo-card${selected ? " is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="rh-plazo-fin"
                      className="rh-fin-plazo-check"
                      disabled={readOnly}
                      checked={selected}
                      onChange={() => set("plazo_meses", String(p.plazo_meses))}
                    />
                    <div className="rh-fin-plazo-body">
                      <div className="rh-fin-plazo-title">{fmtPlazoTasa(p.plazo_meses, p.tasa_interes)}</div>
                      <div className="rh-fin-plazo-sub">{plazoSubtitle(p.tasa_interes)}</div>
                    </div>
                    <div className="rh-fin-plazo-monthly">
                      {fmtResult(p.mensualidad)}<span className="rh-fin-plazo-monthly-suffix"> /mes</span>
                    </div>
                  </label>
                );
              })}
              {!catalogo ? null : !plazoCards.length ? (
                <span className="muted">Sin plazos para esta combinación.</span>
              ) : null}
            </div>

            {catalogo && ws.comision?.pendiente ? (
              <p className="rh-warn-text">{ws.comision.mensaje}</p>
            ) : ws.comision ? (
              <p className="muted rh-hint">
                Comisión {ws.comision.porcentaje}% → {fmtResult(ws.comision.monto)} · pago {ws.comision.fecha_pago}
                {!ws.comision_enganche_exacto && ws.comision_enganche_tier != null
                  ? ` (tier enganche ${ws.comision_enganche_tier}%)`
                  : ""}
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
                <CampoMonedaCaptura
                  currency={captureCurrency}
                  value={form.tarjeta_inmex}
                  readOnly={readOnly || !form.tarjeta_inmex_on}
                  onChange={(value) => set("tarjeta_inmex", value)}
                  onBlurCapture={() => onMoneyBlur?.("tarjeta_inmex", formatCapture(form.tarjeta_inmex))}
                  className="rh-card-mfield"
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
                <CampoMonedaCaptura
                  currency={captureCurrency}
                  value={form.tarjeta_rci}
                  readOnly={readOnly || !form.tarjeta_rci_on}
                  onChange={(value) => set("tarjeta_rci", value)}
                  onBlurCapture={() => onMoneyBlur?.("tarjeta_rci", formatCapture(form.tarjeta_rci))}
                  className="rh-card-mfield"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
