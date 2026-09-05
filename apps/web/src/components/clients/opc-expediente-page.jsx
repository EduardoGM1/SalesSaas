import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { createProspectFromName } from "@/actions/clients.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { useRhEmpresa, readRhEmpresaFromSession } from "@/hooks/use-rh-empresa.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { persistProspectOnlineFirst } from "@/lib/prospects-persist.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";
import {
  buildOpcSnapshot,
  computeStayTotal,
  defaultOpcForm,
  firstSingleName,
  formatOpcFechaMeta,
  formatOpcNotes,
  matchOlaByHora,
  normalizeHora,
  opcDisplayName,
} from "@/lib/opc-expediente.js";

const TABS = [
  { id: "cliente", label: "Información cliente" },
  { id: "estancia", label: "Estancia" },
  { id: "invitacion", label: "Invitación" },
];

const PERSON_ROWS = [
  ["nombre", "Nombre"],
  ["apellido", "Apellido"],
  ["nacionalidad", "Nacionalidad"],
  ["edad", "Edad"],
  ["ocupacion", "Ocupación"],
];

function FieldRow({ label, testId, children }) {
  return (
    <div className="frow tool-frow">
      <div className="flabel">{label}</div>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, testId, type = "text" }) {
  return (
    <FieldRow label={label}>
      <input
        className="input"
        type={type}
        data-testid={testId}
        value={value}
        onFocus={selectOnFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldRow>
  );
}

function NotesField({ label, value, onChange, testId, placeholder }) {
  return (
    <div className="frow tool-frow tool-frow--notes">
      <div className="flabel">{label}</div>
      <textarea
        className="input"
        rows={3}
        data-testid={testId}
        placeholder={placeholder}
        value={value}
        onFocus={selectOnFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function IntegrantesTable({ form, setForm }) {
  const setPerson = (who, key, value) => {
    setForm((f) => ({ ...f, [who]: { ...f[who], [key]: value } }));
  };
  return (
    <div className="card tool-calc-card">
      <div className="card-heading">Integrantes</div>
      <div className="table-scroll">
        <table className="mtbl opc-int-table">
          <thead>
            <tr>
              <th />
              <th>Hombre</th>
              <th>Mujer</th>
              <th>Niños</th>
            </tr>
          </thead>
          <tbody>
            {PERSON_ROWS.map(([key, label]) => (
              <tr key={key}>
                <td className="opc-int-rowlabel">{label}</td>
                {["hombre", "mujer", "ninos"].map((who) => (
                  <td key={who}>
                    <input
                      className="input"
                      data-testid={`opc-int-${who}-${key}`}
                      value={form[who]?.[key] || ""}
                      onFocus={selectOnFocus}
                      onChange={(e) => setPerson(who, key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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

  const patch = (key, value) => setForm((f) => {
    const next = { ...f, [key]: value };
    if (key === "nights" || key === "rate") {
      next.total = computeStayTotal(next.nights, next.rate);
    }
    return next;
  });

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
  const cupoLabel = matchedOla
    ? `Cupo ${matchedOla.ocupado ?? 0}/${matchedOla.cupo_max ?? "—"}`
    : "Cupo —";

  const confirm = async () => {
    const nombre = firstSingleName(form.hombre?.nombre) !== "Pareja"
      ? firstSingleName(form.hombre?.nombre)
      : firstSingleName(form.mujer?.nombre);
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
      const snapshot = buildOpcSnapshot(form);
      const notes = formatOpcNotes(form);
      const merged = {
        ...client,
        country: form.pais,
        city: form.estado,
        name1: form.hombre?.nombre || client.name1,
        name2: form.mujer?.nombre || client.name2,
        occupation1: form.hombre?.ocupacion || "",
        occupation2: form.mujer?.ocupacion || "",
        note: notes,
        data: {
          ...(client.data || {}),
          opc: snapshot,
        },
      };
      useDbStore.getState().saveClient(merged, { skipCloud: true });
      await persistProspectOnlineFirst(merged);

      await royalHolidayApi.registrarPremanifiestoPareja(emp, {
        empresa_id: emp,
        workspace_id: ws,
        fecha: form.fecha,
        ola_config_id: ola.ola_config_id,
        origen: "opc",
        prospect_nombre: opcDisplayName(form) || nombre,
        prospect_id: client.id,
        notes,
        estado_procedencia: form.estado || null,
        agencia: form.agencia || null,
        room_type: form.roomType || null,
        room_number: form.roomNumber || null,
        nights: form.nights !== "" ? Number(form.nights) : null,
        rate: form.rate !== "" ? Number(form.rate) : null,
        total: form.total !== "" ? Number(form.total) : null,
        calif: form.calificacion || null,
        regalo_nombre: form.regalo || null,
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
      <div className="sales-page tool-calc-page">
        <header className="exp-page-head">
          <PageBack inline href="/ops/rh/premanifiesto" label="Back a Premanifiesto" className="exp-page-back" />
          <div className="exp-page-meta">
            <h1 className="exp-page-title">Nueva pareja — {olaLabel}</h1>
            <p className="exp-page-sub">
              Premanifiesto · {formatOpcFechaMeta(form.fecha)} · {cupoLabel}
            </p>
          </div>
          <div className="exp-page-actions">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="opc-confirm"
              disabled={saving}
              onClick={confirm}
            >
              {saving ? "Confirmando…" : "Confirmar invitación"}
            </button>
          </div>
        </header>

        <nav className="admin-subnav worksheet-rh-tabs" aria-label="Expediente OPC" data-testid="opc-expediente-tabs">
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
          <>
            <div className="card tool-calc-card">
              <div className="card-heading">Datos generales</div>
              <TextField label="País" testId="opc-pais" value={form.pais} onChange={(v) => patch("pais", v)} />
              <TextField label="Pax" testId="opc-pax" value={form.pax} onChange={(v) => patch("pax", v)} />
              <TextField label="Estado" testId="opc-estado" value={form.estado} onChange={(v) => patch("estado", v)} />
              <TextField label="Módulo" testId="opc-modulo" value={form.modulo} onChange={(v) => patch("modulo", v)} />
              <TextField label="Idioma" testId="opc-idioma" value={form.idioma} onChange={(v) => patch("idioma", v)} />
              <TextField label="Estado civil" testId="opc-estado-civil" value={form.estadoCivil} onChange={(v) => patch("estadoCivil", v)} />
            </div>
            <IntegrantesTable form={form} setForm={setForm} />
            <div className="card tool-calc-card">
              <NotesField
                label="Notas"
                testId="opc-notas-cliente"
                placeholder="Notas generales del cliente..."
                value={form.notasCliente}
                onChange={(v) => patch("notasCliente", v)}
              />
            </div>
          </>
        )}

        {tab === "estancia" && (
          <div className="card tool-calc-card">
            <div className="card-heading">Datos de estancia</div>
            <TextField label="Agencia" testId="opc-agencia" value={form.agencia} onChange={(v) => patch("agencia", v)} />
            <TextField label="# Noches" testId="opc-nights" type="number" value={form.nights} onChange={(v) => patch("nights", v)} />
            <TextField label="Categoría de habitación" testId="opc-room-type" value={form.roomType} onChange={(v) => patch("roomType", v)} />
            <TextField label="Costo por noche" testId="opc-rate" type="number" value={form.rate} onChange={(v) => patch("rate", v)} />
            <TextField label="# de habitación" testId="opc-room-number" value={form.roomNumber} onChange={(v) => patch("roomNumber", v)} />
            <TextField label="Total" testId="opc-total" type="number" value={form.total} onChange={(v) => patch("total", v)} />
            <NotesField
              label="Notas"
              testId="opc-notas-estancia"
              placeholder="Notas de la estancia..."
              value={form.notasEstancia}
              onChange={(v) => patch("notasEstancia", v)}
            />
          </div>
        )}

        {tab === "invitacion" && (
          <div className="card tool-calc-card">
            <div className="card-heading">Datos de la invitación</div>
            <FieldRow label="Fecha de la cita">
              <input className="input" type="date" data-testid="opc-fecha" value={form.fecha} onChange={(e) => patch("fecha", e.target.value)} />
            </FieldRow>
            <FieldRow label="Hora">
              <input className="input" type="time" data-testid="opc-hora" value={form.hora} onChange={(e) => patch("hora", e.target.value)} />
            </FieldRow>
            <div className="frow tool-frow readonly-soft">
              <div className="flabel">Ola</div>
              <input className="input" readOnly tabIndex={-1} value={matchedOla ? `${matchedOla.etiqueta} (${normalizeHora(matchedOla.hora)})` : "Sin ola para esa hora"} />
            </div>
            <TextField label="Calificación" testId="opc-calif" value={form.calificacion} onChange={(v) => patch("calificacion", v)} />
            <TextField label="Regalo" testId="opc-regalo" value={form.regalo} onChange={(v) => patch("regalo", v)} />
            <NotesField
              label="Notas"
              testId="opc-notas-invitacion"
              placeholder="Notas de la invitación..."
              value={form.notasInvitacion}
              onChange={(v) => patch("notasInvitacion", v)}
            />
          </div>
        )}
      </div>
    </>
  );
}
