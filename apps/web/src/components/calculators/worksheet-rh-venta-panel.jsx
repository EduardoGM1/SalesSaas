import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Gift, Info, ShoppingCart, Landmark } from "lucide-react";
import { evaluarRegaloWorksheet } from "@/lib/calculations/royal-holiday.js";

function isVentaCarga(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "venta" || s.includes("venta");
}

function isClosingCarga(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "closing_cost" || s.includes("closing");
}

function pickCargaForColumn(cargas, column) {
  const list = Array.isArray(cargas) ? cargas : [];
  if (column === "venta") {
    return list.find((c) => isVentaCarga(c)) || list.find((c) => !isClosingCarga(c)) || list[0] || "";
  }
  return list.find((c) => isClosingCarga(c)) || "";
}

/** Mayor tier de bottom_line cuyo precio mínimo c/IVA no supera el monto. */
function lookupBottomLineByMonto(rows, monto) {
  const m = Number(monto) || 0;
  if (m <= 0) return null;
  const sorted = [...(rows || [])].sort(
    (a, b) => Number(a.precio_minimo_con_iva) - Number(b.precio_minimo_con_iva),
  );
  let best = null;
  for (const row of sorted) {
    if (Number(row.precio_minimo_con_iva) <= m) best = row;
  }
  return best;
}

function fmtRegaloCosto(ev, fmtResult) {
  if (ev.costoUnitario == null) return "—";
  const n = ev.costoUnitario;
  if (ev.monedaCosto === "MXN") {
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  }
  return fmtResult(n);
}

function fmtLineAmount(amount, ev, fmtResult) {
  if (ev.monedaCosto === "MXN") {
    return `$${amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return fmtResult(amount);
}

/**
 * Tab «Datos Venta» — 3 cards de cruce (créditos, catálogo, monto) + regalos full-width.
 * Solo presentación; cálculos y persistencia vía props del worksheet RH.
 */
export function WorksheetRhVentaPanel({
  form,
  set,
  patchForm,
  readOnly,
  dirtyKeysRef,
  ws,
  catalogo,
  bl,
  boardOnline,
  boardOk,
  blDifer,
  montoCapture,
  montoOperational,
  moneda,
  posicionesDisponibles,
  regalosCatalogo,
  showExtras = false,
}) {
  const { fmtResult } = moneda;
  const hc = Number(form.holiday_credits) || 0;
  const mv = Number(montoOperational) || 0;

  const regalosEvaluados = useMemo(
    () => (regalosCatalogo || []).map((g) => ({
      regalo: g,
      ev: evaluarRegaloWorksheet(g, { holidayCredits: hc, montoVenta: mv }),
    })),
    [regalosCatalogo, hc, mv],
  );

  const bottomLineRows = useMemo(
    () => [...(catalogo?.bottom_line || [])].sort(
      (a, b) => Number(a.holiday_credits) - Number(b.holiday_credits),
    ),
    [catalogo?.bottom_line],
  );

  const selectedHc = String(form.holiday_credits ?? "");

  const regaloTotals = useMemo(() => {
    let venta = 0;
    let closing = 0;
    for (const { regalo: g, ev } of regalosEvaluados) {
      if (ev.estado !== "elegible") continue;
      const qty = Math.max(1, Number(form.regalosCantidad?.[g.id] ?? 1) || 1);
      const line = (ev.costoUnitario ?? 0) * qty;
      const carga = form.regalosElegidos[g.id];
      if (!carga) continue;
      if (isVentaCarga(carga)) venta += line;
      else if (isClosingCarga(carga)) closing += line;
    }
    return { venta, closing, total: venta + closing };
  }, [regalosEvaluados, form.regalosElegidos, form.regalosCantidad]);

  const cuotaAnual = bl?.cuota_anual_mfee != null ? fmtResult(bl.cuota_anual_mfee) : "—";
  const precioMin = bl?.precio_minimo_con_iva != null ? fmtResult(bl.precio_minimo_con_iva) : "—";
  const blByMonto = useMemo(
    () => lookupBottomLineByMonto(bottomLineRows, montoOperational || montoCapture),
    [bottomLineRows, montoOperational, montoCapture],
  );
  const montoDisplay = montoCapture
    ? moneda.fmtCaptureResult(montoCapture)
    : (montoOperational ? fmtResult(montoOperational) : "—");

  const touchDirty = (key) => {
    dirtyKeysRef?.current?.add(key);
  };

  const setRegaloCarga = (regaloId, carga) => {
    patchForm((f) => ({
      ...f,
      regalosElegidos: { ...f.regalosElegidos, [regaloId]: carga || "" },
    }));
  };

  const setRegaloQty = (regaloId, raw) => {
    touchDirty(`regalo_qty_${regaloId}`);
    const qty = Math.max(1, Math.min(99, Number(raw) || 1));
    patchForm((f) => ({
      ...f,
      regalosCantidad: { ...(f.regalosCantidad || {}), [regaloId]: qty },
    }));
  };

  const setRegaloColumnAmount = (regalo, ev, column, amountKey) => {
    if (ev.estado !== "elegible") return;
    const qty = Math.max(1, Number(form.regalosCantidad?.[regalo.id] ?? 1) || 1);
    const lineTotal = (ev.costoUnitario ?? 0) * qty;
    if (amountKey === "zero") {
      const other = column === "venta" ? "closing" : "venta";
      const otherCarga = pickCargaForColumn(regalo.cargas_permitidas, other);
      const carga = form.regalosElegidos[regalo.id];
      if (otherCarga && carga && (
        (column === "venta" && isVentaCarga(carga))
        || (column === "closing" && isClosingCarga(carga))
      )) {
        setRegaloCarga(regalo.id, otherCarga);
      } else {
        setRegaloCarga(regalo.id, "");
      }
      return;
    }
    const carga = pickCargaForColumn(regalo.cargas_permitidas, column);
    if (carga) setRegaloCarga(regalo.id, carga);
  };

  const renderCargaCell = (regalo, ev, column) => {
    const permite = column === "venta" ? ev.permiteVenta : ev.permiteClosing;
    if (!permite) {
      return <span className="rh-cell-na">—</span>;
    }
    if (ev.estado !== "elegible") {
      return (
        <span className="rh-cell-na" title={ev.motivo || undefined}>
          —
        </span>
      );
    }

    const qty = Math.max(1, Number(form.regalosCantidad?.[regalo.id] ?? 1) || 1);
    const lineTotal = (ev.costoUnitario ?? 0) * qty;
    const carga = form.regalosElegidos[regalo.id];
    const selected = column === "venta" ? isVentaCarga(carga) : isClosingCarga(carga);

    return (
      <select
        className="input input-compact rh-carga-select"
        disabled={readOnly}
        value={selected && lineTotal > 0 ? "full" : "zero"}
        onChange={(e) => setRegaloColumnAmount(regalo, ev, column, e.target.value)}
      >
        <option value="zero">{fmtLineAmount(0, ev, fmtResult)}</option>
        {lineTotal > 0 ? (
          <option value="full">{fmtLineAmount(lineTotal, ev, fmtResult)}</option>
        ) : null}
      </select>
    );
  };

  return (
    <section className="worksheet-rh-venta">
      <div className="worksheet-rh-venta-top">
        <div className="card tool-calc-card">
          <div className="card-heading">Créditos</div>
          <p className="muted rh-hint rh-card-sub">Ingresa créditos; el resto se calcula solo.</p>
          <div className="tool-calc-fields">
            <div className="frow frow-first tool-frow">
              <div className="flabel">Puntos / Créditos</div>
              <div className="rh-credits-input">
                <input
                  className="input tool-num-input"
                  type="number"
                  disabled={readOnly}
                  value={form.holiday_credits}
                  onChange={(e) => set("holiday_credits", e.target.value)}
                />
                <span className="muted rh-credits-suffix">HC</span>
              </div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Programa</div>
              <div className="rh-readonly rh-field-val">{bl?.programa || "—"}</div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Precio</div>
              <div className="rh-readonly rh-field-val">{precioMin}</div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Cuota anual</div>
              <div className="rh-readonly rh-field-val">{cuotaAnual}</div>
            </div>
          </div>
        </div>

        <div className="card tool-calc-card">
          <div className="card-heading">Membresías</div>
          <p className="muted rh-hint rh-card-sub">Catálogo de referencia por nivel.</p>
          <div className="rh-bl-membership-scroll">
            <table className="client-table rh-mini-table rh-bl-membership-table">
              <thead>
                <tr>
                  <th>Membresía</th>
                  <th className="rh-col-num">Créditos</th>
                  <th className="rh-col-num">Precio</th>
                  <th className="rh-col-num">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {bottomLineRows.length === 0 ? (
                  <tr><td colSpan={4} className="muted">Sin membresías en catálogo</td></tr>
                ) : null}
                {bottomLineRows.map((row) => {
                  const rowHc = String(row.holiday_credits);
                  const selected = rowHc === selectedHc;
                  return (
                    <tr
                      key={row.id || `${row.programa}-${rowHc}`}
                      className={selected ? "is-selected rh-bl-row-selectable" : "rh-bl-row-selectable"}
                      onClick={() => !readOnly && set("holiday_credits", rowHc)}
                      title={`${row.programa} · ${rowHc} HC`}
                    >
                      <td>{row.programa || "—"}</td>
                      <td className="rh-col-num">
                        {Number(row.holiday_credits).toLocaleString("es-MX")}
                      </td>
                      <td className="rh-col-num">
                        {row.precio_minimo_con_iva != null ? fmtResult(row.precio_minimo_con_iva) : "—"}
                      </td>
                      <td className="rh-col-num">
                        {row.cuota_anual_mfee != null ? fmtResult(row.cuota_anual_mfee) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card tool-calc-card">
          <div className="card-heading">Monto de venta</div>
          <p className="muted rh-hint rh-card-sub">Se toma de Datos Financiamiento.</p>
          <div className="tool-calc-fields">
            <div className="frow frow-first tool-frow">
              <div className="flabel">Monto (Monto de venta)</div>
              <div className="rh-readonly rh-field-val">{montoDisplay}</div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Membresía acorde al monto</div>
              <div className="rh-readonly rh-field-val">{blByMonto?.programa || "—"}</div>
            </div>
            <div className="frow tool-frow">
              <div className="flabel">Créditos acorde al monto</div>
              <div className="rh-readonly rh-field-val">
                {blByMonto?.holiday_credits != null
                  ? Number(blByMonto.holiday_credits).toLocaleString("es-MX")
                  : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card tool-calc-card worksheet-rh-venta-regalos">
        <div className="card-heading">Regalos y cargos</div>
        <p className="muted rh-hint rh-regalos-sub">
          Selecciona los regalos que se darán y define en qué concepto se aplicará su costo.
        </p>
        <p className="muted rh-hint rh-regalos-scroll-hint">
          Desliza horizontalmente para ver todas las columnas.
        </p>
        <div className="rh-regalos-table-wrap">
          <table className="client-table rh-regalos-table">
            <thead>
              <tr>
                <th className="rh-col-num">#</th>
                <th className="rh-col-name">Regalo</th>
                <th className="rh-col-qty">Cant.</th>
                <th className="rh-col-cost">Costo unit.</th>
                <th className="rh-col-total">Total</th>
                <th className="rh-col-closing">Closing (Gasto adm.)</th>
                <th className="rh-col-venta">Venta (Monto venta)</th>
              </tr>
            </thead>
            <tbody>
              {regalosEvaluados.length === 0 ? (
                <tr><td colSpan={7} className="muted">Sin regalos en catálogo</td></tr>
              ) : null}
              {regalosEvaluados.map(({ regalo: g, ev }, index) => {
                const qty = Math.max(1, Number(form.regalosCantidad?.[g.id] ?? 1) || 1);
                const lineTotal = ev.costoUnitario != null ? (ev.costoUnitario ?? 0) * qty : null;
                const rowDisabled = readOnly || ev.estado !== "elegible";
                const rowTitle = [ev.motivo, g.notas].filter(Boolean).join(" · ") || undefined;
                return (
                  <tr
                    key={g.id}
                    className={ev.estado !== "elegible" ? "rh-regalo-row-disabled" : undefined}
                    title={rowTitle}
                  >
                    <td className="rh-col-num">{index + 1}</td>
                    <td className="rh-col-name">
                      <span className="rh-regalo-name">
                        {g.nombre}
                        {ev.motivo ? (
                          <span className="rh-regalo-info" title={ev.motivo} aria-label={ev.motivo}>
                            <AlertTriangle size={14} />
                          </span>
                        ) : g.notas ? (
                          <span className="rh-regalo-info" title={g.notas} aria-label={g.notas}>
                            <Info size={14} />
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="rh-col-qty">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        className="input input-compact rh-qty-input"
                        disabled={rowDisabled}
                        value={qty}
                        onChange={(e) => setRegaloQty(g.id, e.target.value)}
                      />
                    </td>
                    <td className="rh-col-cost">{fmtRegaloCosto(ev, fmtResult)}</td>
                    <td className="rh-col-total">
                      {lineTotal != null ? fmtLineAmount(lineTotal, ev, fmtResult) : "—"}
                    </td>
                    <td className="rh-col-closing">{renderCargaCell(g, ev, "closing")}</td>
                    <td className="rh-col-venta">{renderCargaCell(g, ev, "venta")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="g2 survey-result-pair rh-regalos-totales">
          <div className="vbox green rh-total-box">
            <div className="vbox-val rh-total-with-icon">
              <ShoppingCart size={16} aria-hidden />
              {fmtResult(regaloTotals.venta)}
            </div>
            <div className="vbox-label">Total aplicado a Monto venta</div>
          </div>
          <div className="vbox purple rh-total-box">
            <div className="vbox-val rh-total-with-icon">
              <Landmark size={16} aria-hidden />
              {fmtResult(regaloTotals.closing)}
            </div>
            <div className="vbox-label">Total aplicado a Gasto adm.</div>
          </div>
          <div className="vbox rh-total-box rh-regalos-total-combined">
            <div className="vbox-val rh-total-with-icon">
              <Gift size={16} aria-hidden />
              {fmtResult(regaloTotals.total)}
            </div>
            <div className="vbox-label">Total regalos aplicados</div>
            <div className="vbox-sub">Venta + Gasto adm.</div>
          </div>
        </div>
      </div>

      {showExtras ? (
        <>
          <div className="card tool-calc-card rh-bl-compact">
            <div className="card-heading">Bottom Line</div>
            <div className="rh-bl-box">
              <div className="rh-bl-main">
                BL = <strong>{fmtResult(boardOnline ?? bl?.precio_minimo_con_iva ?? 0)}</strong>
                {boardOk === true && <CheckCircle2 size={16} className="rh-ok" />}
                {boardOk === false && <AlertTriangle size={16} className="rh-warn" />}
              </div>
              <ul className="rh-bl-list">
                <li>Monto = <strong>{montoCapture ? moneda.fmtCaptureResult(montoCapture) : "—"}</strong></li>
                <li>
                  Difer = <strong className={blDifer != null && blDifer < 0 ? "rh-warn-text" : ""}>
                    {blDifer != null ? fmtResult(blDifer) : "—"}
                  </strong>
                </li>
              </ul>
            </div>
            {ws.comision?.pendiente ? (
              <p className="rh-warn-text rh-hint">{ws.comision.mensaje}</p>
            ) : ws.comision ? (
              <p className="muted rh-hint">
                Comisión {ws.comision.porcentaje}% → {fmtResult(ws.comision.monto)} · pago {ws.comision.fecha_pago}
              </p>
            ) : null}
            <div className="frow tool-frow rh-programa-posicion">
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
        </>
      ) : null}
    </section>
  );
}
