import { useEffect, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { fetchSession } from "@/lib/session-api.js";
import { toast } from "@/lib/toast";

export function RhDiasDescansoPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [rows, setRows] = useState([]);
  const [userId, setUserId] = useState(null);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");

  const reload = async () => {
    if (!empresaId) return;
    const data = await royalHolidayApi.listDiasDescanso(empresaId, { workspaceId });
    setRows(data);
  };

  useEffect(() => {
    fetchSession().then((s) => setUserId(s?.user?.id || s?.profile?.id || null));
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    reload().catch((e) => toast.error(e.message));
  }, [empresaId, workspaceId]);

  const add = async () => {
    try {
      await royalHolidayApi.saveDiaDescanso(empresaId, {
        workspace_id: workspaceId,
        usuario_id: userId,
        fecha,
        tipo: "descanso",
        notas,
      });
      setNotas("");
      toast.success("Día de descanso guardado");
      await reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await royalHolidayApi.deleteDiaDescanso(empresaId, id);
      await reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;

  return (
    <RhToolShell title="Días de descanso">
      <div className="card tool-calc-card">
        <div className="card-heading">Registrar</div>
        <div className="tool-calc-fields">
          <div className="frow tool-frow">
            <div className="flabel">Fecha</div>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="frow tool-frow">
            <div className="flabel">Notas</div>
            <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="save-footer" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" disabled={!empresaId || !workspaceId || !userId} onClick={add}>
            Guardar
          </button>
        </div>
      </div>
      <div className="card tool-calc-card" style={{ marginTop: 12 }}>
        <div className="card-heading">Calendario / lista</div>
        <div className="admin-users-table-wrap">
          <table className="client-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Notas</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="muted">Sin días registrados.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.fecha}</td>
                  <td>{r.tipo}</td>
                  <td>{r.notas || "—"}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(r.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </RhToolShell>
  );
}
