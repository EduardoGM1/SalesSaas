import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Info, ShoppingCart, Landmark } from "lucide-react";

function fmtUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

function vigenciaFromCatalog(bl, catalogo) {
  const years = bl?.vigencia_anios ?? catalogo?.parametros?.vigencia_anios;
  if (years != null && Number.isFinite(Number(years))) return `${Number(years)} años`;
  const meses = bl?.vigencia_meses ?? catalogo?.parametros?.vigencia_meses;
  if (meses != null && Number.isFinite(Number(meses))) {
    const y = Math.round(Number(meses) / 12);
    return y > 0 ? `${y} años` : `${meses} meses`;
  }
  return null;
}

/**
 * Tab «Datos Venta» — layout de dos columnas (programa + regalos).
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
  moneda,
  posicionesDisponibles,
  regalosLista,
  showExtras = false,
}) {
  const { fmtResult } = moneda;

  const regaloTotals = useMemo(() => {
    let venta = 0;
    let closing = 0;
    for (const g of regalosLista) {
      const qty = Math.max(1, Number(form.regalosCantidad?.[g.id] ?? 1) || 1);
      const line = (Number(g.costo) || 0) * qty;
      const carga = form.regalosElegidos[g.id];
      if (!carga) continue;
      if (isVentaCarga(carga)) venta += line;
      else if (isClosingCarga(carga)) closing += line;
    }
    return { venta, closing, total: venta + closing };
  }, [regalosLista, form.regalosElegidos, form.regalosCantidad]);

  const vigencia = vigenciaFromCatalog(bl, catalogo);

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

  const setRegaloColumnAmount = (regalo, column, amountKey) => {
    const qty = Math.max(1, Number(form.regalosCantidad?.[regalo.id] ?? 1) || 1);
    const lineTotal = (Number(regalo.costo) || 0) * qty;
    if (amountKey === "zero") {
      const other = column === "venta" ? "closing" : "venta";
      const otherCarga = pickCargaForColumn(regalo.cargas_permitidas, other);
      if (otherCarga && form.regalosElegidos[regalo.id] && (
        (column === "venta" && isVentaCarga(form.regalosElegidos[regalo.id]))
        || (column === "closing" && isClosingCarga(form.regalosElegidos[regalo.id]))
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

  return (
    <section className="worksheet-rh-venta">
      <div className="worksheet-rh-venta-grid">
        <div className="worksheet-rh-venta-left">
          <div className="card tool-calc-card">
            <div className="card-heading">Programa y créditos</div>
            <dl className="rh-programa-kv">
              <div>
                <dt>Puntos / Créditos</dt>
                <dd>
                  <input
                    className="input tool-num-input rh-programa-credits-input"
                    type="number"
                    disabled={readOnly}
                    value={form.holiday_credits}
                    onChange={(e) => set("holiday_credits", e.target.value)}
                  />
                </dd>
              </div>
              <div>
                <dt>Programa</dt>
                <dd className="rh-readonly">{bl?.programa || "—"}</dd>
              </div>
              <div>
                <dt>Cuota anual</dt>
                <dd className="rh-readonly">{bl?.cuota_anual_mfee != null ? fmtUsd(bl.cuota_anual_mfee) : "—"}</dd>
              </div>
              {vigencia ? (
                <div>
                  <dt>Vigencia</dt>
                  <dd className="rh-readonly">{vigencia}</dd>
                </div>
              ) : null}
            </dl>
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

          <div className="card tool-calc-card">
            <div className="card-heading">IPV – FVI (Regalos / Promociones disponibles)</div>
            {!ws.regalos_filtrados_por_monto && regalosLista.length > 0 ? (
              <p className="muted rh-hint">Captura monto de venta en Datos Financiamiento para filtrar regalos por rango USD.</p>
            ) : null}
            <ol className="rh-ipv-list">
              {regalosLista.length === 0 ? (
                <li className="muted">Sin regalos en catálogo para esta venta</li>
              ) : null}
              {regalosLista.map((g, index) => (
                <li key={g.id}>
                  <span className="rh-ipv-index">{index + 1}</span>
                  <span className="rh-ipv-name">{g.nombre}</span>
                  <select
                    className="input input-compact"
                    disabled={readOnly}
                    value={form.regalosElegidos[g.id] || ""}
                    onChange={(e) => setRegaloCarga(g.id, e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {(g.cargas_permitidas || []).map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="card tool-calc-card worksheet-rh-venta-regalos">
          <div className="card-heading">Regalos y cargos</div>
          <p className="muted rh-hint rh-regalos-sub">
            Selecciona los regalos que se darán y define en qué concepto se aplicará su costo.
          </p>
          <div className="rh-regalos-table-wrap">
            <table className="client-table rh-regalos-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Regalos</th>
                  <th>Cantidad</th>
                  <th>Costo unitario (MXN)</th>
                  <th className="rh-col-venta">Venta (Monto venta)</th>
                  <th className="rh-col-closing">Closing (Gasto adm.)</th>
                </tr>
              </thead>
              <tbody>
                {regalosLista.length === 0 ? (
                  <tr><td colSpan={6} className="muted">Sin regalos en catálogo para esta venta</td></tr>
                ) : null}
                {regalosLista.map((g, index) => {
                  const qty = Math.max(1, Number(form.regalosCantidad?.[g.id] ?? 1) || 1);
                  const unit = Number(g.costo) || 0;
                  const lineTotal = unit * qty;
                  const carga = form.regalosElegidos[g.id];
                  const ventaSelected = isVentaCarga(carga);
                  const closingSelected = isClosingCarga(carga);
                  return (
                    <tr key={g.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="rh-regalo-name">
                          {g.nombre}
                          {g.notas ? (
                            <span className="rh-regalo-info" title={g.notas} aria-label={g.notas}>
                              <Info size={14} />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          className="input input-compact rh-qty-input"
                          disabled={readOnly}
                          value={qty}
                          onChange={(e) => setRegaloQty(g.id, e.target.value)}
                        />
                      </td>
                      <td>{unit > 0 ? fmtUsd(unit) : "—"}</td>
                      <td className="rh-col-venta">
                        <select
                          className="input input-compact"
                          disabled={readOnly || !pickCargaForColumn(g.cargas_permitidas, "venta")}
                          value={ventaSelected && lineTotal > 0 ? "full" : "zero"}
                          onChange={(e) => setRegaloColumnAmount(g, "venta", e.target.value)}
                        >
                          <option value="zero">{fmtUsd(0)}</option>
                          {lineTotal > 0 ? <option value="full">{fmtUsd(lineTotal)}</option> : null}
                        </select>
                      </td>
                      <td className="rh-col-closing">
                        <select
                          className="input input-compact"
                          disabled={readOnly || !pickCargaForColumn(g.cargas_permitidas, "closing")}
                          value={closingSelected && lineTotal > 0 ? "full" : "zero"}
                          onChange={(e) => setRegaloColumnAmount(g, "closing", e.target.value)}
                        >
                          <option value="zero">{fmtUsd(0)}</option>
                          {lineTotal > 0 ? <option value="full">{fmtUsd(lineTotal)}</option> : null}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="g2 survey-result-pair rh-regalos-totales">
        <div className="vbox green">
          <div className="vbox-val rh-total-with-icon">
            <ShoppingCart size={16} aria-hidden />
            {fmtUsd(regaloTotals.venta)}
          </div>
          <div className="vbox-label">Total aplicado a Monto venta</div>
        </div>
        <div className="vbox purple">
          <div className="vbox-val rh-total-with-icon">
            <Landmark size={16} aria-hidden />
            {fmtUsd(regaloTotals.closing)}
          </div>
          <div className="vbox-label">Total aplicado a Gasto adm.</div>
        </div>
        <div className="vbox rh-regalos-total-combined">
          <div className="vbox-val">{fmtUsd(regaloTotals.total)}</div>
          <div className="vbox-label">Total regalos aplicados</div>
          <div className="vbox-sub">Venta + Gasto adm.</div>
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
