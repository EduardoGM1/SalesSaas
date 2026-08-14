import { useEffect, useMemo } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { CampoMonedaCaptura } from "@/components/currency/campo-moneda-captura.jsx";
import {
  RH_EXTRA_DP_PLAZO_DIAS,
  calcularMensualidad,
  montoVentaWorksheet,
  toDateStr,
  fechaLimiteExtraDp,
} from "@/lib/calculations/royal-holiday.js";
import { parseMoney } from "@/lib/format/money";

const PAGO_OPTS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

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

function ExtraCollapsible({ title, rows, max, readOnly, onChange, onAdd, hint }) {
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={false}
      className="rh-fin-nested-collapsible"
    >
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
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button
          type="button"
          className="btn btn-ghost btn-sm rh-fin-extra-add"
          disabled={rows.length >= max}
          onClick={onAdd}
        >
          + Agregar extra
        </button>
      )}
      {hint ? <p className="muted rh-hint">{hint}</p> : null}
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
  extraRows,
  extraMax,
  onExtraChange,
  onExtraAdd,
  extraHint,
  topContent,
}) {
  const hoyAmount = Number(hoyValue) || 0;
  const pactado = pctPactado != null ? Number(pctPactado) : null;
  const showEngancheDelta = pactado != null && hoyAmount > 0 && montoDeltaVisible(pactado, pctHoy);

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
            <span className={`rh-fin-pct-badge rh-fin-pct-badge--${tone}`}>{fmtPct(pctHoy)}</span>
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
          <div className="rh-fin-saldo-label">Saldo pendiente</div>
          <div className="rh-fin-saldo-val">{saldoFmt}</div>
          <div className="rh-fin-saldo-pct">{fmtPct(saldoPct)}{saldoPctLabel(saldoHint)}</div>
          {saldoHint ? <p className="muted rh-hint">{saldoHint}</p> : null}
        </div>

        <div className="frow tool-frow">
          <div className="flabel">Número de pagos</div>
          <select
            className="input"
            disabled={readOnly}
            value={numPagos}
            onChange={(e) => onNumPagosChange(e.target.value)}
          >
            {PAGO_OPTS.map((n) => (
              <option key={n} value={String(n)}>{n} {n === 1 ? "pago" : "pagos"}</option>
            ))}
          </select>
        </div>

        {pagos.length > 0 && (
          <div className="rh-fin-pagos-table-wrap table-scroll">
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
            <p className="muted rh-hint">El saldo se divide automáticamente; ajusta las fechas según el calendario acordado.</p>
          </div>
        )}

        {extraTitle ? (
          <ExtraCollapsible
            title={extraTitle}
            rows={extraRows}
            max={extraMax}
            readOnly={readOnly}
            onChange={onExtraChange}
            onAdd={onExtraAdd}
            hint={extraHint}
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
  const pctEngancheHoy = montoContratoCapture > 0 ? (engancheHoy / montoContratoCapture) * 100 : 0;
  const pctSaldoEnganche = montoContratoCapture > 0 ? (saldoEnganche / montoContratoCapture) * 100 : 0;

  const gastoTotalCapture = toCaptureDisplay(Number(ws.costo_administrativo_usd || 0));
  const gastoHoy = parseMoney(form.gasto_adm_hoy);
  const saldoGasto = Math.max(0, gastoTotalCapture - gastoHoy);
  const pctGastoHoy = gastoTotalCapture > 0 ? (gastoHoy / gastoTotalCapture) * 100 : 0;
  const pctSaldoGasto = gastoTotalCapture > 0 ? (saldoGasto / gastoTotalCapture) * 100 : 0;

  const maxDp = catalogo?.parametros?.max_extra_dp ?? 6;
  const maxCc = catalogo?.parametros?.max_extra_cc ?? 6;
  const adminOptions = (catalogo?.costo_administrativo || []).map((c) => c.monto_usd);
  const tarjetas = catalogo?.parametros?.tarjetas_internas || ["Invex", "RCI"];
  const fechaVentaRef = toDateStr(new Date());
  const extraDpLimite = fechaLimiteExtraDp(fechaVentaRef);

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
    if (n <= 0) return;
    setForm((f) => {
      const next = syncPagos(f.enganche_pagos || [], saldoEnganche, n);
      const same = JSON.stringify(next) === JSON.stringify(f.enganche_pagos);
      return same ? f : { ...f, enganche_pagos: next };
    });
  }, [saldoEnganche, form.enganche_num_pagos, setForm]);

  useEffect(() => {
    const n = Number(form.gasto_num_pagos) || 0;
    if (n <= 0) return;
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
            title="Datos de enganche"
            tone="blue"
            captureCurrency={captureCurrency}
            hoyLabel="Hoy (pago inicial)"
            hoyValue={form.enganche_hoy}
            onHoyChange={(v) => set("enganche_hoy", v)}
            onHoyBlur={() => onMoneyBlur?.("enganche_hoy", formatCapture(form.enganche_hoy))}
            pctHoy={pctEngancheHoy}
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
            extraTitle="(+) Extra enganche"
            extraRows={form.extrasDp}
            extraMax={maxDp}
            onExtraChange={(rows) => set("extrasDp", rows)}
            onExtraAdd={() => setForm((f) => ({
              ...f,
              extrasDp: [...f.extrasDp, { porcentaje: "10", fecha: toDateStr(new Date()) }],
            }))}
            extraHint={`Máximo ${maxDp}. Extra DP: fecha dentro de ${RH_EXTRA_DP_PLAZO_DIAS} días desde la venta${extraDpLimite ? ` (hasta ${toDateStr(extraDpLimite)})` : ""}.`}
          />

          <PaymentCaptureBlock
            title="Datos de gastos administrativos"
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
            extraTitle="(+) Extra gasto administrativo"
            extraRows={form.extrasCc}
            extraMax={maxCc}
            onExtraChange={(rows) => set("extrasCc", rows)}
            onExtraAdd={() => setForm((f) => ({
              ...f,
              extrasCc: [...f.extrasCc, { porcentaje: "10", fecha: toDateStr(new Date()) }],
            }))}
            extraHint={`Máximo ${maxCc} extras de gasto administrativo.`}
            topContent={(
              <>
                <div className="frow tool-frow rh-fin-gasto-select">
                  <div className="flabel">Gasto Adm.</div>
                  <select
                    className="input"
                    disabled={readOnly}
                    value={form.costo_administrativo_usd}
                    onChange={(e) => set("costo_administrativo_usd", e.target.value)}
                  >
                    {adminOptions.length === 0 && <option value="">—</option>}
                    {adminOptions.map((m) => (
                      <option key={m} value={m}>{m} USD</option>
                    ))}
                  </select>
                </div>
                <p className="muted rh-hint">
                  Costo admin: 750 USD (enganche ≥15%), 950 USD (enganche ≥27.5%).
                  {regalosClosing > 0 ? " El total de arriba suma los regalos a closing." : ""}
                </p>
              </>
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
              {!plazoCards.length && (
                <span className="muted">Sin plazos para esta combinación.</span>
              )}
            </div>

            {ws.comision?.pendiente ? (
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
