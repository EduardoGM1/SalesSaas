
import { useEffect, useMemo, useState } from "react";
import {  useNavigate  } from "react-router-dom";
import { SalesModal } from "@/components/ui/sales-modal";
import { MONTHS, DAYS } from "@/lib/constants";
import { useCalendarActions } from "@/hooks/use-calendar-actions.js";

type EType = "venta" | "follow" | "notaCliente" | "notaUsuario" | "descanso";

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  day: number;
}

const TYPE_TABS: [EType, string][] = [
  ["venta", "Venta"],
  ["follow", "Follow-up"],
  ["notaCliente", "Notas para el cliente"],
  ["notaUsuario", "Notas del usuario"],
  ["descanso", "Descanso"],
];

export function EntryDialog({ open, onOpenChange, year, month, day }: EntryDialogProps) {
  const navigate = useNavigate();
  const { saveUserNote, saveDayOff } = useCalendarActions();

  const [eType, setEType] = useState<EType>("venta");
  const [nota, setNota] = useState("");
  const [remDate, setRemDate] = useState("");
  const [remTime, setRemTime] = useState("");

  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dow = new Date(year, month, day).getDay();
  const title = `${DAYS[dow]} ${day} de ${MONTHS[month]}`;
  const subtitle = `${MONTHS[month]} ${year}`;

  const clientAction = eType === "venta" || eType === "follow" || eType === "notaCliente";

  const routeCopy = useMemo(() => {
    if (eType === "venta") {
      return <>Para evitar duplicados, las ventas se registran desde <strong>Clientes</strong>. Agenda solo funciona como punto de entrada.</>;
    }
    if (eType === "follow") {
      return <>Los follow-ups relacionados con clientes deben vivir dentro del <strong>expediente del cliente</strong>.</>;
    }
    if (eType === "notaCliente") {
      return <>Las notas para cliente deben guardarse dentro del <strong>expediente</strong>, no como nota suelta de Agenda.</>;
    }
    return <>Todo lo relacionado con un cliente se trabaja desde <strong>Clientes</strong>. Agenda solo funciona como punto de entrada y calendario operativo.</>;
  }, [eType]);

  const routeNote = useMemo(() => {
    if (eType === "venta") {
      return <><strong>Ruta:</strong> Agenda → Clientes → Expediente → Registro de venta.</>;
    }
    if (eType === "follow") {
      return <><strong>Ruta:</strong> Agenda → Clientes → Expediente → Notas / Follow-up.</>;
    }
    if (eType === "notaCliente") {
      return <><strong>Ruta:</strong> Agenda → Clientes → Expediente → Notas para el cliente.</>;
    }
    return <><strong>Regla operativa:</strong> si la acción pertenece a un cliente, primero abre o crea su expediente en <strong>Clientes</strong>.</>;
  }, [eType]);

  const reset = () => {
    setEType("venta");
    setNota("");
    setRemDate("");
    setRemTime("");
  };

  useEffect(() => {
    if (open) reset();
  }, [open, day, month, year]);

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const goClientsFromAgenda = () => {
    close(false);
    navigate(`/clients?tourDate=${dateStr}&from=agenda`);
  };

  const handleSave = () => {
    if (clientAction) {
      goClientsFromAgenda();
      return;
    }

    if (eType === "notaUsuario") {
      const result = saveUserNote({ dateStr, year, month, day, nota, remDate, remTime });
      if (!result.ok) return;
      close(false);
      return;
    }

    if (eType === "descanso") {
      saveDayOff({ year, month, day });
      close(false);
    }
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={close}
      popupId="m-entry"
      title={title}
      sub={subtitle}
    >
      <div style={{ marginBottom: 16 }}>
        <div className="entry-type-label">¿Qué te gustaría agregar?</div>
        <div className="seg entry-type-seg">
          {TYPE_TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              className={`seg-btn${eType === t ? " on" : ""}`}
              onClick={() => setEType(t)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {eType === "descanso" && (
        <div id="ef-descanso">
          <div className="hint">
            Este día se marcará como <strong>día de descanso</strong>. Se descontará automáticamente de tus días trabajados del mes.
          </div>
        </div>
      )}

      {clientAction && (
        <div id="ef-venta">
          <div className="calendar-sale-route lean-sale-route">
            <div className="route-hero">
              <div className="route-copy" id="agenda-client-route-copy">{routeCopy}</div>
            </div>
            <div className="route-options">
              <button type="button" className="route-card primary-route" onClick={goClientsFromAgenda}>
                <div className="route-card-icon">＋</div>
                <div>
                  <div className="route-card-title">Crear nuevo cliente</div>
                  <div className="route-card-sub">
                    Te manda a Clientes para crear primero el expediente. Después podrás registrar la acción correspondiente.
                  </div>
                </div>
              </button>
              <button type="button" className="route-card green" onClick={goClientsFromAgenda}>
                <div className="route-card-icon">↗</div>
                <div>
                  <div className="route-card-title">Cliente que ya existe</div>
                  <div className="route-card-sub">
                    Busca su expediente en Clientes y registra o revisa la acción desde ahí.
                  </div>
                </div>
              </button>
            </div>
            <div className="route-note" id="agenda-client-route-note">{routeNote}</div>
          </div>
        </div>
      )}

      {eType === "notaUsuario" && (
        <div id="entry-reminder-wrap" className="link-box" style={{ margin: "12px 0" }}>
          <div className="link-title">Recordatorio</div>
          <div className="prospect-grid">
            <div className="prospect-field">
              <label>Fecha</label>
              <input type="date" id="e-rem-date" value={remDate} onChange={(e) => setRemDate(e.target.value)} />
            </div>
            <div className="prospect-field">
              <label>Hora opcional</label>
              <input type="time" id="e-rem-time" value={remTime} onChange={(e) => setRemTime(e.target.value)} />
            </div>
          </div>
          <div className="route-note" style={{ marginTop: 10 }}>
            Si eliges fecha, esta nota del usuario aparecerá en Agenda en esa fecha. La hora es opcional.
          </div>
        </div>
      )}

      {eType === "notaUsuario" && (
        <div id="ef-nota">
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Notas del usuario
          </label>
          <textarea
            id="e-nota-t"
            rows={4}
            style={{ width: "100%" }}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Escribe una nota personal u operativa..."
          />
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-ghost" onClick={() => close(false)}>Cancelar</button>
        {!clientAction && (
          <button type="button" className="btn btn-primary" id="entry-save-btn" onClick={handleSave}>
            Guardar
          </button>
        )}
      </div>
    </SalesModal>
  );
}
