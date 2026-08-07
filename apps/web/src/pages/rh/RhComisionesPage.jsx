import { useEffect, useMemo, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import {
  lookupComision,
  calcularFechaPagoComision,
  toDateStr,
  montoComision,
} from "@/lib/calculations/royal-holiday.js";
import { toast } from "@/lib/toast";

export function RhComisionesPage() {
  const { empresaId, ready } = useRhEmpresa();
  const [catalogo, setCatalogo] = useState(null);
  const [hc, setHc] = useState("10000");
  const [dp, setDp] = useState("15");
  const [posicion, setPosicion] = useState("ftb");
  const [monto, setMonto] = useState("10000");

  useEffect(() => {
    if (!empresaId) return;
    royalHolidayApi.getCatalogo(empresaId).then(setCatalogo).catch((e) => toast.error(e.message));
  }, [empresaId]);

  const row = useMemo(
    () => lookupComision(catalogo?.comisiones || [], {
      downPaymentPct: dp,
      holidayCredits: hc,
      posicion,
    }),
    [catalogo, dp, hc, posicion],
  );

  const fechaPago = toDateStr(calcularFechaPagoComision(new Date()));
  const montoCalc = row ? montoComision(monto, row.porcentaje_comision) : null;

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;

  return (
    <RhToolShell title="Calculadora Comisiones">
      <div className="card tool-calc-card">
        <div className="card-heading">Parámetros</div>
        <div className="tool-calc-fields">
          <div className="frow tool-frow"><div className="flabel">HC</div>
            <input className="input tool-num-input" type="number" value={hc} onChange={(e) => setHc(e.target.value)} /></div>
          <div className="frow tool-frow"><div className="flabel">Enganche %</div>
            <input className="input tool-num-input" type="number" value={dp} onChange={(e) => setDp(e.target.value)} /></div>
          <div className="frow tool-frow"><div className="flabel">Posición</div>
            <select className="input" value={posicion} onChange={(e) => setPosicion(e.target.value)}>
              <option value="ftb">FTB</option>
              <option value="liner">Liner</option>
              <option value="closer">Closer</option>
            </select>
          </div>
          <div className="frow tool-frow"><div className="flabel">Monto venta</div>
            <input className="input tool-num-input" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
        </div>
        <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
          <div className="vbox blue"><div className="vbox-val">{row ? `${row.porcentaje_comision}%` : "—"}</div><div className="vbox-label">% Comisión</div></div>
          <div className="vbox green"><div className="vbox-val">{montoCalc != null ? Number(montoCalc).toFixed(2) : "—"}</div><div className="vbox-label">Monto</div></div>
          <div className="vbox yellow span2"><div className="vbox-val">{fechaPago}</div><div className="vbox-label">Fecha pago</div></div>
        </div>
        {!row && <p className="muted rh-hint">Sin coincidencia en catálogo para esta combinación.</p>}
      </div>
    </RhToolShell>
  );
}
