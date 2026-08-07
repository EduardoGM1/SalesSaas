import { useEffect, useMemo, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";

function monthBounds(ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export function RhCalendarioComisionesPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!empresaId) return;
    const { from, to } = monthBounds(ym);
    royalHolidayApi
      .listComisiones(empresaId, { workspaceId, from, to })
      .then(setRows)
      .catch((e) => toast.error(e.message));
  }, [empresaId, workspaceId, ym]);

  const byDay = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const d = r.fecha_pago;
      if (!map[d]) map[d] = [];
      map[d].push(r);
    }
    return map;
  }, [rows]);

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;

  return (
    <RhToolShell title="Calendario comisiones">
      <div className="card tool-calc-card">
        <div className="page-toolbar page-toolbar--between">
          <div className="card-heading" style={{ margin: 0 }}>Mes</div>
          <input className="input" type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
        </div>
        <div className="admin-users-table-wrap" style={{ marginTop: 12 }}>
          <table className="client-table">
            <thead>
              <tr>
                <th>Fecha pago</th>
                <th>Tipo</th>
                <th>%</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>HC</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="muted">Sin movimientos este mes.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha_pago}</td>
                  <td>{r.tipo}</td>
                  <td>{r.porcentaje}</td>
                  <td>{Number(r.monto_comision).toFixed(2)}</td>
                  <td>{r.estado}</td>
                  <td>{r.rh_ventas?.holiday_credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted rh-hint">{Object.keys(byDay).length} día(s) con pagos programados.</p>
      </div>
    </RhToolShell>
  );
}
