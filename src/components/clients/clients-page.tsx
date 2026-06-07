"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { Topbar } from "@/components/layout/topbar";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { longDate } from "@/lib/format/dates";
import { statusLabel, statusClass } from "@/lib/format/status";
import { createEmptyClient, useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

export function ClientsPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const db = useDbStore((s) => s.db);
  const saveClient = useDbStore((s) => s.saveClient);
  const deleteClient = useDbStore((s) => s.deleteClient);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const router = useRouter();

  const sorted = Object.values(db.clients).map(ensureProspectIdentity).sort((a, b) => {
    const da = a.tourDate || a.createdYmd || "";
    const db2 = b.tourDate || b.createdYmd || "";
    if (db2 !== da) return db2.localeCompare(da);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const handleCreate = () => {
    if (!name.trim()) return toast.error("Escribe al menos el nombre.");
    const c = createEmptyClient(name.trim());
    saveClient(c);
    setOpen(false);
    setName("");
    router.push(`/clients/${c.id}`);
  };

  if (!hydrated) return <Topbar title="Clientes" subtitle="Cargando..." />;

  return (
    <>
      <Topbar title="Clientes" subtitle="Gestión de expedientes" />
      <div className="sales-page">
        <div className="page-head">
          <div>
            <div className="page-title">Clientes</div>
            <div className="page-sub">Gestión de expedientes</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>+ Nuevo cliente</button>
        </div>

        {!sorted.length ? (
          <div className="client-empty">Sin clientes aún. Haz clic en <strong>Nuevo cliente</strong> para comenzar.</div>
        ) : (
          <div className="client-table-card">
            <table className="client-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Fecha de tour</th>
                  <th>Ciudad / País</th>
                  <th>Estado</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="client-name-link">
                        <span>{clientDisplayName(c)}</span>
                        <span className="client-code">{c.prospectCode}</span>
                      </Link>
                    </td>
                    <td>{c.tourDate ? longDate(c.tourDate) : c.createdYmd ? longDate(c.createdYmd) : "—"}</td>
                    <td>{[c.city, c.country].filter(Boolean).join(" / ") || "—"}</td>
                    <td>
                      <span className={`client-status-badge ${statusClass(c.status)}`}>{statusLabel(c.status)}</span>
                    </td>
                    <td>
                      <div className="client-actions">
                        <Link href={`/clients/${c.id}`} className="icon-btn" title="Ver expediente"><Eye size={14} /></Link>
                        <button type="button" className="icon-btn" title="Eliminar" onClick={async () => {
                          if (await confirmDialog(`¿Eliminar a ${clientDisplayName(c)}?`)) deleteClient(c.id);
                        }}><Trash2 size={14} color="#dc2626" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SalesModal open={open} onOpenChange={setOpen} title="Nuevo cliente" sub="Crea el expediente con el nombre inicial. Los demás datos se completan dentro del expediente.">
        <label className="field-label">Nombre completo cliente 1</label>
        <input type="text" value={name} placeholder="Nombre completo" style={{ marginBottom: 18 }}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
        <div className="ethic-box">La información personal se considera temporal. Al cerrar o procesar la operación, debe conservarse solo lo comercial/estadístico.</div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>Crear expediente</button>
        </div>
      </SalesModal>
    </>
  );
}
