import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import { parseMoney } from "@/lib/format/money";
import { participantsApi } from "@/lib/participants-api.js";
import { cargaIncluyeClosing } from "@/lib/calculations/royal-holiday.js";

function isClosingCarga(carga) {
  return cargaIncluyeClosing(carga);
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function fmtPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return null;
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(2)}%`;
}

function formatPlanCuotas({ saldo, numPagos, pagos, pct, fmt }) {
  const n = Number(numPagos) || 0;
  const restante = Math.max(0, Number(saldo) || 0);
  if (restante <= 0) return null;
  const cuotaPagos = parseMoney(pagos?.[0]?.monto);
  const cuota = n > 0 ? roundMoney(restante / n) : cuotaPagos;
  const pctPart = fmtPct(pct);
  if (n > 0 && cuota > 0) {
    const split = pctPart
      ? `${pctPart} ÷ ${n} meses = ${fmt(cuota)}`
      : `${n} meses = ${fmt(cuota)}`;
    return `${split} · ${fmt(restante)}`;
  }
  return pctPart ? `${pctPart} = ${fmt(restante)}` : fmt(restante);
}

function dash(value) {
  if (value == null || value === "") return "—";
  return value;
}

function participantName(profile) {
  const name = profile?.full_name || profile?.email || "";
  return String(name).trim() || null;
}

function capturedTextName(value) {
  return String(value ?? "").trim() || null;
}

function HojaField({ label, value, hint, pending, writeIn }) {
  const empty = value == null || value === "";
  if (writeIn && empty) {
    return <HojaWriteLine label={label} hint={hint} />;
  }
  return (
    <div className={`rh-hoja-field${pending ? " rh-hoja-field--pending" : ""}`}>
      <div className="frow tool-frow">
        <div className="flabel">{label}</div>
        <div className="rh-readonly rh-field-val">{dash(value)}</div>
      </div>
      {hint ? <p className="muted rh-hint rh-hoja-field-hint rh-hoja-screen-only">{hint}</p> : null}
    </div>
  );
}

function HojaFirma({ label, name }) {
  return (
    <div className="rh-hoja-firma">
      <div className={`rh-hoja-firma-line${name ? " rh-hoja-firma-line--named" : ""}`}>
        {name || ""}
      </div>
      <div className="rh-hoja-firma-label">{label}</div>
      {!name ? (
        <div className="muted rh-hint rh-hoja-firma-empty rh-hoja-screen-only">Sin asignar</div>
      ) : null}
    </div>
  );
}
function HojaWriteLine({ label, hint }) {
  return (
    <div className="rh-hoja-write">
      <div className="flabel">{label}</div>
      <div className="rh-hoja-write-line" />
      {hint ? <p className="muted rh-hint rh-hoja-field-hint rh-hoja-screen-only">{hint}</p> : null}
    </div>
  );
}

/**
 * Vista consolidada de solo lectura — organización de la hoja física RH.
 * Datos personales son líneas en blanco para rellenar a mano al imprimir.
 */
export function WorksheetRhHojaPanel({
  form,
  set,
  readOnly,
  ws,
  catalogo,
  bl,
  boardOnline,
  boardOk,
  blDifer,
  montoCapture,
  moneda,
  posicionesDisponibles,
  regalosCatalogo,
  captureCurrency,
  client,
}) {
  const { fmtResult, fmtCaptureResult, toCaptureDisplay } = moneda || {};
  const [participantState, setParticipantState] = useState(null);
  const prospectId = client?.id || null;

  useEffect(() => {
    if (!prospectId) {
      setParticipantState(null);
      return undefined;
    }
    let cancelled = false;
    participantsApi.get(prospectId)
      .then((data) => {
        if (!cancelled) setParticipantState(data?.state || null);
      })
      .catch(() => {
        if (!cancelled) setParticipantState(null);
      });
    return () => { cancelled = true; };
  }, [prospectId]);
  const engPct = Number(form.enganche_pct || 0);
  const regalosVenta = Number(ws.regalos_totales?.venta || 0);
  const regalosClosing = Number(ws.regalos_totales?.closing || 0);

  const montoContratoCapture = ws.monto_contrato != null
    ? toCaptureDisplay(Number(ws.monto_contrato))
    : (Number(montoCapture) || 0) + toCaptureDisplay(regalosVenta);
  const precioCompra = montoContratoCapture > 0 ? fmtCaptureResult(montoContratoCapture) : null;

  const engancheTotalCapture = ws.totales?.enganche != null
    ? toCaptureDisplay(ws.totales.enganche)
    : (montoContratoCapture * engPct) / 100;
  const engancheHoy = parseMoney(form.enganche_hoy);
  const saldoEnganche = Math.max(0, engancheTotalCapture - engancheHoy);
  const pctEngancheHoy = montoContratoCapture > 0 ? (engancheHoy / montoContratoCapture) * 100 : 0;
  const pctSaldoEnganche = montoContratoCapture > 0 ? (saldoEnganche / montoContratoCapture) * 100 : 0;

  const gastoTotalCapture = toCaptureDisplay(Number(ws.costo_administrativo_usd || 0));
  const costoAdminBase = toCaptureDisplay(Number(ws.costo_administrativo_base_usd || 0));
  const gastoHoy = parseMoney(form.gasto_adm_hoy);
  const saldoGasto = Math.max(0, gastoTotalCapture - gastoHoy);
  const pctSaldoGasto = gastoTotalCapture > 0 ? (saldoGasto / gastoTotalCapture) * 100 : 0;

  const pactadoLabel = engPct
    ? `${fmtPct(engPct) || `${engPct}%`}${engancheTotalCapture > 0 ? ` = ${fmtCaptureResult(engancheTotalCapture)}` : ""}`
    : null;
  const pagadoLabel = engancheHoy > 0
    ? `${fmtPct(pctEngancheHoy) || ""}${fmtPct(pctEngancheHoy) ? " = " : ""}${fmtCaptureResult(engancheHoy)}`
    : null;

  const idpValue = formatPlanCuotas({
    saldo: saldoEnganche,
    numPagos: form.enganche_num_pagos,
    pagos: form.enganche_pagos,
    pct: pctSaldoEnganche,
    fmt: fmtCaptureResult,
  });
  const cdpsValue = formatPlanCuotas({
    saldo: saldoGasto,
    numPagos: form.gasto_num_pagos,
    pagos: form.gasto_pagos,
    pct: pctSaldoGasto,
    fmt: fmtCaptureResult,
  });

  const fin = ws.financiamiento_seleccionado;
  const plazoLabel = fin?.plazo_meses != null ? `${fin.plazo_meses} meses` : null;
  const interesLabel = fin?.tasa_interes != null && fin.tasa_interes !== ""
    ? `${Number(fin.tasa_interes).toFixed(2)}%`
    : null;
  const mensualidadLabel = ws.mensualidad != null ? fmtResult(ws.mensualidad) : null;

  const closingGifts = (regalosCatalogo || []).filter((g) => isClosingCarga(form.regalosElegidos?.[g.id]));
  const densePrint = closingGifts.length >= 3;
  const representanteName = participantName(participantState?.representante);
  const gerenteName = participantName(participantState?.gerente);
  const cerradorName = participantName(participantState?.cerrador);
  const promotorName = capturedTextName(form.opc);

  const tarjetas = catalogo?.parametros?.tarjetas_internas || ["Invex", "RCI"];
  const cargosAuto = [
    form.tarjeta_inmex_on && form.tarjeta_inmex
      ? `${tarjetas[0] || "Invex"} ${fmtCaptureResult(parseMoney(form.tarjeta_inmex))}`
      : form.tarjeta_inmex_on
        ? (tarjetas[0] || "Invex")
        : null,
    form.tarjeta_rci_on && form.tarjeta_rci
      ? `${tarjetas[1] || "RCI"} ${fmtCaptureResult(parseMoney(form.tarjeta_rci))}`
      : form.tarjeta_rci_on
        ? (tarjetas[1] || "RCI")
        : null,
  ].filter(Boolean);

  const contrato = client?.contract || client?.prospectCode || null;
  const tcLabel = moneda?.usdToMxn
    ? `1 USD = ${Number(moneda.usdToMxn).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} MXN`
    : null;
  const capturaHint = captureCurrency === "MXN" ? "Montos en moneda de captura (MXN)." : null;

  const creditos = Number(form.holiday_credits);
  const creditosLabel = Number.isFinite(creditos) && creditos > 0
    ? creditos.toLocaleString("es-MX")
    : null;

  const documentacionHint = regalosClosing > 0
    ? `Base ${fmtCaptureResult(costoAdminBase)} + regalos a closing.`
    : "Costo administrativo (750 / 950 según % enganche).";

  return (
    <section className={`worksheet-rh-hoja${densePrint ? " worksheet-rh-hoja--dense" : ""}`}>
      <div className={`card tool-calc-card rh-hoja-sheet${densePrint ? " rh-hoja-sheet--dense" : ""}`}>
        <div className="rh-hoja-header">
          <div>
            <div className="rh-hoja-title-row">
              <div className="card-heading rh-hoja-title">Hoja de trabajo</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm rh-hoja-print-btn rh-hoja-screen-only"
                onClick={() => window.print()}
              >
                <Printer size={16} aria-hidden />
                Imprimir
              </button>
            </div>
            <p className="muted rh-hint rh-hoja-sub rh-hoja-screen-only">
              Vista consolidada. Datos personales se rellenan a mano al imprimir.
            </p>
          </div>
          <div className="rh-hoja-meta">
            <HojaField label="No. de contrato" value={contrato} writeIn />
            <HojaField label="Fecha" writeIn />
          </div>
        </div>

        <div className="rh-hoja-section rh-hoja-section--keep">
          <div className="rh-hoja-section-title">Datos personales</div>
          <p className="muted rh-hint rh-hoja-personas-hint rh-hoja-screen-only">
            No se toman del expediente. Líneas en blanco para llenar a mano en la impresión.
          </p>
          <div className="rh-hoja-personas">
            <div className="rh-hoja-personas-row rh-hoja-personas-row--full">
              <HojaWriteLine label="Nombre Sr." />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--full">
              <HojaWriteLine label="Nombre Sra." />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--2">
              <HojaWriteLine label="Dirección" />
              <HojaWriteLine label="Colonia" />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--3">
              <HojaWriteLine label="Ciudad" />
              <HojaWriteLine label="País" />
              <HojaWriteLine label="Código Postal" />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--2">
              <HojaWriteLine label="Tel. Casa" />
              <HojaWriteLine label="Oficina" />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--3">
              <HojaWriteLine label="Nacionalidad" />
              <HojaWriteLine label="Estado Civil" />
              <HojaWriteLine label="Ocupación" />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--full">
              <HojaWriteLine label="E-mail" />
            </div>
            <div className="rh-hoja-personas-row rh-hoja-personas-row--2">
              <HojaWriteLine label="Identificación oficial" />
              <HojaWriteLine label="RFC" />
            </div>
          </div>
        </div>

        <div className="rh-hoja-section">
          <div className="rh-hoja-pago-keep">
          <div className="rh-hoja-section-title">Condiciones de pago</div>
          {capturaHint ? <p className="muted rh-hint rh-hoja-screen-only">{capturaHint}</p> : null}
          <div className="rh-hoja-pago-grid">
            <div className="rh-hoja-pago-col">
              <HojaField label="Tipo de Membresía" value={bl?.programa} />
              <HojaField label="No. de créditos anuales" value={creditosLabel} />
              <HojaField label="Primer año de uso" writeIn />
              <HojaField label="T.C." value={tcLabel} />
              <HojaField
                label="Cuota anual"
                value={bl?.cuota_anual_mfee != null ? fmtResult(bl.cuota_anual_mfee) : null}
              />
            </div>
            <div className="rh-hoja-pago-col">
              <HojaField label="Precio de compra" value={precioCompra} />
              <HojaField label="% Enganche pactado" value={pactadoLabel} />
              <HojaField label="Enganche pagado" value={pagadoLabel} />
              <HojaField
                label="I.D.P."
                value={idpValue}
                hint="Enganche: saldo a plazos (pactado − pagado hoy)."
              />
              <HojaField
                label="C.D.P.S."
                value={cdpsValue}
                hint="Costo de contrato: gasto administrativo a plazos."
              />
              <HojaField
                label="Saldo a financiar"
                value={ws.totales?.balanceAFinanciar != null ? fmtResult(ws.totales.balanceAFinanciar) : null}
              />
              <HojaField label="Plazo" value={plazoLabel} />
              <HojaField label="Interés %" value={interesLabel} />
              <HojaField label="Mensualidades" value={mensualidadLabel} />
              <HojaField label="Primera mensualidad" writeIn />
              <HojaField
                label="Documentación"
                value={gastoTotalCapture > 0 ? fmtCaptureResult(gastoTotalCapture) : null}
                hint={documentacionHint}
              />
            </div>
          </div>
          </div>
          <div className="rh-hoja-incentivos">
            <div className="rh-hoja-section-title rh-hoja-incentivos-title">
              Incentivos C.C.
              {regalosClosing > 0 ? ` · ${fmtResult(regalosClosing)}` : ""}
            </div>
            {closingGifts.length ? (
              <ul className="rh-hoja-incentivos-list">
                {closingGifts.map((g) => (
                  <li key={g.id} className="rh-hoja-incentivo">{g.nombre}</li>
                ))}
              </ul>
            ) : (
              <p className="rh-hoja-placeholder">—</p>
            )}
          </div>
        </div>

        <div className="rh-hoja-section rh-hoja-section--keep">
          <div className="rh-hoja-section-title">Notas</div>
          <div className="rh-hoja-ruled">
            <div className="rh-hoja-write-line" />
            <div className="rh-hoja-write-line" />
            <div className="rh-hoja-write-line" />
          </div>
        </div>

        <div className="rh-hoja-section rh-hoja-section--keep">
          <div className="rh-hoja-section-title">Cargos automáticos</div>
          <p className={cargosAuto.length ? "rh-readonly rh-field-val" : "rh-hoja-placeholder"}>
            {cargosAuto.length ? cargosAuto.join(" · ") : "—"}
          </p>
        </div>

        <div className="rh-hoja-section rh-hoja-section--keep rh-hoja-section--observaciones">
          <div className="rh-hoja-section-title">Observaciones</div>
          <div className="rh-hoja-ruled">
            <div className="rh-hoja-write-line" />
            <div className="rh-hoja-write-line" />
          </div>
        </div>
      </div>

      <div className="card tool-calc-card rh-bl-compact rh-hoja-screen-only">
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

      <div className="card tool-calc-card rh-hoja-equipo">
        <div className="card-heading">Equipo</div>
        <div className="rh-hoja-firmas">
          <HojaFirma label="Representante" name={representanteName} />
          <HojaFirma label="Gerente Financiero (1)" name={gerenteName} />
          <HojaFirma label="Gerente Financiero (2)" name={cerradorName} />
          <HojaFirma label="Promotor" name={promotorName} />
          <HojaFirma label="Programas" name={null} />
        </div>
      </div>
    </section>
  );
}
