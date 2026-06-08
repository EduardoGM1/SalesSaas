"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Palmtree, DollarSign, MessageSquare } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { Topbar } from "@/components/layout/topbar";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { longDate, ymdToday } from "@/lib/format/dates";
import { fmt, parseMoney } from "@/lib/format/money";
import { statusLabel } from "@/lib/format/status";
import { useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import { ClientRecord } from "@/lib/storage/types";
import { SaleRecord } from "@/lib/storage/types";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

const TOOLS = [
  { key: "survey", label: "Survey", desc: "Viaje actual, últimas vacaciones y viajes futuros", icon: FileText, href: "survey", tone: "blue" as const },
  { key: "vacaciones", label: "Proyección de Vacaciones", desc: "Costo futuro con inflación", icon: Palmtree, href: "vacaciones", tone: "green" as const },
  { key: "worksheet", label: "Worksheet", desc: "Enganche y financiamiento", icon: DollarSign, href: "worksheet", tone: "purple" as const },
];

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useAppStore((s) => s.hydrated);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const getClient = useDbStore((s) => s.getClient);
  const saveClient = useDbStore((s) => s.saveClient);
  const deleteClient = useDbStore((s) => s.deleteClient);
  const registerClientSale = useDbStore((s) => s.registerClientSale);
  const updateClientSale = useDbStore((s) => s.updateClientSale);
  const completeClientExpedient = useDbStore((s) => s.completeClientExpedient);
  const addCalEntryByDate = useDbStore((s) => s.addCalEntryByDate);
  const addClientActivity = useDbStore((s) => s.addClientActivity);

  const [editOpen, setEditOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [form, setForm] = useState<Partial<ClientRecord>>({});
  const [saleForm, setSaleForm] = useState({ date: ymdToday(), vol: "", tours: "1", contract: "", status: "procesable", processDate: "", note: "", addProcessingFollowup: true });
  const [noteForm, setNoteForm] = useState({ type: "nota", note: "", date: "", time: "" });

  const c = getClient(id);

  const openSaleModal = (sale?: SaleRecord, prefillFromWorksheet = false) => {
    const ws = c?.data?.worksheet || {};
    const worksheetVol = prefillFromWorksheet ? parseMoney(String(ws.wv ?? "")) : 0;
    const existingSales = [...(c?.sales || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const resolvedSale = sale ?? (prefillFromWorksheet ? undefined : existingSales[0]);
    setEditingSaleId(resolvedSale?.saleId || null);
    setSaleForm({
      date: resolvedSale?.date || ymdToday(),
      vol: resolvedSale ? String(resolvedSale.vol || "") : worksheetVol ? String(worksheetVol) : "",
      tours: String(resolvedSale?.tours || 1),
      contract: resolvedSale?.contract || c?.contract || "",
      status: resolvedSale?.status === "no-procesable" ? "no-procesable" : "procesable",
      processDate: resolvedSale?.processDate || c?.processDate || "",
      note: resolvedSale?.note || "",
      addProcessingFollowup: resolvedSale?.addProcessingFollowup ?? true,
    });
    setSaleOpen(true);
  };

  useEffect(() => {
    if (!hydrated || !c || searchParams.get("openSale") !== "1") return;
    openSaleModal(undefined, searchParams.get("from") === "worksheet");
    router.replace(`/clients/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, c?.id, id, searchParams, router]);

  if (!hydrated) return <Topbar title="Expediente" subtitle="Cargando..." />;
  if (!c) return (
    <>
      <Topbar title="Expediente" subtitle="No encontrado" />
      <div className="sales-page"><Link href="/clients" className="btn btn-ghost btn-sm">← Volver</Link></div>
    </>
  );

  const openEdit = () => { setForm({ ...c }); setEditOpen(true); };
  const saveEdit = () => {
    const updated = ensureProspectIdentity({ ...c, ...form, name: [form.name1, form.name2].filter(Boolean).join(" / ") || form.name1 || c.name });
    saveClient(updated);
    setEditOpen(false);
  };

  const saveSale = () => {
    const vol = parseMoney(saleForm.vol);
    if (vol <= 0 || !saleForm.contract) return toast.error("Completa volumen y contrato.");
    if (saleForm.status === "no-procesable" && !saleForm.processDate) return toast.error("La venta no procesable requiere fecha de procesamiento.");
    const payload = {
      date: saleForm.date, vol, tours: parseMoney(saleForm.tours) || 1,
      contract: saleForm.contract, status: saleForm.status, processDate: saleForm.processDate, note: saleForm.note,
      addProcessingFollowup: saleForm.addProcessingFollowup,
    };
    if (editingSaleId) updateClientSale(id, editingSaleId, payload);
    else registerClientSale(id, payload);
    setSaleOpen(false);
    setEditingSaleId(null);
    toast.success(saleForm.status === "no-procesable" ? "Venta pendiente guardada. No suma volumen hasta ser procesable." : "Venta registrada en expediente y Agenda.");
  };

  const saveNote = () => {
    if (!noteForm.note.trim()) return toast.error("Escribe la nota.");
    const date = noteForm.date || ymdToday();
    const fullNote = noteForm.time ? `${noteForm.time} · ${noteForm.note}` : noteForm.note;
    const title = noteForm.type === "follow" ? "Follow-up" : noteForm.type === "pendiente" ? "Pendiente" : "Nota";
    addClientActivity(id, { type: noteForm.type, date, title, note: fullNote, source: "Clientes" });
    if (noteForm.date) {
      addCalEntryByDate(date, {
        t: noteForm.type === "follow" ? "follow" : "nota", note: fullNote,
        clientId: id, prospectId: c.prospectId, clientName: clientDisplayName(c), ts: Date.now(), source: "client-note",
      });
    }
    setNoteOpen(false);
  };

  const handleSaleOpenChange = (open: boolean) => {
    setSaleOpen(open);
    if (!open) setEditingSaleId(null);
  };

  const activityItems = (() => {
    const acts: typeof c.activities = [];
    const seen = new Set<string>();
    for (const a of c.activities || []) {
      const sig = a.saleId ? `sale:${a.saleId}` : `${a.type}|${a.date}|${a.title}|${a.note}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      acts.push(a);
    }
    for (const s of c.sales || []) {
      const sig = s.saleId ? `sale:${s.saleId}` : `venta:${s.date}|${s.contract}|${s.vol}|${s.tours}`;
      if (seen.has(sig)) continue;
      const dup = (c.activities || []).some(
        (a) => a.type === "venta" && a.date === s.date && String(a.contract || "") === String(s.contract || "") && Number(a.vol || 0) === Number(s.vol || 0),
      );
      if (dup) continue;
      seen.add(sig);
      acts.push({
        id: sig,
        type: "venta",
        date: s.date,
        title: `Venta ${fmt(s.vol || 0)}`,
        note: [s.tours ? `${s.tours} tour(s)` : null, s.contract ? `Contrato ${s.contract}` : null, s.note].filter(Boolean).join(" · "),
        ts: s.ts || 0,
        saleId: s.saleId,
      });
    }
    return acts.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  })();
  const cityCountry = [c.city, c.country].filter(Boolean).join(" / ");
  const loc = [c.city, c.country].filter(Boolean).join(", ");
  const fecha = c.tourDate ? `Fecha de tour: ${longDate(c.tourDate)}` : `Fecha de registro: ${c.createdYmd ? longDate(c.createdYmd) : "—"}`;
  const since = fecha + (c.status ? ` · ${statusLabel(c.status)}` : "") + (loc ? ` · ${loc}` : "");

  const psValue = (v: string | undefined, pill = false) => {
    const val = String(v || "").trim();
    if (!val) return <span className="ps-empty" />;
    return pill ? <span className="ps-pill">{val}</span> : val;
  };

  const rows: [string, string, React.ReactNode][] = [
    ["#", "ID expediente", psValue(c.prospectCode, true)],
    ["👤", "Nombre", psValue(c.name1 || c.name, true)],
    ["👥", "Acompañante", psValue(c.name2)],
    ["📍", "Ciudad / País", psValue(cityCountry)],
    ["☎", "Teléfono", psValue(c.phone)],
    ["✉", "Email", psValue(c.email)],
    ["▣", "Contrato", psValue(c.contract)],
    ["◉", "Estado", <span key="st" className="ps-pill">{statusLabel(c.status || "")}</span>],
  ];
  const saleCard = { label: "Venta", desc: "Registrar o revisar venta del expediente", icon: DollarSign, tone: "green" as const, onClick: () => openSaleModal() };
  const notesCard = { label: "Notas", desc: "Notas, follow-ups y recordatorios", icon: MessageSquare, tone: "blue" as const, onClick: () => setNoteOpen(true) };
  const isQuick = !!c.quickExpedient && !c.completedExpedient;
  const toolCards = isQuick
    ? [saleCard, notesCard]
    : [
        ...TOOLS.map((t) => ({
          label: t.label,
          desc: t.desc,
          icon: t.icon,
          tone: t.tone,
          onClick: () => {
            setToolMode("client", id);
            router.push(`/clients/${id}/${t.href}`);
          },
        })),
        saleCard,
        notesCard,
      ];
  const sales = [...(c.sales || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const saleModalTitle = "Venta del expediente / Nueva venta";
  const saleModalSub = editingSaleId
    ? `Editando venta existente: ${clientDisplayName(c)}`
    : `Venta desde expediente: ${clientDisplayName(c)}`;

  return (
    <>
      <Topbar title="Expediente" subtitle="Información del expediente" />
      <div className="sales-page">
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <Link href="/clients" className="btn btn-ghost btn-sm">← Volver</Link>
          <div style={{ flex: 1 }}>
            <div id="exp-title" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>{clientDisplayName(c)}</div>
            <div id="exp-since" style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{since}</div>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openSaleModal()}>Registrar venta</button>
          <button type="button" className="btn btn-danger btn-sm" onClick={async () => {
            if (await confirmDialog(`¿Eliminar a ${clientDisplayName(c)}?`)) { deleteClient(id); router.push("/clients"); }
          }}>Eliminar</button>
        </div>

        <div className="ethic-box" style={{ marginBottom: 16 }}>
          <strong>Código ético:</strong> este expediente es temporal. Al procesar o cerrar una operación, la app debe conservar solo información comercial/estadística y limpiar datos personales innecesarios.
        </div>

        <div className="exp-layout">
          <div>
            <div className="section-label" id="exp-tool-section-label">Información del expediente</div>
            <div className="exp-tool-list" id="exp-tool-list">
              {toolCards.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.label} type="button" className="tool-card" onClick={t.onClick}>
                    <div className={`tool-icon ${t.tone}`}><Icon size={20} /></div>
                    <div>
                      <div className="tool-name">{t.label}</div>
                      <div className="tool-desc">{t.desc}</div>
                    </div>
                    <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>›</div>
                  </button>
                );
              })}
              {isQuick && (
                <button type="button" className="tool-card" onClick={() => {
                  completeClientExpedient(id);
                  toast.success("Expediente completo activado. Ya puedes llenar Survey, Proyección y Worksheet.");
                }}>
                  <div className="tool-icon blue"><FileText size={20} /></div>
                  <div>
                    <div className="tool-name">Completar expediente</div>
                    <div className="tool-desc">Agregar Survey, Proyección y Worksheet cuando se necesite</div>
                  </div>
                  <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>＋</div>
                </button>
              )}
            </div>
          </div>

          <div className="card exp-side-card prospect-summary-card">
            <div className="prospect-summary-head">
              <div>
                <div className="prospect-summary-title">Datos del prospecto</div>
                <div className="prospect-summary-sub">Vista rápida del expediente. El formulario completo se abre solo para editar.</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={openEdit}>✎ Editar datos</button>
            </div>
            <div className="prospect-summary-list" id="prospect-summary-list">
              {rows.map((r, i) => (
                <div key={i} className="ps-row">
                  <div className="ps-icon">{r[0]}</div>
                  <div className="ps-label">{r[1]}</div>
                  <div className="ps-value">{r[2]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card activity-card" id="client-sales-card">
          <div className="card-heading">Ventas del expediente</div>
          <div className="card-sub">Todas las ventas registradas para este cliente, sin importar si nacieron desde Agenda, Clientes o Worksheet.</div>
          <div className="activity-list" id="client-sales-list">
            {!sales.length ? <div className="activity-empty">Sin ventas registradas todavía.</div> : (
              sales.map((sale) => {
                const pending = sale.status === "no-procesable" || sale.processing === "pendiente";
                return (
                  <div key={sale.saleId} className="activity-item">
                    <span className="activity-dot venta" />
                    <div>
                      <div className="activity-main">
                        {`${fmt(sale.vol || 0)} · ${sale.tours || 1} tour(s)`}
                        {pending && <span className="sale-pending-pill">Pendiente</span>}
                      </div>
                      <div className="activity-sub">
                        {[sale.contract ? `Contrato ${sale.contract}` : null, statusLabel(sale.status || ""), sale.processDate ? `Procesa: ${longDate(sale.processDate)}` : null].filter(Boolean).join(" · ")}
                      </div>
                      {sale.note && <div className="activity-sub">{sale.note}</div>}
                    </div>
                    <div className="activity-date">
                      {longDate(sale.date)}
                      <br />
                      <button type="button" className="dg-link" onClick={() => openSaleModal(sale)}>Abrir venta</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card activity-card">
          <div className="card-heading">Actividad del expediente</div>
          <div className="card-sub">Notas y follow-ups vinculados a este cliente.</div>
          <div className="activity-list" id="client-activity-list">
            {!activityItems.length ? <div className="activity-empty">Sin actividad vinculada todavía.</div> : (
              activityItems.map((a) => (
                <div key={a.id} className="activity-item">
                  <span className={`activity-dot ${a.type || ""}`} />
                  <div>
                    <div className="activity-main">{a.title}</div>
                    {a.note && <div className="activity-sub">{a.note}</div>}
                  </div>
                  <div className="activity-date">{a.date ? longDate(a.date) : ""}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <SalesModal open={editOpen} onOpenChange={setEditOpen} title="Editar datos del prospecto" sub="Completa solo la información que realmente necesites para trabajar el expediente." maxWidth={760}>
        <div className="prospect-grid">
          <div className="prospect-field"><label>Nombre completo del cliente</label><input type="text" placeholder="Cliente" value={form.name1 || ""} onChange={(e) => setForm({ ...form, name1: e.target.value })} /></div>
          <div className="prospect-field"><label>Ocupación cliente</label><input type="text" placeholder="Ocupación" value={form.occupation1 || ""} onChange={(e) => setForm({ ...form, occupation1: e.target.value })} /></div>
          <div className="prospect-field"><label>Acompañante / Copropietario</label><input type="text" placeholder="Acompañante" value={form.name2 || ""} onChange={(e) => setForm({ ...form, name2: e.target.value })} /></div>
          <div className="prospect-field"><label>Ocupación acompañante</label><input type="text" placeholder="Ocupación" value={form.occupation2 || ""} onChange={(e) => setForm({ ...form, occupation2: e.target.value })} /></div>
          <div className="prospect-field"><label>Ciudad</label><input type="text" placeholder="Ciudad" value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div className="prospect-field"><label>País</label><input type="text" placeholder="País" value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className="prospect-field"><label>Teléfono</label><input type="text" placeholder="Teléfono" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="prospect-field"><label>Email</label><input type="text" placeholder="Email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="prospect-field"><label>Contrato / Referencia</label><input type="text" placeholder="Contrato" value={form.contract || ""} onChange={(e) => setForm({ ...form, contract: e.target.value })} /></div>
          <div className="prospect-field"><label>Fecha de tour</label><input type="date" value={form.tourDate || ""} onChange={(e) => setForm({ ...form, tourDate: e.target.value })} /></div>
          <div className="prospect-field"><label>Estado</label>
            <select value={form.status || ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">Sin estado</option>
              <option value="venta">Venta</option>
              <option value="bback">B-back</option>
              <option value="procesable">Procesable</option>
              <option value="no-procesable">No procesable</option>
              <option value="perdido">Perdido / cerrado</option>
            </select>
          </div>
          <div className="prospect-field"><label>Fecha de procesamiento</label><input type="date" value={form.processDate || ""} onChange={(e) => setForm({ ...form, processDate: e.target.value })} /></div>
          <div className="prospect-field full"><label>Nota / motivo</label><textarea rows={3} placeholder="Contexto, seguimiento o motivo..." value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <div className="ethic-box" style={{ marginTop: 16 }}>La información personal es temporal. Al cerrar o procesar la operación, debe conservarse solo lo comercial/estadístico.</div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveEdit}>Guardar datos</button>
        </div>
      </SalesModal>

      <SalesModal open={saleOpen} onOpenChange={handleSaleOpenChange} title={saleModalTitle} sub={saleModalSub}>
        <div className="prospect-grid">
          <div className="prospect-field"><label>Fecha de venta</label><input type="date" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} /></div>
          <div className="prospect-field"><label>Volumen</label><div className="mfield"><span className="mpfx">$</span><input type="text" placeholder="0" value={saleForm.vol} onChange={(e) => setSaleForm({ ...saleForm, vol: e.target.value })} /></div></div>
          <div className="prospect-field"><label>Tours</label><input type="number" min={0} value={saleForm.tours} onChange={(e) => setSaleForm({ ...saleForm, tours: e.target.value })} /></div>
          <div className="prospect-field"><label>Número de contrato</label><input type="text" placeholder="Contrato / referencia" value={saleForm.contract} onChange={(e) => setSaleForm({ ...saleForm, contract: e.target.value })} /></div>
          <div className="prospect-field"><label>Estado</label>
            <select value={saleForm.status} onChange={(e) => setSaleForm({
              ...saleForm,
              status: e.target.value,
              processDate: e.target.value === "no-procesable" ? saleForm.processDate : "",
              addProcessingFollowup: e.target.value === "no-procesable" ? saleForm.addProcessingFollowup : false,
            })}>
              <option value="procesable">Procesable</option>
              <option value="no-procesable">No procesable</option>
              <option value="venta">Venta procesada</option>
            </select>
          </div>
          {saleForm.status === "no-procesable" && (
            <>
              <div className="prospect-field"><label>Fecha de procesamiento</label><input type="date" value={saleForm.processDate} onChange={(e) => setSaleForm({ ...saleForm, processDate: e.target.value })} /></div>
              <div className="prospect-field">
                <label>Agregar al calendario como follow-up</label>
                <label className="choice-pill on" style={{ justifyContent: "flex-start" }}>
                  <input type="checkbox" checked={saleForm.addProcessingFollowup} onChange={(e) => setSaleForm({ ...saleForm, addProcessingFollowup: e.target.checked })} />
                  Crear recordatorio de procesamiento
                </label>
              </div>
            </>
          )}
          <div className="prospect-field full"><label>Notas</label><textarea rows={3} placeholder="Notas de venta, pago pendiente, detalle de procesamiento..." value={saleForm.note} onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })} /></div>
        </div>
        <div className="ethic-box" style={{ marginTop: 16 }}>Si la venta queda procesada, por ética de datos se debe conservar solo información comercial: fecha, volumen, contrato/referencia y métricas.</div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setSaleOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveSale}>{editingSaleId ? "Guardar cambios" : "Guardar venta"}</button>
        </div>
      </SalesModal>

      <SalesModal open={noteOpen} onOpenChange={setNoteOpen} title="Notas del expediente" sub="Nota, follow-up, pendiente o recordatorio del cliente.">
        <div style={{ marginBottom: 16 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>Tipo</div>
          <div className="seg">
            {[["nota", "Nota"], ["follow", "Follow-up"], ["pendiente", "Pendiente"]].map(([t, l]) => (
              <button key={t} type="button" className={`seg-btn${noteForm.type === t ? " on" : ""}`} onClick={() => setNoteForm({ ...noteForm, type: t })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="link-box" style={{ margin: "12px 0" }}>
          <div className="link-title">Recordatorio</div>
          <div className="prospect-grid">
            <div className="prospect-field"><label>Fecha</label><input type="date" value={noteForm.date} onChange={(e) => setNoteForm({ ...noteForm, date: e.target.value })} /></div>
            <div className="prospect-field"><label>Hora opcional</label><input type="time" value={noteForm.time} onChange={(e) => setNoteForm({ ...noteForm, time: e.target.value })} /></div>
          </div>
          <div className="route-note" style={{ marginTop: 10 }}>Si eliges fecha, también se reflejará en Agenda.</div>
        </div>
        <label className="field-label">Contenido</label>
        <textarea rows={4} placeholder="Escribe la nota o pendiente..." value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} />
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setNoteOpen(false)}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={saveNote}>Guardar nota</button>
        </div>
      </SalesModal>
    </>
  );
}
