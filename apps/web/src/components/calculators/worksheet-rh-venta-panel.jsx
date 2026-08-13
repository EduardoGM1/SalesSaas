import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Gift, Info, ShoppingCart, Landmark } from "lucide-react";
import {
  cantidadEsEditable,
  cantidadRegalo,
  deltaMontoVsBottomLine,
  evaluarRegaloWorksheet,
  lookupBottomLineByMonto,
  ordenarRegalosExcel,
  restriccionesRegalo,
  totalLineaRegalo,
  totalesRegalosAplicados,
} from "@/lib/calculations/royal-holiday.js";

function isVentaCarga(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "venta" || s.includes("venta");
}

function isClosingCarga(carga) {
  const s = String(carga || "").toLowerCase();
  return s === "closing_cost" || s.includes("closing");
}

function isSinCostoCarga(carga) {
  const s = String(carga || "").toLowerCase().replace(/\s+/g, "_");
  return s === "sin_costo" || s.startsWith("sin_costo");
}

function pickCargaForColumn(cargas, column) {
  const list = Array.isArray(cargas) ? cargas : [];
  if (column === "venta") {
    return list.find((c) => isVentaCarga(c)) || list.find((c) => !isClosingCarga(c) && !isSinCostoCarga(c)) || list[0] || "";
  }
  return list.find((c) => isClosingCarga(c)) || "";
}

function fmtRegaloCosto(ev, fmtResult) {
  if (ev.costoUnitario == null) return "Monto";
  const n = ev.costoUnitario;
  if (ev.monedaCosto === "MXN") {
    return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  }
  return fmtResult(n);
}

function fmtLineAmount(amount, ev, fmtResult) {
  if (ev.monedaCosto === "MXN") {
    return `$${Number(amount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  }
  return fmtResult(amount);
}

function fmtDelta(delta, fmtResult) {
  if (delta == null) return "—";
  const abs = fmtResult(Math.abs(delta));
  if (delta > 0.009) return `Por encima ${abs}`;
  if (delta < -0.009) return `Por debajo ${abs}`;
  return "Al precio de Tabla 1";
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
  const cuotaAnualNum = Number(bl?.cuota_anual_mfee) || 0;
  const mxnToUsd = (n) => moneda.convertir(n, "MXN", moneda.monedaOperativa);

  const regalosEvaluados = useMemo(() => {
    const list = ordenarRegalosExcel(regalosCatalogo || []);
    const grupoMontos = {};
    for (const g of list) {
      const r = restriccionesRegalo(g);
      if (!r.grupo_tope) continue;
      const carga = form.regalosElegidos?.[g.id];
      if (!carga || isSinCostoCarga(carga)) continue;
      const qty = cantidadRegalo(g, form.regalosCantidad);
      grupoMontos[r.grupo_tope] = (grupoMontos[r.grupo_tope] || 0) + totalLineaRegalo(g, {
        qty,
        cuotaAnual: cuotaAnualNum,
      });
    }
    return list.map((g) => {
      const r = restriccionesRegalo(g);
      const qty = cantidadRegalo(g, form.regalosCantidad);
      const others = { ...grupoMontos };
      if (r.grupo_tope) {
        others[r.grupo_tope] = Math.max(
          0,
          (others[r.grupo_tope] || 0) - totalLineaRegalo(g, { qty, cuotaAnual: cuotaAnualNum }),
        );
      }
      return {
        regalo: g,
        qty,
        ev: evaluarRegaloWorksheet(g, {
          holidayCredits: hc,
          montoVenta: mv,
          cuotaAnual: cuotaAnualNum,
          qty,
          grupoMontosOtros: others,
        }),
      };
    });
  }, [regalosCatalogo, hc, mv, cuotaAnualNum, form.regalosElegidos, form.regalosCantidad]);

  const bottomLineRows = useMemo(
    () => [...(catalogo?.bottom_line || [])].sort(
      (a, b) => Number(a.holiday_credits) - Number(b.holiday_credits),
    ),
    [catalogo?.bottom_line],
  );

  const selectedHc = String(form.holiday_credits ?? "");

  const regaloTotals = useMemo(
    () => totalesRegalosAplicados(regalosCatalogo, form, {
      holidayCredits: hc,
      montoVenta: mv,
      cuotaAnual: cuotaAnualNum,
      mxnToUsd,
    }),
    [regalosCatalogo, form.regalosElegidos, form.regalosCantidad, hc, mv, cuotaAnualNum, moneda.ctx],
  );

  const cuotaAnual = bl?.cuota_anual_mfee != null ? fmtResult(bl.cuota_anual_mfee) : "—";
  const precioMin = bl?.precio_minimo_con_iva != null ? fmtResult(bl.precio_minimo_con_iva) : "—";
  const blByMonto = useMemo(
    () => lookupBottomLineByMonto(bottomLineRows, montoOperational || montoCapture),
    [bottomLineRows, montoOperational, montoCapture],
  );
  const deltaTabla1 = useMemo(
    () => deltaMontoVsBottomLine(montoOperational || montoCapture, bl),
    [montoOperational, montoCapture, bl],
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

  const setRegaloQty = (regalo, raw) => {
    touchDirty(`regalo_qty_${regalo.id}`);
    const r = restriccionesRegalo(regalo);
    let qty;
    if (r.cantidad_es_monto) {
      qty = raw === "" ? "" : Math.max(0, Number(raw) || 0);
    } else {
      qty = Math.max(1, Math.min(99, Number(raw) || 1));
    }
    patchForm((f) => ({
      ...f,
      regalosCantidad: { ...(f.regalosCantidad || {}), [regalo.id]: qty },
    }));
  };

  const setRegaloColumnChecked = (regalo, ev, column, checked) => {
    if (ev.estado !== "elegible") return;
    if (!checked) {
      setRegaloCarga(regalo.id, "");
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

    const carga = form.regalosElegidos[regalo.id];
    const selected = column === "venta" ? isVentaCarga(carga) : isClosingCarga(carga);
    const label = column === "venta" ? "Cargar a venta" : "Cargar a closing";

    return (
      <label className="rh-carga-check">
        <input
          type="checkbox"
          disabled={readOnly}
          checked={selected}
          aria-label={label}
          onChange={(e) => setRegaloColumnChecked(regalo, ev, column, e.target.checked)}
        />
      </label>
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
            <div className="frow tool-frow">
              <div className="flabel">Vs precio Tabla 1</div>
              <div className={`rh-readonly rh-field-val${deltaTabla1 != null && deltaTabla1 < 0 ? " rh-warn-text" : ""}`}>
                {fmtDelta(deltaTabla1, fmtResult)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card tool-calc-card worksheet-rh-venta-regalos">
        <div className="card-heading">Regalos y cargos</div>
        <p className="muted rh-hint rh-regalos-sub">
          Selecciona los regalos que se darán y define en qué concepto se aplicará su costo.
          All inclusive + certificado de vuelo no pueden sumar más de $1,500 USD.
        </p>
        <p className="muted rh-hint rh-regalos-scroll-hint">
          Desliza horizontalmente para ver todas las columnas.
        </p>
        <div className="rh-regalos-table-wrap">
          <table className="client-table rh-regalos-table">
            <thead>
              <tr>
                <th className="rh-col-name">Regalo</th>
                <th className="rh-col-qty">Cantidad</th>
                <th className="rh-col-cost">Costo unit.</th>
                <th className="rh-col-total">Total</th>
                <th className="rh-col-closing">Closing cost</th>
                <th className="rh-col-venta">Venta</th>
              </tr>
            </thead>
            <tbody>
              {regalosEvaluados.length === 0 ? (
                <tr><td colSpan={6} className="muted">Sin regalos en catálogo</td></tr>
              ) : null}
              {regalosEvaluados.map(({ regalo: g, ev, qty }) => {
                const r = restriccionesRegalo(g);
                const lineTotal = totalLineaRegalo(g, { qty, cuotaAnual: cuotaAnualNum });
                const rowDisabled = readOnly || ev.estado !== "elegible";
                const qtyEditable = cantidadEsEditable(g);
                const warn = ev.aviso || ev.motivo;
                const rowTitle = [warn, g.notas].filter(Boolean).join(" · ") || undefined;
                const includedSinCosto = isSinCostoCarga(form.regalosElegidos[g.id]);
                return (
                  <tr
                    key={g.id}
                    className={ev.estado !== "elegible" ? "rh-regalo-row-disabled" : (ev.aviso ? "rh-regalo-row-warn" : undefined)}
                    title={rowTitle}
                  >
                    <td className="rh-col-name">
                      <span className="rh-regalo-name">
                        {g.nombre}
                        {warn ? (
                          <span className="rh-regalo-info" title={warn} aria-label={warn}>
                            <AlertTriangle size={14} />
                          </span>
                        ) : g.notas ? (
                          <span className="rh-regalo-info" title={g.notas} aria-label={g.notas}>
                            <Info size={14} />
                          </span>
                        ) : null}
                      </span>
                      {ev.permiteSinCosto ? (
                        <label className="rh-regalo-include">
                          <input
                            type="checkbox"
                            disabled={rowDisabled}
                            checked={includedSinCosto}
                            onChange={(e) => setRegaloCarga(g.id, e.target.checked ? "sin_costo" : "")}
                          />
                          Incluir
                        </label>
                      ) : null}
                      {ev.bonoHc != null ? (
                        <div className="muted rh-regalo-bonus">
                          Bono {Math.round(ev.bonoHc).toLocaleString("es-MX")} HC extra
                        </div>
                      ) : null}
                      {r.activacion_usd != null ? (
                        <div className="muted rh-regalo-bonus">
                          Activación socio {fmtResult(r.activacion_usd)}
                        </div>
                      ) : null}
                    </td>
                    <td className="rh-col-qty">
                      {!qtyEditable ? (
                        <span className="rh-cell-na">{ev.permiteSinCosto ? "—" : qty}</span>
                      ) : (
                        <input
                          type="number"
                          min={r.cantidad_es_monto ? 0 : 1}
                          max={r.cantidad_es_monto ? undefined : 99}
                          step={r.cantidad_es_monto ? "0.01" : "1"}
                          className={`input input-compact rh-qty-input${r.cantidad_es_monto ? " rh-qty-amount" : ""}`}
                          disabled={readOnly}
                          value={form.regalosCantidad?.[g.id] ?? qty}
                          onChange={(e) => setRegaloQty(g, e.target.value)}
                        />
                      )}
                    </td>
                    <td className="rh-col-cost">{fmtRegaloCosto(ev, fmtResult)}</td>
                    <td className="rh-col-total">
                      {ev.permiteSinCosto ? "—" : fmtLineAmount(lineTotal, ev, fmtResult)}
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
