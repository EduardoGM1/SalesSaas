import { useCallback, useEffect, useMemo, useState } from "react";
import { RhToolLoading, RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { RhCalendarWidget } from "@/components/rh/rh-calendar-widget.jsx";
import { useRhEmpresa } from "@/hooks/use-rh-empresa.js";
import { useRhPremanifiestoAccess } from "@/hooks/use-rh-premanifiesto-access.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatEntryStatus(status) {
  const labels = {
    pendiente: "Pendiente",
    en_sala: "En sala",
    completado: "Completado",
    cancelado: "Cancelado",
  };
  return labels[status] || String(status || "").replace(/_/g, " ");
}

function EntryStatusBadge({ status }) {
  const label = formatEntryStatus(status);
  const tone = status === "en_sala"
    ? "is-en-sala"
    : status === "completado"
      ? "ok"
      : status === "cancelado"
        ? "is-cancelado"
        : "pending";
  return <span className={`network-pill rh-pm-status-pill ${tone}`}>{label}</span>;
}

function OrigencBadge({ origen }) {
  if (origen === "opc") {
    return <span className="network-pill opc-origen" data-testid="rh-pm-badge-opc">OPC</span>;
  }
  if (origen === "marketing") {
    return <span className="network-pill ok">Marketing</span>;
  }
  return null;
}

function LockedField({ label, value, type = "text" }) {
  return (
    <div className="frow tool-frow readonly-soft">
      <div className="flabel">{label}</div>
      <input className="input" type={type} readOnly value={value ?? ""} tabIndex={-1} />
    </div>
  );
}

function EditableField({ label, value, onChange, type = "text", disabled = false }) {
  return (
    <div className="frow tool-frow">
      <div className="flabel">{label}</div>
      <input
        className="input"
        type={type}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function PremanifiestoEntryForm({
  mode,
  entry,
  olaOptions,
  access,
  onCancel,
  onSaved,
  empresaId,
  workspaceId,
  fecha,
}) {
  const isNew = !entry?.id;
  const origen = isNew ? (access.canMarketing ? "marketing" : "opc") : entry?.origen;
  const commercialLocked = isNew ? origen === "opc" : !!entry?.comercial_bloqueado;

  const [olaConfigId, setOlaConfigId] = useState(entry?.ola_config_id || olaOptions[0]?.ola_config_id || "");
  const [form, setForm] = useState(() => ({
    prospect_nombre: entry?.prospect_nombre || "",
    notes: entry?.notes || "",
    notas_csi: entry?.notas_csi || "",
    estado_procedencia: entry?.estado_procedencia || "",
    agencia: entry?.agencia || "",
    contrato: entry?.contrato || "",
    check_in: entry?.check_in || "",
    check_out: entry?.check_out || "",
    room_type: entry?.room_type || "",
    room_number: entry?.room_number || "",
    nights: entry?.nights ?? "",
    rate: entry?.rate ?? "",
    total: entry?.total ?? "",
    regalo_nombre: entry?.regalo_nombre || "",
    calif: entry?.calif || "",
    concierge_nombre: entry?.concierge_nombre || "",
  }));

  const patch = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const canEditCommercial = !commercialLocked || access.canMarketing;
  const showCsi = Object.prototype.hasOwnProperty.call(entry || {}, "notas_csi") || (isNew && (access.canMarketing || access.canOpc));

  const save = async () => {
    try {
      if (isNew) {
        await royalHolidayApi.registrarPremanifiestoPareja(empresaId, {
          empresa_id: empresaId,
          workspace_id: workspaceId,
          fecha,
          ola_config_id: olaConfigId,
          origen,
          prospect_nombre: form.prospect_nombre.trim(),
          notes: form.notes || null,
          notas_csi: showCsi ? form.notas_csi || null : undefined,
          estado_procedencia: form.estado_procedencia || null,
          agencia: form.agencia || null,
          contrato: form.contrato || null,
          check_in: form.check_in || null,
          check_out: form.check_out || null,
          room_type: form.room_type || null,
          room_number: form.room_number || null,
          nights: form.nights !== "" ? Number(form.nights) : null,
        });
        toast.success("Pareja registrada");
      } else {
        const body = {
          workspace_id: workspaceId,
          prospect_nombre: form.prospect_nombre,
          notes: form.notes,
          estado_procedencia: form.estado_procedencia,
          agencia: form.agencia,
          contrato: form.contrato,
          check_in: form.check_in || null,
          check_out: form.check_out || null,
          room_type: form.room_type,
          room_number: form.room_number,
          nights: form.nights !== "" ? Number(form.nights) : null,
        };
        if (showCsi) body.notas_csi = form.notas_csi;
        if (canEditCommercial) {
          body.rate = form.rate !== "" ? Number(form.rate) : null;
          body.total = form.total !== "" ? Number(form.total) : null;
          body.regalo_nombre = form.regalo_nombre;
          body.calif = form.calif;
          body.concierge_nombre = form.concierge_nombre;
        }
        await royalHolidayApi.actualizarPremanifiesto(empresaId, entry.id, body);
        toast.success("Registro actualizado");
      }
      onSaved();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const title = isNew
    ? (access.canOpc && !access.canMarketing ? "Invitar pareja" : "Registrar pareja")
    : "Editar registro";

  return (
    <div className="card tool-calc-card rh-pm-form-card" data-testid="rh-pm-form">
      <div className="card-heading">{title}</div>
      {isNew && olaOptions.length > 0 && (
        <div className="frow tool-frow">
          <div className="flabel">Ola</div>
          <select className="input" value={olaConfigId} onChange={(e) => setOlaConfigId(e.target.value)}>
            {olaOptions.map((o) => (
              <option key={o.ola_config_id} value={o.ola_config_id}>
                {o.etiqueta} ({o.hora}) — {o.disponible}/{o.cupo_max} disponible
              </option>
            ))}
          </select>
        </div>
      )}
      <EditableField label="Nombre pareja / prospecto" value={form.prospect_nombre} onChange={(v) => patch("prospect_nombre", v)} />
      <EditableField label="Estado procedencia" value={form.estado_procedencia} onChange={(v) => patch("estado_procedencia", v)} />
      <EditableField label="Agencia" value={form.agencia} onChange={(v) => patch("agencia", v)} />
      <EditableField label="Contrato" value={form.contrato} onChange={(v) => patch("contrato", v)} />
      <EditableField label="Check-in" value={form.check_in} onChange={(v) => patch("check_in", v)} type="date" />
      <EditableField label="Check-out" value={form.check_out} onChange={(v) => patch("check_out", v)} type="date" />
      <EditableField label="Room type" value={form.room_type} onChange={(v) => patch("room_type", v)} />
      <EditableField label="Room #" value={form.room_number} onChange={(v) => patch("room_number", v)} />
      <EditableField label="Nights" value={form.nights} onChange={(v) => patch("nights", v)} type="number" />
      <EditableField label="Notas operativas" value={form.notes} onChange={(v) => patch("notes", v)} />

      {showCsi && (
        <EditableField label="Notas CSI" value={form.notas_csi} onChange={(v) => patch("notas_csi", v)} />
      )}

      <div className="rh-pm-section-label">Datos comerciales</div>
      {canEditCommercial ? (
        <>
          <EditableField label="Rate" value={form.rate} onChange={(v) => patch("rate", v)} type="number" />
          <EditableField label="Total" value={form.total} onChange={(v) => patch("total", v)} type="number" />
          <EditableField label="Regalo" value={form.regalo_nombre} onChange={(v) => patch("regalo_nombre", v)} />
          <EditableField label="Calif" value={form.calif} onChange={(v) => patch("calif", v)} />
          <EditableField label="Concierge" value={form.concierge_nombre} onChange={(v) => patch("concierge_nombre", v)} />
        </>
      ) : (
        <>
          <LockedField label="Rate" value={form.rate} type="number" />
          <LockedField label="Total" value={form.total} type="number" />
          <LockedField label="Regalo" value={form.regalo_nombre} />
          <LockedField label="Calif" value={form.calif} />
          <LockedField label="Concierge" value={form.concierge_nombre} />
        </>
      )}

      <div className="save-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={save}>
          {isNew ? "Registrar" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function PremanifiestoEntryRow({
  entry,
  access,
  empresaId,
  workspaceId,
  onRefresh,
  onEdit,
}) {
  const canTomar = access.canRep
    && entry.status !== "cancelado"
    && (!entry.rep_id || entry.rep_id === access.userId);

  const tomarCaso = async () => {
    try {
      await royalHolidayApi.tomarCasoPremanifiesto(empresaId, entry.id, { workspace_id: workspaceId });
      toast.success("Caso tomado");
      onRefresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <article className="rh-pm-entry">
      <div className="rh-pm-entry-head">
        <div className="rh-pm-entry-main">
          <strong className="rh-pm-entry-name">{entry.prospect_nombre}</strong>
          <div className="rh-pm-entry-badges">
            <OrigencBadge origen={entry.origen} />
            {entry.comercial_bloqueado && (
              <span className="network-pill pending rh-pm-lock-hint">Comercial bloqueado</span>
            )}
          </div>
        </div>
        <EntryStatusBadge status={entry.status} />
      </div>
      {(entry.show_time || entry.agencia) && (
        <div className="rh-pm-entry-meta muted">
          {entry.show_time && <span>Show {String(entry.show_time).slice(0, 5)}</span>}
          {entry.agencia && <span>{entry.agencia}</span>}
        </div>
      )}
      {entry.notas_csi != null && (
        <p className="rh-pm-csi-note"><span className="rh-pm-csi-label">CSI:</span> {entry.notas_csi}</p>
      )}
      <div className="rh-pm-entry-actions">
        {canTomar && entry.status === "pendiente" && !entry.rep_id && (
          <button type="button" className="btn btn-primary btn-sm" onClick={tomarCaso}>Tomar caso</button>
        )}
        {(access.canMarketing || (access.canOpc && entry.origen === "opc" && entry.created_by === access.userId && entry.status === "pendiente")) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(entry)}>Editar</button>
        )}
      </div>
    </article>
  );
}

function PremanifiestoDayPanel({
  fecha,
  dia,
  loading,
  access,
  empresaId,
  workspaceId,
  onRefresh,
  formState,
  setFormState,
}) {
  const olas = dia?.olas || [];

  if (loading) {
    return <div className="card tool-calc-card"><p className="muted">Cargando olas…</p></div>;
  }

  if (formState) {
    return (
      <PremanifiestoEntryForm
        mode={formState.mode}
        entry={formState.entry}
        olaOptions={olas}
        access={access}
        empresaId={empresaId}
        workspaceId={workspaceId}
        fecha={fecha}
        onCancel={() => setFormState(null)}
        onSaved={() => { setFormState(null); onRefresh(); }}
      />
    );
  }

  return (
    <>
      <div className="day-panel-head">
        <h2 className="day-panel-title">{formatDateLabel(fecha)}</h2>
        {access.canMarketing && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setFormState({ mode: "new", entry: null })}
          >
            Registrar pareja
          </button>
        )}
        {access.canOpc && !access.canMarketing && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setFormState({ mode: "new", entry: null })}
          >
            Invitar pareja
          </button>
        )}
      </div>

      {olas.length === 0 ? (
        <p className="muted rh-pm-empty-day">No hay olas configuradas para este día.</p>
      ) : (
        <div className="rh-pm-olas-stack">
          {olas.map((ola) => (
            <div key={ola.ola_config_id} className="day-group rh-pm-ola-group">
              <div className="dg-head rh-pm-ola-head">
                <div className="dg-left">
                  <span className="dg-dot show" />
                  <span className="dg-name">{ola.etiqueta}</span>
                  <span className="muted rh-pm-ola-time">{ola.hora}</span>
                </div>
                <span className="network-pill ok rh-pm-cupo-pill">
                  {ola.ocupado}/{ola.cupo_max} parejas
                </span>
              </div>
              <div className="rh-pm-ola-body">
                {(ola.entradas || []).length === 0 && (
                  <p className="muted rh-pm-empty-ola">Sin parejas en esta ola</p>
                )}
                {(ola.entradas || []).map((entry) => (
                  <PremanifiestoEntryRow
                    key={entry.id}
                    entry={entry}
                    access={access}
                    empresaId={empresaId}
                    workspaceId={workspaceId}
                    onRefresh={onRefresh}
                    onEdit={(e) => setFormState({ mode: "edit", entry: e })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function RhPremanifiestoPage() {
  const { empresaId, workspaceId, ready: empReady } = useRhEmpresa();
  const access = useRhPremanifiestoAccess();
  const [fecha, setFecha] = useState(todayIso);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [dia, setDia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formState, setFormState] = useState(null);
  const [tab, setTab] = useState("calendario");

  const loadDia = useCallback(async () => {
    if (!empresaId || !workspaceId || !fecha) return;
    setLoading(true);
    try {
      const data = await royalHolidayApi.getPremanifiestoDia(empresaId, { workspaceId, fecha });
      setDia(data);
    } catch (e) {
      toast.error(e.message);
      setDia(null);
    } finally {
      setLoading(false);
    }
  }, [empresaId, workspaceId, fecha]);

  useEffect(() => {
    if (empReady && access.canRead) loadDia();
  }, [empReady, access.canRead, loadDia]);

  const daysWithEntries = useMemo(() => {
    if (!dia?.olas || fecha.slice(0, 7) !== `${calYear}-${String(calMonth + 1).padStart(2, "0")}`) {
      return {};
    }
    const count = (dia.olas || []).reduce((s, o) => s + (o.entradas?.length || 0), 0);
    return count > 0 ? { [fecha]: count } : {};
  }, [dia, fecha, calYear, calMonth]);

  const selectDate = (iso) => {
    setFecha(iso);
    setFormState(null);
    setTab("dia");
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7)) - 1;
    setCalYear(y);
    setCalMonth(m);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  };

  if (!empReady || !access.ready) {
    return <RhToolLoading title="Premanifiesto" backHref="/ops/rh" />;
  }

  if (!access.canRead) {
    return (
      <RhToolShell title="Premanifiesto" backHref="/ops/rh">
        <p className="muted">No tienes acceso a Premanifiesto.</p>
      </RhToolShell>
    );
  }

  return (
    <RhToolShell title="Premanifiesto" subtitle={access.readOnly ? "Solo lectura" : undefined} backHref="/ops/rh">
      <div className="rh-pm-page" data-testid="rh-pm-page">
      <nav className="admin-subnav rh-pm-subnav" aria-label="Premanifiesto">
        <button
          type="button"
          className={`admin-subnav-item${tab === "calendario" ? " active" : ""}`}
          onClick={() => setTab("calendario")}
        >
          Calendario
        </button>
        <button
          type="button"
          className={`admin-subnav-item${tab === "dia" ? " active" : ""}`}
          onClick={() => setTab("dia")}
        >
          Día {fecha ? `(${fecha})` : ""}
        </button>
      </nav>

      {tab === "calendario" ? (
        <div className="cal-layout rh-pm-cal-layout">
          <RhCalendarWidget
            year={calYear}
            month={calMonth}
            selectedDate={fecha}
            onSelectDate={selectDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            daysWithEntries={daysWithEntries}
          />
          <div className="day-panel rh-pm-day-panel" data-testid="rh-pm-day-panel">
            <PremanifiestoDayPanel
              fecha={fecha}
              dia={dia}
              loading={loading}
              access={access}
              empresaId={empresaId}
              workspaceId={workspaceId}
              onRefresh={loadDia}
              formState={formState}
              setFormState={setFormState}
            />
          </div>
        </div>
      ) : (
        <div className="rh-pm-day-only">
          <PremanifiestoDayPanel
            fecha={fecha}
            dia={dia}
            loading={loading}
            access={access}
            empresaId={empresaId}
            workspaceId={workspaceId}
            onRefresh={loadDia}
            formState={formState}
            setFormState={setFormState}
          />
        </div>
      )}
      </div>
    </RhToolShell>
  );
}
