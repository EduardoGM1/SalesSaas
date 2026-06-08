
import { useEffect, useState } from "react";
import {  useNavigate  } from "react-router-dom";
import { SalesModal } from "@/components/ui/sales-modal";
import { toast } from "@/lib/toast";
import { activeClients, clientDisplayName } from "@/lib/clients";
import { ymdToday } from "@/lib/format/dates";
import { parseMoney } from "@/lib/format/money";
import { createEmptyClient, useDbStore } from "@/stores/db-store";

type Tool = "survey" | "vacaciones" | "worksheet";

const TOOL_LABEL: Record<Tool, string> = {
  survey: "Survey", vacaciones: "Proyección de Vacaciones", worksheet: "Worksheet",
};

const emptyFields = () => ({
  name1: "", occ1: "", name2: "", occ2: "", city: "", country: "",
  phone: "", email: "", contract: "", tourDate: "", status: "",
  processDate: "", processAmount: "", note: "",
});

interface SaveToolModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tool: Tool;
}

export function SaveToolModal({ open, onOpenChange, tool }: SaveToolModalProps) {
  const navigate = useNavigate();
  const db = useDbStore((s) => s.db);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveClient = useDbStore((s) => s.saveClient);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);

  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState("");
  const [f, setF] = useState(emptyFields());

  const clients = activeClients(db.clients);

  useEffect(() => {
    if (open) { setTargetMode("new"); setExistingId(""); setF(emptyFields()); }
  }, [open]);

  const handleSave = () => {
    const src = { ...getToolBucket(tool, "libre") };

    if (targetMode === "existing") {
      if (!existingId || !db.clients[existingId]) return toast.error("Selecciona un prospecto existente.");
      saveToolBucket(tool, "client", src, existingId);
      onOpenChange(false);
      navigate(`/clients/${existingId}`);
      return;
    }

    if (!f.name1.trim()) return toast.error("Escribe al menos el nombre del cliente 1.");
    const c = createEmptyClient(f.name1.trim(), f.tourDate || ymdToday());
    c.name = [f.name1, f.name2].filter(Boolean).join(" / ") || f.name1;
    c.name1 = f.name1;
    c.name2 = f.name2;
    c.occupation1 = f.occ1;
    c.occupation2 = f.occ2;
    c.city = f.city;
    c.country = f.country;
    c.phone = f.phone;
    c.email = f.email;
    c.contract = f.contract;
    c.status = f.status;
    c.processDate = f.processDate;
    c.processAmount = parseMoney(f.processAmount);
    c.note = f.note;
    c.data = { survey: {}, vacaciones: {}, worksheet: {}, ...(c.data || {}), [tool]: src };
    saveClient(c);
    onOpenChange(false);
    navigate(`/clients/${c.id}`);
  };

  const set = (k: keyof ReturnType<typeof emptyFields>, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <SalesModal open={open} onOpenChange={onOpenChange} title="Guardar en expediente" sub={`Guardar ${TOOL_LABEL[tool]} en un expediente`}>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" className={`seg-btn${targetMode === "new" ? " on" : ""}`} onClick={() => setTargetMode("new")}>Crear nuevo</button>
        <button type="button" className={`seg-btn${targetMode === "existing" ? " on" : ""}`} onClick={() => setTargetMode("existing")}>Prospecto existente</button>
      </div>

      {targetMode === "existing" && (
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Prospectos activos — máximo 10</label>
          <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            <option value="">{clients.length ? "Selecciona…" : "Sin prospectos activos"}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{clientDisplayName(c)}{c.contract ? ` · ${c.contract}` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {targetMode === "new" && (
        <div className="prospect-grid">
          <div className="prospect-field"><label>Cliente 1</label><input type="text" placeholder="Nombre completo" value={f.name1} onChange={(e) => set("name1", e.target.value)} /></div>
          <div className="prospect-field"><label>Ocupación 1</label><input type="text" placeholder="Ocupación" value={f.occ1} onChange={(e) => set("occ1", e.target.value)} /></div>
          <div className="prospect-field"><label>Cliente 2</label><input type="text" placeholder="Nombre completo" value={f.name2} onChange={(e) => set("name2", e.target.value)} /></div>
          <div className="prospect-field"><label>Ocupación 2</label><input type="text" placeholder="Ocupación" value={f.occ2} onChange={(e) => set("occ2", e.target.value)} /></div>
          <div className="prospect-field"><label>Ciudad</label><input type="text" placeholder="Ciudad" value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="prospect-field"><label>País</label><input type="text" placeholder="País" value={f.country} onChange={(e) => set("country", e.target.value)} /></div>
          <div className="prospect-field"><label>Teléfono</label><input type="text" placeholder="Teléfono" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="prospect-field"><label>Email</label><input type="text" placeholder="Email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="prospect-field"><label>Contrato / Referencia</label><input type="text" placeholder="Contrato" value={f.contract} onChange={(e) => set("contract", e.target.value)} /></div>
          <div className="prospect-field"><label>Fecha de tour</label><input type="date" value={f.tourDate} onChange={(e) => set("tourDate", e.target.value)} /></div>
          <div className="prospect-field"><label>Estado</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">Sin estado</option>
              <option value="venta">Venta</option>
              <option value="bback">B-back</option>
              <option value="procesable">Procesable</option>
              <option value="no-procesable">No procesable</option>
              <option value="perdido">Perdido / cerrado</option>
            </select>
          </div>
          <div className="prospect-field"><label>Fecha de procesamiento</label><input type="date" value={f.processDate} onChange={(e) => set("processDate", e.target.value)} /></div>
          <div className="prospect-field"><label>Monto pendiente</label><div className="mfield"><span className="mpfx">$</span><input type="text" placeholder="0" value={f.processAmount} onChange={(e) => set("processAmount", e.target.value)} /></div></div>
          <div className="prospect-field full"><label>Nota / motivo</label><textarea rows={3} placeholder="Contexto del prospecto, motivo de no procesable o seguimiento..." value={f.note} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
      )}

      <div className="ethic-box" style={{ marginTop: 16 }}>Prospectos activos debe ser un pipeline temporal. La app final debe limpiar o anonimizar datos personales al cerrar/procesar.</div>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>Guardar</button>
      </div>
    </SalesModal>
  );
}
