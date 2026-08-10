import { useEffect, useMemo } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { useMoney } from "@/hooks/use-money.js";
import {
  RH_EXTRA_DP_PLAZO_DIAS,
  calcularMensualidad,
  toDateStr,
  fechaLimiteExtraDp,
} from "@/lib/calculations/royal-holiday.js";

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
  pctHoy,
  pctHoyLabel,
  saldo,
  saldoPct,
  saldoHint,
  numPagos,
  onNumPagosChange,
  pagos,
  onPagosChange,
  readOnly,
  extraTitle,
  extraRows,
  extraMax,
  onExtraChange,
  onExtraAdd,
  extraHint,
  topContent,
}) {
  return (
    <CollapsibleSection
      title={title}
      defaultOpen={false}
      className="rh-fin-block-collapsible"
    >
      <div className="rh-fin-block-inner">
        {topContent}
        <div className="frow tool-frow rh-fin-hoy-row">
          <div className="flabel">{hoyLabel}</div>
          <div className="rh-fin-hoy-inputs">
            <input
              className="input tool-num-input"
              type="number"
              disabled={readOnly}
              value={hoyValue}
              onChange={(e) => onHoyChange(e.target.value)}
              placeholder="0.00"
            />
            <span className={`rh-fin-pct-badge rh-fin-pct-badge--${tone}`}>{fmtPct(pctHoy)}</span>
          </div>
          {pctHoyLabel ? <p className="muted rh-hint rh-fin-hoy-hint">{pctHoyLabel}</p> : null}
        </div>

        <div className={`rh-fin-saldo rh-fin-saldo--${tone}`}>
          <div className="rh-fin-saldo-label">Saldo pendiente</div>
          <div className="rh-fin-saldo-val">{roundMoney(saldo).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                      <input
                        className="input input-compact tool-num-input"
                        type="number"
                        disabled={readOnly}
                        value={p.monto}
                        onChange={(e) => {
                          const next = [...pagos];
                          next[idx] = { ...next[idx], monto: e.target.value };
                          onPagosChange(next);
                        }}
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
  preview,
  catalogo,
  readOnly,
  fmtNum,
  stacked,
}) {
  const { settings, fmtN2 } = useMoney();
  const monto = Number(form.monto_venta || form.valor || 0);
  const engancheTotal = Number(preview?.totales?.enganche ?? (monto * Number(form.enganche_pct || 0)) / 100);
  const engancheHoy = Number(form.enganche_hoy || 0);
  const saldoEnganche = Math.max(0, engancheTotal - engancheHoy);
  const pctEngancheHoy = monto > 0 ? (engancheHoy / monto) * 100 : 0;
  const pctSaldoEnganche = monto > 0 ? (saldoEnganche / monto) * 100 : 0;

  const gastoTotal = Number(form.costo_administrativo_usd || preview?.costo_administrativo_usd || 0);
  const gastoHoy = Number(form.gasto_adm_hoy || 0);
  const saldoGasto = Math.max(0, gastoTotal - gastoHoy);
  const pctGastoHoy = gastoTotal > 0 ? (gastoHoy / gastoTotal) * 100 : 0;
  const pctSaldoGasto = gastoTotal > 0 ? (saldoGasto / gastoTotal) * 100 : 0;

  const maxDp = catalogo?.parametros?.max_extra_dp ?? 6;
  const maxCc = catalogo?.parametros?.max_extra_cc ?? 6;
  const adminOptions = (catalogo?.costo_administrativo || []).map((c) => c.monto_usd);
  const tarjetas = catalogo?.parametros?.tarjetas_internas || ["Invex", "RCI"];
  const fechaVentaRef = toDateStr(new Date());
  const extraDpLimite = fechaLimiteExtraDp(fechaVentaRef);

  const balanceFinanciar = Number(preview?.totales?.balanceAFinanciar ?? Math.max(0, monto - engancheTotal));

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
    return (preview?.plazos || []).map((p) => ({
      ...p,
      mensualidad: calcularMensualidad(balanceFinanciar, p.factor_mensual),
    }));
  }, [preview?.plazos, balanceFinanciar]);

  const tcLabel = settings.currency === "MXN"
    ? `Tipo de cambio 1 USD = ${Number(settings.exchangeRate || 1).toFixed(2)} MXN`
    : null;

  return (
    <section className={`worksheet-rh-fin${stacked ? " worksheet-rh-fin--stacked" : ""}`}>
      {tcLabel ? <p className="rh-fin-tc-hint muted">{tcLabel}</p> : null}

      <div className="worksheet-rh-fin-grid">
        <div className="card tool-calc-card rh-fin-left">
          <div className="card-heading">Monto venta</div>
          <div className="tool-calc-fields">
            <div className="frow tool-frow">
              <div className="flabel">Monto de venta</div>
              <input
                className="input tool-num-input"
                type="number"
                disabled={readOnly}
                value={form.monto_venta}
                onChange={(e) => set("monto_venta", e.target.value)}
              />
            </div>
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
          </div>

          <PaymentCaptureBlock
            title="Datos de enganche"
            tone="blue"
            hoyLabel="Hoy (pago inicial)"
            hoyValue={form.enganche_hoy}
            onHoyChange={(v) => set("enganche_hoy", v)}
            pctHoy={pctEngancheHoy}
            pctHoyLabel="Pagos hoy."
            saldo={saldoEnganche}
            saldoPct={pctSaldoEnganche}
            saldoHint="Falta por completar el enganche."
            numPagos={form.enganche_num_pagos}
            onNumPagosChange={(v) => set("enganche_num_pagos", v)}
            pagos={form.enganche_pagos}
            onPagosChange={(rows) => set("enganche_pagos", rows)}
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
            title="Gastos administrativos"
            tone="green"
            hoyLabel="Hoy (pago inicial)"
            hoyValue={form.gasto_adm_hoy}
            onHoyChange={(v) => set("gasto_adm_hoy", v)}
            pctHoy={pctGastoHoy}
            pctHoyLabel="Respecto al gasto administrativo."
            saldo={saldoGasto}
            saldoPct={pctSaldoGasto}
            saldoHint="Falta por completar el gasto."
            numPagos={form.gasto_num_pagos}
            onNumPagosChange={(v) => set("gasto_num_pagos", v)}
            pagos={form.gasto_pagos}
            onPagosChange={(rows) => set("gasto_pagos", rows)}
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
                <p className="muted rh-hint">Costo admin: 750 USD (enganche ≥15%), 950 USD (enganche ≥27.5%).</p>
              </>
            )}
          />

          <div className="g2 survey-result-pair rh-fin-totales">
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

            <div className="rh-fin-plazo-list">
              {plazoCards.map((p) => {
                const selected = String(form.plazo_meses) === String(p.plazo_meses);
                return (
                  <label
                    key={p.plazo_meses}
                    className={`rh-fin-plazo-card${selected ? " is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="rh-fin-plazo-check"
                      disabled={readOnly}
                      checked={selected}
                      onChange={(e) => {
                        if (e.target.checked) set("plazo_meses", String(p.plazo_meses));
                      }}
                    />
                    <div className="rh-fin-plazo-body">
                      <div className="rh-fin-plazo-title">{fmtPlazoTasa(p.plazo_meses, p.tasa_interes)}</div>
                      <div className="rh-fin-plazo-sub">{plazoSubtitle(p.tasa_interes)}</div>
                    </div>
                    <div className="rh-fin-plazo-monthly">
                      USD {fmtN2(p.mensualidad)}<span className="rh-fin-plazo-monthly-suffix"> /mes</span>
                    </div>
                  </label>
                );
              })}
              {!plazoCards.length && (
                <span className="muted">Sin plazos para esta combinación.</span>
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
  );
}
