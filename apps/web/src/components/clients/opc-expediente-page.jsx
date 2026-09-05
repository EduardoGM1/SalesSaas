import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { createProspectFromName } from "@/actions/clients.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { useRhEmpresa, readRhEmpresaFromSession } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";
import { defaultOpcForm, firstSingleName, matchOlaByHora, normalizeHora } from "@/lib/opc-expediente.js";

const TABS = [
  { id: "cliente", label: "Información cliente" },
  { id: "estancia", label: "Estancia" },
  { id: "invitacion", label: "Invitación" },
];

function emptyNino() {
  return { nombre: "", edad: "" };
}

function IntegrantesTable({ form, setForm }) {
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setNino = (idx, key, value) => {
    setForm((f) => {
      const ninos = [...(f.ninos || [])];
      ninos[idx] = { ...ninos[idx], [key]: value };
      return { ...f, ninos };
    });
  };
  return (
    <div className="card tool-calc-card">
      <div className="card-heading">Integrantes</div>
      <div className="opc-int-grid">
        <div className="opc-int-row opc-int-head">
          <span />
          <span>Nombre</span>
          <span>Apellido / edad</span>
        </div>
        <div className="opc-int-row">
          <span className="opc-int-role">Hombre</span>
          <input className="input" value={form.hombreNombre} onFocus={selectOnFocus} onChange={(e) => patch("hombreNombre", e.target.value)} />
          <input className="input" value={form.hombreApellido} onFocus={selectOnFocus} onChange={(e) => patch("hombreApellido", e.target.value)} />
        </div>
        <div className="opc-int-row">
          <span className="opc-int-role">Mujer</span>
          <input className="input" value={form.mujerNombre} onFocus={selectOnFocus} onChange={(e) => patch("mujerNombre", e.target.value)} />
          <input className="input" value={form.mujerApellido} onFocus={selectOnFocus} onChange={(e) => patch("mujerApellido", e.target.value)} />
        </div>
        {(form.ninos || []).map((nino, idx) => (
          <div className="opc-int-row" key={`nino-${idx}`}>
            <span className="opc-int-role">Niño {idx + 1}</span>
            <input className="input" value={nino.nombre} onFocus={selectOnFocus} onChange={(e) => setNino(idx, "nombre", e.target.value)} />
            <input className="input" type="number" min="0" value={nino.edad} onFocus={selectOnFocus} onChange={(e) => setNino(idx, "edad", e.target.value)} />
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, ninos: [...(f.ninos || []), emptyNino()] }))}>
          Agregar niño
        </button>
      </div>
    </div>
  );
}

export function OpcExpedientePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { empresaId, workspaceId, ready: empReady } = useRhEmpresa();
  const tourTypes = useDbStore((s) => s.db.settings?.tourTypes ?? DEFAULT_TOUR_TYPES);
  const [tab, setTab] = useState("cliente");
  const [saving, setSaving] = useState(false);
  const [dia, setDia] = useState(null);
  const [form, setForm] = useState(() => defaultOpcForm({
    fecha: params.get("fecha") || "",
    hora: params.get("hora") || "",
    etiqueta: params.get("etiqueta") || "",
    olaConfigId: params.get("ola") || "",
  }));

  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!empresaId || !workspaceId || !form.fecha) {
      setDia(null);
      return undefined;
    }
    let cancelled = false;
    royalHolidayApi.getPremanifiestoDia(empresaId, { workspaceId, fecha: form.fecha })
      .then((data) => { if (!cancelled) setDia(data); })
      .catch((err) => { if (!cancelled) toast.error(err.message); });
    return () => { cancelled = true; };
  }, [empresaId, workspaceId, form.fecha]);

  const matchedOla = useMemo(
    () => matchOlaByHora(dia?.olas || [], form.hora),
    [dia, form.hora],
  );
  const olaLabel = matchedOla
    ? `${matchedOla.etiqueta} · ${normalizeHora(matchedOla.hora)}`
    : (form.etiqueta ? `${form.etiqueta} · ${normalizeHora(form.hora)}` : "—");

  const confirm = async () => {
    const nombre = firstSingleName(form.hombreNombre) !== "Pareja"
      ? firstSingleName(form.hombreNombre)
      : firstSingleName(form.mujerNombre);
    if (!form.fecha || !form.hora) {
      toast.error("Captura fecha y hora de la invitación.");
      setTab("invitacion");
      return;
    }
    let emp = empresaId;
    let ws = workspaceId;
    if (!empReady || !emp || !ws) {
      const fresh = await readRhEmpresaFromSession();
      emp = fresh.empresaId;
      ws = fresh.workspaceId;
    }
    if (!emp || !ws) {
      toast.error("Activa un workspace de sala Royal Holiday.");
      return;
    }
    const ola = matchedOla
      || (dia?.olas || []).find((o) => o.ola_config_id === form.olaConfigId)
      || (form.olaConfigId
        ? { ola_config_id: form.olaConfigId, etiqueta: form.etiqueta, hora: form.hora }
        : null);
    if (!ola?.ola_config_id) {
      toast.error("No hay una ola para esa fecha y hora.");
      setTab("invitacion");
      return;
    }
    if (ola.disponible != null && Number(ola.disponible) <= 0) {
      toast.error("El cupo de esa ola está lleno.");
      return;
    }

    setSaving(true);
    try {
      const tipoTour = (tourTypes && tourTypes[0]) || "Q";
      const created = await createProspectFromName(nombre, tipoTour, true, form.fecha);
      if (!created.ok || !created.client) {
        setSaving(false);
        return;
      }
      const client = created.client;
      useDbStore.getState().saveClient({
        ...client,
        data: {
          ...(client.data || {}),
          opc: {
            integrantes: {
              hombre: { nombre: form.hombreNombre, apellido: form.hombreApellido },
              mujer: { nombre: form.mujerNombre, apellido: form.mujerApellido },
              ninos: form.ninos,
            },
            estancia: {
              agencia: form.agencia,
              estado_procedencia: form.estadoProcedencia,
              nights: form.nights,
              room_type: form.roomType,
              room_number: form.roomNumber,
              notes: form.notes,
            },
            invitacion: {
              fecha: form.fecha,
              hora: normalizeHora(form.hora),
              ola_config_id: ola.ola_config_id,
              etiqueta: ola.etiqueta,
            },
          },
        },
      });

      const displayName = [form.hombreNombre, form.mujerNombre].filter(Boolean).join(" / ") || nombre;
      await royalHolidayApi.registrarPremanifiestoPareja(emp, {
        empresa_id: emp,
        workspace_id: ws,
        fecha: form.fecha,
        ola_config_id: ola.ola_config_id,
        origen: "opc",
        prospect_nombre: displayName,
        notes: form.notes || null,
        estado_procedencia: form.estadoProcedencia || null,
        agencia: form.agencia || null,
        room_type: form.roomType || null,
        room_number: form.roomNumber || null,
        nights: form.nights !== "" ? Number(form.nights) : null,
      });
      toast.success("Invitación confirmada");
      navigate(`/clients/${client.id}`, { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Topbar title="Nueva pareja" subtitle={olaLabel} />
      <div className="sales-page">
        <div className="page-toolbar">
          <PageBack inline href="/ops/rh/premanifiesto" />
        </div>

        <nav className="admin-subnav" aria-label="Expediente OPC" data-testid="opc-expediente-tabs">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`admin-subnav-item${tab === tb.id ? " active" : ""}`}
              onClick={() => setTab(tb.id)}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        {tab === "cliente" && (
          <IntegrantesTable form={form} setForm={setForm} />
        )}

        {tab === "estancia" && (
          <div className="card tool-calc-card">
            <div className="card-heading">Estancia</div>
            <div className="frow tool-frow"><div className="flabel">Agencia</div><input className="input" value={form.agencia} onFocus={selectOnFocus} onChange={(e) => patch("agencia", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Estado procedencia</div><input className="input" value={form.estadoProcedencia} onFocus={selectOnFocus} onChange={(e) => patch("estadoProcedencia", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Nights</div><input className="input" type="number" min="0" value={form.nights} onFocus={selectOnFocus} onChange={(e) => patch("nights", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Room type</div><input className="input" value={form.roomType} onFocus={selectOnFocus} onChange={(e) => patch("roomType", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Room #</div><input className="input" value={form.roomNumber} onFocus={selectOnFocus} onChange={(e) => patch("roomNumber", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Notas operativas</div><input className="input" value={form.notes} onFocus={selectOnFocus} onChange={(e) => patch("notes", e.target.value)} /></div>
          </div>
        )}

        {tab === "invitacion" && (
          <div className="card tool-calc-card">
            <div className="card-heading">Invitación</div>
            <div className="frow tool-frow"><div className="flabel">Fecha</div><input className="input" type="date" value={form.fecha} onChange={(e) => patch("fecha", e.target.value)} /></div>
            <div className="frow tool-frow"><div className="flabel">Hora</div><input className="input" type="time" value={form.hora} onChange={(e) => patch("hora", e.target.value)} /></div>
            <div className="frow tool-frow readonly-soft">
              <div className="flabel">Ola</div>
              <input className="input" readOnly tabIndex={-1} value={matchedOla ? `${matchedOla.etiqueta} (${normalizeHora(matchedOla.hora)})` : "Sin ola para esa hora"} />
            </div>
            <div className="save-footer">
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/ops/rh/premanifiesto")}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={confirm}>
                {saving ? "Confirmando…" : "Confirmar invitación"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
