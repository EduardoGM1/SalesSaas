import { useEffect, useMemo, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { lookupBottomLine } from "@/lib/calculations/royal-holiday.js";
import { toast } from "@/lib/toast";

export function RhBottomLinesPage() {
  const { empresaId, ready } = useRhEmpresa();
  const [catalogo, setCatalogo] = useState(null);
  const [hc, setHc] = useState("10000");

  useEffect(() => {
    if (!empresaId) return;
    royalHolidayApi.getCatalogo(empresaId).then(setCatalogo).catch((e) => toast.error(e.message));
  }, [empresaId]);

  const row = useMemo(
    () => lookupBottomLine(catalogo?.bottom_line || [], hc),
    [catalogo, hc],
  );

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;

  return (
    <RhToolShell title="Calculadora B. Lines">
      {!empresaId && <p className="muted">Activa un workspace Royal Holiday.</p>}
      <div className="card tool-calc-card">
        <div className="card-heading">Holiday Credits</div>
        <div className="frow tool-frow">
          <div className="flabel">HC</div>
          <input className="input tool-num-input" type="number" value={hc} onChange={(e) => setHc(e.target.value)} />
        </div>
        <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
          <div className="vbox blue"><div className="vbox-val">{row?.programa || "—"}</div><div className="vbox-label">Programa</div></div>
          <div className="vbox green"><div className="vbox-val">{row?.precio_minimo_con_iva ?? "—"}</div><div className="vbox-label">Board / mín c/IVA</div></div>
          <div className="vbox yellow span2"><div className="vbox-val">{row?.cuota_anual_mfee ?? "—"}</div><div className="vbox-label">Cuota anual M.Fee</div></div>
        </div>
      </div>
      <div className="card tool-calc-card" style={{ marginTop: 12 }}>
        <div className="card-heading">Catálogo bottom line</div>
        <div className="admin-users-table-wrap">
          <table className="client-table">
            <thead><tr><th>Programa</th><th>HC</th><th>Mín c/IVA</th><th>M.Fee</th></tr></thead>
            <tbody>
              {(catalogo?.bottom_line || []).map((r) => (
                <tr key={r.id} className={row?.id === r.id ? "is-selected" : undefined}>
                  <td>{r.programa}</td>
                  <td>{r.holiday_credits}</td>
                  <td>{r.precio_minimo_con_iva}</td>
                  <td>{r.cuota_anual_mfee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RhToolShell>
  );
}
