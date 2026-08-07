import { useEffect, useMemo, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { lookupBottomLine } from "@/lib/calculations/royal-holiday.js";
import { toast } from "@/lib/toast";

export function RhCreditosPage() {
  const { empresaId, ready } = useRhEmpresa();
  const [catalogo, setCatalogo] = useState(null);
  const [hc, setHc] = useState("10000");

  useEffect(() => {
    if (!empresaId) return;
    royalHolidayApi.getCatalogo(empresaId).then(setCatalogo).catch((e) => toast.error(e.message));
  }, [empresaId]);

  const match = useMemo(
    () => lookupBottomLine(catalogo?.bottom_line || [], hc),
    [catalogo, hc],
  );

  const tiers = useMemo(() => {
    const rows = [...(catalogo?.bottom_line || [])].sort((a, b) => Number(a.holiday_credits) - Number(b.holiday_credits));
    return rows;
  }, [catalogo]);

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;

  return (
    <RhToolShell title="Calculadora de Créditos">
      <div className="card tool-calc-card">
        <div className="card-heading">Explorar créditos (HC)</div>
        <div className="frow tool-frow">
          <div className="flabel">HC</div>
          <input className="input tool-num-input" type="number" value={hc} onChange={(e) => setHc(e.target.value)} />
        </div>
        <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
          <div className="vbox blue"><div className="vbox-val">{match?.holiday_credits ?? "—"}</div><div className="vbox-label">Tier HC</div></div>
          <div className="vbox green"><div className="vbox-val">{match?.programa || "—"}</div><div className="vbox-label">Programa</div></div>
          <div className="vbox yellow"><div className="vbox-val">{match?.precio_minimo_con_iva ?? "—"}</div><div className="vbox-label">Board online</div></div>
          <div className="vbox"><div className="vbox-val">{match?.cuota_anual_mfee ?? "—"}</div><div className="vbox-label">M.Fee anual</div></div>
        </div>
      </div>
      <div className="card tool-calc-card" style={{ marginTop: 12 }}>
        <div className="card-heading">Niveles del catálogo</div>
        <div className="admin-users-table-wrap">
          <table className="client-table">
            <thead><tr><th>HC</th><th>Programa</th><th>Mín s/IVA</th><th>Mín c/IVA</th><th>M.Fee</th></tr></thead>
            <tbody>
              {tiers.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHc(String(r.holiday_credits))}>
                      {r.holiday_credits}
                    </button>
                  </td>
                  <td>{r.programa}</td>
                  <td>{r.precio_minimo_sin_iva}</td>
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
