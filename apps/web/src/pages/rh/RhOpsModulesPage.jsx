import { useEffect, useMemo, useState } from "react";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ModuleShell({ title, children }) {
  return (
    <RhToolShell title={title} backHref="/ops/rh">
      {children}
    </RhToolShell>
  );
}

export function RhPremanifiestoPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [fecha, setFecha] = useState(today);
  const [rows, setRows] = useState([]);
  const [nombre, setNombre] = useState("");

  const reload = () => {
    if (!empresaId) return;
    royalHolidayApi.listPremanifiesto(empresaId, { workspaceId, fecha }).then(setRows).catch((e) => toast.error(e.message));
  };
  useEffect(() => { if (ready && empresaId) reload(); }, [empresaId, workspaceId, fecha, ready]);

  const add = async () => {
    try {
      await royalHolidayApi.savePremanifiesto(empresaId, {
        workspace_id: workspaceId,
        fecha,
        prospect_nombre: nombre,
      });
      setNombre("");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  return (
    <ModuleShell title="Premanifiesto">
      <div className="card tool-calc-card">
        <div className="frow tool-frow"><div className="flabel">Fecha</div>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Prospecto</div>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="save-footer"><button type="button" className="btn btn-primary" onClick={add}>Agregar</button></div>
        <table className="client-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Nombre</th><th>Status</th><th>Notas</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.prospect_nombre}</td><td>{r.status}</td><td>{r.notes || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

export function RhLineaPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [fecha, setFecha] = useState(today);
  const [tab, setTab] = useState("asignacion");
  const [asig, setAsig] = useState([]);
  const [rot, setRot] = useState([]);
  const [notas, setNotas] = useState("");

  const reload = () => {
    if (!empresaId) return;
    royalHolidayApi.listAsignacion(empresaId, { workspaceId, fecha }).then(setAsig).catch(() => {});
    royalHolidayApi.listRotacion(empresaId, { workspaceId, fecha }).then(setRot).catch(() => {});
  };
  useEffect(() => { if (ready && empresaId) reload(); }, [empresaId, workspaceId, fecha, ready]);

  const add = async () => {
    try {
      if (tab === "asignacion") {
        await royalHolidayApi.saveAsignacion(empresaId, { workspace_id: workspaceId, fecha, notas });
      } else {
        await royalHolidayApi.saveRotacion(empresaId, {
          workspace_id: workspaceId,
          fecha,
          orden: rot.length + 1,
          notas,
        });
      }
      setNotas("");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  const rows = tab === "asignacion" ? asig : rot;
  return (
    <ModuleShell title="Línea">
      <nav className="admin-subnav">
        <button type="button" className={`admin-subnav-item${tab === "asignacion" ? " active" : ""}`} onClick={() => setTab("asignacion")}>Asignación</button>
        <button type="button" className={`admin-subnav-item${tab === "rotacion" ? " active" : ""}`} onClick={() => setTab("rotacion")}>Rotación</button>
      </nav>
      <div className="card tool-calc-card">
        <div className="frow tool-frow"><div className="flabel">Fecha</div>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Notas</div>
          <input className="input" value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
        <div className="save-footer"><button type="button" className="btn btn-primary" onClick={add}>Agregar</button></div>
        <table className="client-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Fecha</th><th>Detalle</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.fecha}</td><td>{r.notas || r.turno || r.rol || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

export function RhResumenOpsPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [range, setRange] = useState("dia");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    const now = new Date();
    let from;
    if (range === "dia") from = today();
    else if (range === "semana") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString().slice(0, 10);
    } else {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      from = d.toISOString().slice(0, 10);
    }
    royalHolidayApi.resumen(empresaId, { workspaceId, from }).then(setData).catch((e) => toast.error(e.message));
  }, [empresaId, workspaceId, range]);

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  return (
    <ModuleShell title="Resumen">
      <nav className="admin-subnav">
        {["dia", "semana", "mes"].map((k) => (
          <button key={k} type="button" className={`admin-subnav-item${range === k ? " active" : ""}`} onClick={() => setRange(k)}>
            {k === "dia" ? "Día" : k === "semana" ? "Semana" : "Mes"}
          </button>
        ))}
      </nav>
      <div className="g2 survey-result-pair">
        <div className="vbox blue"><div className="vbox-val">{data?.count ?? "—"}</div><div className="vbox-label">Ventas</div></div>
        <div className="vbox green"><div className="vbox-val">{data ? Number(data.total_monto).toFixed(0) : "—"}</div><div className="vbox-label">Monto</div></div>
      </div>
      <div className="card tool-calc-card" style={{ marginTop: 12 }}>
        <div className="card-heading">Por posición</div>
        <ul>
          {Object.entries(data?.by_posicion || {}).map(([k, v]) => (
            <li key={k}>{k.toUpperCase()}: {v}</li>
          ))}
          {!Object.keys(data?.by_posicion || {}).length && <li className="muted">Sin datos</li>}
        </ul>
      </div>
    </ModuleShell>
  );
}

export function RhEstadisticosPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!empresaId) return;
    royalHolidayApi.resumen(empresaId, { workspaceId }).then(setData).catch((e) => toast.error(e.message));
  }, [empresaId, workspaceId]);
  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  const reps = (data?.by_posicion?.liner || 0) + (data?.by_posicion?.ftb || 0);
  const closers = data?.by_posicion?.closer || 0;
  return (
    <ModuleShell title="Estadísticos sala">
      <div className="g2 survey-result-pair">
        <div className="vbox blue"><div className="vbox-val">{reps}</div><div className="vbox-label">Reps (liner/FTB)</div></div>
        <div className="vbox green"><div className="vbox-val">{closers}</div><div className="vbox-label">Closers</div></div>
        <div className="vbox yellow span2"><div className="vbox-val">{data?.count ?? 0}</div><div className="vbox-label">Total ventas</div></div>
      </div>
    </ModuleShell>
  );
}

export function RhOkrPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [clave, setClave] = useState("ventas");
  const [meta, setMeta] = useState("10");
  const [actual, setActual] = useState("0");

  const reload = () => {
    if (!empresaId) return;
    royalHolidayApi.listOkr(empresaId, { workspaceId, periodo }).then(setRows).catch((e) => toast.error(e.message));
  };
  useEffect(() => { if (ready && empresaId) reload(); }, [empresaId, workspaceId, periodo, ready]);

  const save = async () => {
    try {
      await royalHolidayApi.saveOkr(empresaId, {
        workspace_id: workspaceId,
        periodo,
        clave,
        meta,
        actual,
      });
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  return (
    <ModuleShell title="OKR → Dashboard">
      <div className="card tool-calc-card">
        <div className="frow tool-frow"><div className="flabel">Periodo</div>
          <input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Clave</div>
          <input className="input" value={clave} onChange={(e) => setClave(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Meta</div>
          <input className="input tool-num-input" type="number" value={meta} onChange={(e) => setMeta(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Actual</div>
          <input className="input tool-num-input" type="number" value={actual} onChange={(e) => setActual(e.target.value)} /></div>
        <div className="save-footer"><button type="button" className="btn btn-primary" onClick={save}>Guardar OKR</button></div>
        <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
          {rows.map((r) => (
            <div className="vbox blue" key={r.id}>
              <div className="vbox-val">{r.actual}/{r.meta}</div>
              <div className="vbox-label">{r.clave}</div>
            </div>
          ))}
        </div>
      </div>
    </ModuleShell>
  );
}

export function RhCalendarioDescansosPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!empresaId) return;
    royalHolidayApi.listDiasDescanso(empresaId, { workspaceId }).then(setRows).catch((e) => toast.error(e.message));
  }, [empresaId, workspaceId]);
  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  return (
    <ModuleShell title="Calendario de descansos">
      <div className="card tool-calc-card">
        <table className="client-table">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Notas</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="muted">Sin descansos</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}><td>{r.fecha}</td><td>{r.usuario_id?.slice(0, 8)}…</td><td>{r.tipo}</td><td>{r.notas || "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

export function RhPropinasPage() {
  const { empresaId, workspaceId, ready } = useRhEmpresa();
  const [rows, setRows] = useState([]);
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(today);

  const reload = () => {
    if (!empresaId) return;
    royalHolidayApi.listPropinas(empresaId, { workspaceId }).then(setRows).catch((e) => toast.error(e.message));
  };
  useEffect(() => { if (ready && empresaId) reload(); }, [empresaId, workspaceId, ready]);

  const save = async () => {
    try {
      await royalHolidayApi.savePropina(empresaId, {
        workspace_id: workspaceId,
        beneficiario_nombre: nombre,
        monto,
        fecha,
      });
      setNombre("");
      setMonto("");
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.monto || 0), 0), [rows]);

  if (!ready) return <div className="sales-page" style={{ padding: 24 }}>Cargando…</div>;
  return (
    <ModuleShell title="Pago de propinas">
      <div className="card tool-calc-card">
        <div className="frow tool-frow"><div className="flabel">Beneficiario</div>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Monto</div>
          <input className="input tool-num-input" type="number" value={monto} onChange={(e) => setMonto(e.target.value)} /></div>
        <div className="frow tool-frow"><div className="flabel">Fecha</div>
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="save-footer"><button type="button" className="btn btn-primary" onClick={save}>Registrar</button></div>
        <p className="muted rh-hint">Total: {total.toFixed(2)}</p>
        <table className="client-table">
          <thead><tr><th>Fecha</th><th>Beneficiario</th><th>Monto</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td>{r.fecha}</td><td>{r.beneficiario_nombre}</td><td>{r.monto}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}
