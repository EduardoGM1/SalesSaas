"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SalesModal } from "@/components/ui/sales-modal";
import { toast } from "@/lib/toast";
import { MONTHS, DAYS } from "@/lib/constants";
import { activeClients, clientDisplayName } from "@/lib/clients";
import { createEmptyClient, useDbStore } from "@/stores/db-store";
import { EntryType } from "@/lib/storage/types";

type EType = "venta" | "nota" | "follow" | "descanso";
type LinkMode = "personal" | "existing" | "new";

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  day: number;
}

const TYPE_TABS: [EType, string][] = [
  ["venta", "Venta"], ["nota", "Nota"], ["follow", "Follow-up"], ["descanso", "Descanso"],
];

export function EntryDialog({ open, onOpenChange, year, month, day }: EntryDialogProps) {
  const router = useRouter();
  const db = useDbStore((s) => s.db);
  const addCalEntry = useDbStore((s) => s.addCalEntry);
  const addCalEntryByDate = useDbStore((s) => s.addCalEntryByDate);
  const saveClient = useDbStore((s) => s.saveClient);
  const addClientActivity = useDbStore((s) => s.addClientActivity);
  const addUserActivity = useDbStore((s) => s.addUserActivity);

  const [eType, setEType] = useState<EType>("venta");
  const [nota, setNota] = useState("");
  const [follow, setFollow] = useState("");
  const [linkMode, setLinkMode] = useState<LinkMode>("personal");
  const [existingId, setExistingId] = useState("");
  const [newName, setNewName] = useState("");
  const [remDate, setRemDate] = useState("");
  const [remTime, setRemTime] = useState("");

  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dow = new Date(year, month, day).getDay();
  const clients = activeClients(db.clients);

  const reset = () => {
    setEType("venta"); setNota(""); setFollow(""); setLinkMode("personal");
    setExistingId(""); setNewName(""); setRemDate(""); setRemTime("");
  };

  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleSave = () => {
    const baseNote = eType === "nota" ? nota.trim() : eType === "follow" ? follow.trim() : "Día de descanso";
    if (!baseNote && eType !== "descanso") return toast.error("Escribe algo.");
    const note = remTime ? `${remTime} · ${baseNote}` : baseNote;

    const entry: { t: EntryType; ts: number; note: string; clientId?: string; prospectId?: string; clientName?: string } = {
      t: eType, ts: Date.now(), note,
    };

    if (eType === "nota" || eType === "follow") {
      if (linkMode === "existing" && existingId) {
        const c = db.clients[existingId];
        if (!c) return toast.error("Selecciona un cliente.");
        entry.clientId = existingId;
        entry.prospectId = c.prospectId || existingId;
        entry.clientName = clientDisplayName(c);
        addClientActivity(existingId, { type: eType, date: dateStr, title: eType === "nota" ? "Nota" : "Follow-up", note, source: "Agenda" });
      } else if (linkMode === "new" && newName.trim()) {
        const c = createEmptyClient(newName.trim(), dateStr);
        saveClient(c);
        entry.clientId = c.id;
        entry.prospectId = c.id;
        entry.clientName = c.name;
        addClientActivity(c.id, { type: eType, date: dateStr, title: eType === "nota" ? "Nota" : "Follow-up", note, source: "Agenda" });
      } else {
        addUserActivity({ type: eType, date: dateStr, title: eType === "nota" ? "Nota personal / operativa" : "Follow-up personal / operativo", note, source: "Agenda" });
      }
    }

    if (remDate) addCalEntryByDate(remDate, entry);
    else addCalEntry(year, month, day, entry);

    reset();
    onOpenChange(false);
  };

  const goCreateClient = () => { onOpenChange(false); router.push(`/clients/new?tourDate=${dateStr}&sale=1`); };
  const goClients = () => { onOpenChange(false); router.push("/clients"); };

  const isNote = eType === "nota" || eType === "follow";

  return (
    <SalesModal open={open} onOpenChange={close} title={`${DAYS[dow]} ${day} de ${MONTHS[month]}`} sub={`${MONTHS[month]} ${year}`}>
      <div style={{ marginBottom: 16 }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Tipo</div>
        <div className="seg">
          {TYPE_TABS.map(([t, label]) => (
            <button key={t} type="button" className={`seg-btn${eType === t ? " on" : ""}`} onClick={() => setEType(t)}>{label}</button>
          ))}
        </div>
      </div>

      {isNote && (
        <div className="link-box">
          <div className="link-title">Vincular registro</div>
          <div className="link-options">
            <button type="button" className={`link-chip${linkMode === "personal" ? " on" : ""}`} onClick={() => setLinkMode("personal")}>Personal / operativo</button>
            <button type="button" className={`link-chip${linkMode === "existing" ? " on" : ""}`} onClick={() => setLinkMode("existing")}>Cliente existente</button>
            <button type="button" className={`link-chip${linkMode === "new" ? " on" : ""}`} onClick={() => setLinkMode("new")}>Nuevo cliente</button>
          </div>
          {linkMode === "existing" && (
            <div>
              <label className="field-label">Seleccionar cliente</label>
              <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                <option value="">{clients.length ? "Selecciona…" : "Sin clientes activos"}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{clientDisplayName(c)} · {c.prospectCode}</option>
                ))}
              </select>
            </div>
          )}
          {linkMode === "new" && (
            <div>
              <label className="field-label">Nombre del nuevo cliente</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre completo" />
            </div>
          )}
          <div className="route-note" style={{ marginTop: 10 }}>Si el registro pertenece a un cliente, se guardará también dentro de su expediente. Si es personal/operativo, quedará solo en tu Agenda.</div>
        </div>
      )}

      {eType === "descanso" && (
        <div className="hint">Este día se marcará como <strong>día de descanso</strong>. Se descontará automáticamente de tus días trabajados del mes.</div>
      )}

      {eType === "venta" && (
        <div className="calendar-sale-route">
          <div className="route-hero">
            <div className="route-icon">▣</div>
            <div className="route-title">Registrar venta desde expediente</div>
            <div className="route-copy">Para mantener la información ordenada, las ventas no se capturan directo en Agenda. Primero crea o abre un expediente y registra la venta desde ahí.</div>
          </div>
          <div className="route-options">
            <button type="button" className="route-card" onClick={goCreateClient}>
              <div className="route-card-icon">＋</div>
              <div>
                <div className="route-card-title">Crear nuevo cliente</div>
                <div className="route-card-sub">Crea un expediente con la fecha de tour seleccionada y registra la venta.</div>
              </div>
            </button>
            <button type="button" className="route-card green" onClick={goClients}>
              <div className="route-card-icon">↗</div>
              <div>
                <div className="route-card-title">Abrir clientes</div>
                <div className="route-card-sub">Busca un expediente existente y usa el botón Registrar venta.</div>
              </div>
            </button>
          </div>
          <div className="route-note"><strong>Regla operativa:</strong> Agenda solo refleja ventas creadas desde expedientes. Así evitamos duplicar datos entre clientes, calendario y dashboard.</div>
        </div>
      )}

      {isNote && (
        <div className="link-box" style={{ margin: "12px 0" }}>
          <div className="link-title">Recordatorio</div>
          <div className="prospect-grid">
            <div className="prospect-field"><label>Fecha</label><input type="date" value={remDate} onChange={(e) => setRemDate(e.target.value)} /></div>
            <div className="prospect-field"><label>Hora opcional</label><input type="time" value={remTime} onChange={(e) => setRemTime(e.target.value)} /></div>
          </div>
          <div className="route-note" style={{ marginTop: 10 }}>Si eliges fecha, este registro aparecerá en Agenda en esa fecha. La hora es opcional.</div>
        </div>
      )}

      {eType === "nota" && (
        <div>
          <label className="field-label">Nota</label>
          <textarea rows={4} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe tu nota..." />
        </div>
      )}
      {eType === "follow" && (
        <div>
          <label className="field-label">Follow-up</label>
          <textarea rows={4} value={follow} onChange={(e) => setFollow(e.target.value)} placeholder="Describe el seguimiento..." />
        </div>
      )}

      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => close(false)}>Cancelar</button>
        {eType !== "venta" && <button type="button" className="btn btn-primary" onClick={handleSave}>Guardar</button>}
      </div>
    </SalesModal>
  );
}
