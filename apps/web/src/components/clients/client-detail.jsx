
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {  useNavigate, useSearchParams  } from "react-router-dom";
import { FileText, Palmtree, DollarSign, MessageSquare } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { ClientRecordModal } from "@/components/clients/client-record-modal.jsx";
import { ShareProspectModal } from "@/components/network/share-prospect-modal.jsx";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sharingApi } from "@/lib/network-api.js";
import { prospectRowToClient, canEditShared, canCommentShared } from "@/lib/shared-prospect";
import { Topbar } from "@/components/layout/topbar";
import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { longDate, ymdToday } from "@/lib/format/dates";
import { parseMoney } from "@/lib/format/money";
import { statusLabel } from "@/lib/format/status";
import { useMoney } from "@/hooks/use-money.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import { ClientRecord } from "@/lib/storage/types";
import { SaleRecord } from "@/lib/storage/types";
import { useClientActions } from "@/hooks/use-client-actions.js";
import { useSaleActions } from "@/hooks/use-sale-actions.js";
import { useCalendarActions } from "@/hooks/use-calendar-actions.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";

const NOTE_TYPE_OPTIONS = [
  ["nota", "exp.note.typeNote"],
  ["follow", "exp.note.typeFollow"],
  ["pendiente", "exp.note.typePending"],
];

const TOOL_DEFS = [
  { key: "survey", labelKey: "exp.tool.survey", descKey: "exp.tool.surveyDesc", icon: FileText, href: "survey", tone: "blue" },
  { key: "vacaciones", labelKey: "exp.tool.vacation", descKey: "exp.tool.vacationDesc", icon: Palmtree, href: "vacaciones", tone: "green" },
  { key: "worksheet", labelKey: "exp.tool.worksheet", descKey: "exp.tool.worksheetDesc", icon: DollarSign, href: "worksheet", tone: "purple" },
];

export function ClientDetail({ id, sharedRemote = false, backHref = "/clients", contactId }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hydrated = useAppStore((s) => s.hydrated);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const getClient = useDbStore((s) => s.getClient);
  const completeClientExpedient = useDbStore((s) => s.completeClientExpedient);
  const { updateClient, removeClient } = useClientActions();
  const { saveSale: persistSale } = useSaleActions();
  const { saveNoteForClient } = useCalendarActions();
  const { fmt } = useMoney();
  const { t, lang } = useI18n();

  const [shareOpen, setShareOpen] = useState(false);
  const [recordModal, setRecordModal] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [form, setForm] = useState<Partial<ClientRecord>>({});
  const [saleForm, setSaleForm] = useState({ date: ymdToday(), vol: "", tours: "1", contract: "", status: "procesable", processDate: "", note: "", addProcessingFollowup: true });
  const [noteForm, setNoteForm] = useState({ type: "nota", note: "", date: "", time: "" });
  const [remoteClient, setRemoteClient] = useState(null);
  const [sharePerm, setSharePerm] = useState("owner");
  const [remoteLoading, setRemoteLoading] = useState(sharedRemote);

  const localC = getClient(id);
  const c = sharedRemote ? remoteClient : localC;
  const perm = sharedRemote ? sharePerm : "owner";
  const canEdit = canEditShared(perm);
  const canComment = canCommentShared(perm);
  const isOwner = perm === "owner";

  useEffect(() => {
    if (!sharedRemote || !id) return;
    setRemoteLoading(true);
    sharingApi.getSharedProspect(id)
      .then((data) => {
        setSharePerm(data.permission);
        setRemoteClient(prospectRowToClient(data.prospect));
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setRemoteLoading(false));
  }, [id, sharedRemote]);

  const reloadRemote = async () => {
    const data = await sharingApi.getSharedProspect(id);
    setSharePerm(data.permission);
    setRemoteClient(prospectRowToClient(data.prospect));
  };

  const openSaleModal = (sale?: SaleRecord, prefillFromWorksheet = false) => {
    const ws = c?.data?.worksheet || {};
    const worksheetVol = prefillFromWorksheet ? parseMoney(String(ws.wv ?? "")) : 0;
    const existingSales = [...(c?.sales || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const resolvedSale = sale ?? (prefillFromWorksheet ? undefined : existingSales[0]);
    const editingId = resolvedSale?.saleId || null;
    setForm({ ...c });
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
    setRecordModal({ mode: editingId ? "sale-edit" : "sale-new", editingSaleId: editingId });
  };

  useEffect(() => {
    if (sharedRemote || !hydrated || !localC || searchParams.get("openSale") !== "1") return;
    openSaleModal(undefined, searchParams.get("from") === "worksheet");
    navigate(`/clients/${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, localC?.id, id, searchParams, navigate, sharedRemote]);

  if (sharedRemote && remoteLoading) return <Topbar title={t("exp.title")} subtitle={t("exp.loading")} />;
  if (!sharedRemote && !hydrated) return <Topbar title={t("exp.title")} subtitle={t("exp.loading")} />;
  if (!c) return (
    <>
      <Topbar title={t("exp.title")} subtitle={t("exp.notFound")} />
      <div className="sales-page"><Link to={backHref} className="btn btn-ghost btn-sm">{t("exp.back")}</Link></div>
    </>
  );

  const openEdit = () => {
    setForm({ ...c });
    setRecordModal({ mode: "edit-data" });
  };

  const closeRecordModal = () => setRecordModal(null);

  const saveRecord = async () => {
    if (!recordModal) return;
    if (recordModal.mode === "edit-data") {
      if (sharedRemote) {
        try {
          await sharingApi.updateProspect(id, form);
          await reloadRemote();
          toast.success(t("exp.edit.save"));
          closeRecordModal();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      updateClient(c, form);
      closeRecordModal();
      return;
    }
    if (sharedRemote) return;
    updateClient(c, form);
    const result = persistSale(id, saleForm, recordModal.editingSaleId || null);
    if (!result.ok) return;
    closeRecordModal();
  };

  const saveNote = () => {
    const result = saveNoteForClient({
      clientId: id,
      client: c,
      noteForm: { ...noteForm, fallbackDate: ymdToday() },
    });
    if (!result.ok) return;
    setNoteOpen(false);
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
        title: t("exp.sales.activityTitle", { amount: fmt(s.vol || 0) }),
        note: [
          s.tours ? t("exp.sales.tours", { n: s.tours }) : null,
          s.contract ? t("exp.sales.contract", { contract: s.contract }) : null,
          s.note,
        ].filter(Boolean).join(" · "),
        ts: s.ts || 0,
        saleId: s.saleId,
      });
    }
    return acts.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  })();
  const cityCountry = [c.city, c.country].filter(Boolean).join(" / ");
  const loc = [c.city, c.country].filter(Boolean).join(", ");
  const fecha = c.tourDate
    ? t("exp.tourDate", { date: longDate(c.tourDate, lang) })
    : t("exp.createdDate", { date: c.createdYmd ? longDate(c.createdYmd, lang) : "—" });
  const since = fecha + (c.status ? ` · ${statusLabel(c.status, lang)}` : "") + (loc ? ` · ${loc}` : "");

  const psValue = (v, pill = false) => {
    const val = String(v || "").trim();
    if (!val) return <span className="ps-empty" />;
    return pill ? <span className="ps-pill">{val}</span> : val;
  };

  const psCell = (icon, label, value) => (
    <div className="ps-row">
      <div className="ps-icon">{icon}</div>
      <div className="ps-label">{label}</div>
      <div className="ps-value">{value}</div>
    </div>
  );

  const saleCard = isOwner ? { label: t("exp.card.sale"), desc: t("exp.card.saleDesc"), icon: DollarSign, tone: "green", onClick: () => openSaleModal() } : null;
  const notesCard = canComment && !sharedRemote ? { label: t("exp.card.notes"), desc: t("exp.card.notesDesc"), icon: MessageSquare, tone: "blue", onClick: () => setNoteOpen(true) } : null;
  const isQuick = !!c.quickExpedient && !c.completedExpedient;
  const toolCards = isQuick
    ? [saleCard, notesCard].filter(Boolean)
    : [
        ...TOOL_DEFS.map((tool) => ({
          label: t(tool.labelKey),
          desc: t(tool.descKey),
          icon: tool.icon,
          tone: tool.tone,
          onClick: sharedRemote
            ? () => {
                if (!contactId) return;
                navigate(`/red/contacto/${contactId}/expediente/${id}/${tool.href}`);
              }
            : () => {
                setToolMode("client", id);
                navigate(`/clients/${id}/${tool.href}`);
              },
        })),
        ...(saleCard ? [saleCard] : []),
        ...(notesCard ? [notesCard] : []),
      ];
  const sales = [...(c.sales || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return (
    <>
      <Topbar title={t("exp.title")} subtitle={t("exp.subtitle")} />
      <div className="sales-page">
        <header className="exp-page-head">
          <Link to={backHref} className="btn btn-ghost btn-sm exp-page-back">{t("exp.back")}</Link>
          <div className="exp-page-meta">
            <h1 className="exp-page-title" id="exp-title">{clientDisplayName(c)}</h1>
            <p className="exp-page-sub" id="exp-since">{since}</p>
            {sharedRemote && (
              <p className="exp-page-sub shared-perm-hint">
                {perm === "edit" ? t("network.permEdit") : perm === "comment" ? t("network.permComment") : t("network.permView")}
              </p>
            )}
          </div>
          {isOwner && (
            <div className="exp-page-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openSaleModal()}>{t("exp.registerSale")}</button>
              {isSupabaseConfigured() && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShareOpen(true)}>{t("network.shareAction")}</button>
              )}
              <button type="button" className="btn btn-danger btn-sm" onClick={async () => {
                if (await removeClient(id, clientDisplayName(c))) navigate("/clients");
              }}>{t("exp.delete")}</button>
            </div>
          )}
        </header>

        <div className="ethic-box" style={{ marginBottom: 16 }}>
          {t("exp.ethics.main")}
        </div>

        <div className="exp-layout">
          <div>
            <div className="section-label" id="exp-tool-section-label">{t("exp.section.info")}</div>
            <div className="exp-tool-list" id="exp-tool-list">
              {toolCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button key={card.label} type="button" className="tool-card" onClick={card.onClick}>
                    <div className={`tool-icon ${card.tone}`}><Icon size={20} /></div>
                    <div>
                      <div className="tool-name">{card.label}</div>
                      <div className="tool-desc">{card.desc}</div>
                    </div>
                    <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>›</div>
                  </button>
                );
              })}
              {isQuick && (
                <button type="button" className="tool-card" onClick={() => {
                  completeClientExpedient(id);
                  toast.success(t("exp.complete.toast"));
                }}>
                  <div className="tool-icon blue"><FileText size={20} /></div>
                  <div>
                    <div className="tool-name">{t("exp.complete.title")}</div>
                    <div className="tool-desc">{t("exp.complete.desc")}</div>
                  </div>
                  <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>＋</div>
                </button>
              )}
            </div>
          </div>

          <div className="card exp-side-card prospect-summary-card">
            <div className="prospect-summary-head">
              <div>
                <div className="prospect-summary-title">{t("exp.prospect.title")}</div>
                <div className="prospect-summary-sub">{t("exp.prospect.sub")}</div>
              </div>
              {canEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={openEdit}>{t("exp.prospect.edit")}</button>
              )}
            </div>
            <div className="prospect-summary-list prospect-summary-grid" id="prospect-summary-list">
              <div className="ps-grid-row ps-grid-row--full">
                {psCell("#", t("exp.prospect.id"), psValue(c.prospectCode, true))}
              </div>
              <div className="ps-grid-row ps-grid-row--pair">
                {psCell("👤", t("exp.prospect.name"), psValue(c.name1 || c.name, true))}
                {psCell("👥", t("exp.prospect.companion"), psValue(c.name2))}
              </div>
              <div className="ps-grid-row ps-grid-row--full">
                {psCell("📍", t("exp.prospect.location"), psValue(cityCountry))}
              </div>
              <div className="ps-grid-row ps-grid-row--pair">
                {psCell("☎", t("exp.prospect.phone"), psValue(c.phone))}
                {psCell("✉", t("exp.prospect.email"), psValue(c.email))}
              </div>
              <div className="ps-grid-row ps-grid-row--pair">
                {psCell("▣", t("exp.prospect.contract"), psValue(c.contract))}
                {psCell("◉", t("exp.prospect.status"), <span className="ps-pill">{statusLabel(c.status || "", lang)}</span>)}
              </div>
            </div>
          </div>
        </div>

        <div className="card activity-card" id="client-sales-card">
          <div className="card-heading">{t("exp.sales.title")}</div>
          <div className="card-sub">{t("exp.sales.sub")}</div>
          <div className="activity-list" id="client-sales-list">
            {!sales.length ? <div className="activity-empty">{t("exp.sales.empty")}</div> : (
              sales.map((sale) => {
                const pending = sale.status === "no-procesable" || sale.processing === "pendiente";
                return (
                  <div key={sale.saleId} className="activity-item">
                    <span className="activity-dot venta" />
                    <div>
                      <div className="activity-main">
                        {`${fmt(sale.vol || 0)} · ${t("exp.sales.tours", { n: sale.tours || 1 })}`}
                        {pending && <span className="sale-pending-pill" title={t("exp.sales.pendingHint")}>{t("exp.sales.pending")}</span>}
                      </div>
                      <div className="activity-sub">
                        {[sale.contract ? t("exp.sales.contract", { contract: sale.contract }) : null, statusLabel(sale.status || "", lang), sale.processDate ? t("exp.sales.processes", { date: longDate(sale.processDate, lang) }) : null].filter(Boolean).join(" · ")}
                      </div>
                      {sale.note && <div className="activity-sub">{sale.note}</div>}
                    </div>
                    <div className="activity-date">
                      {longDate(sale.date, lang)}
                      <br />
                      {isOwner && (
                        <button type="button" className="dg-link" onClick={() => openSaleModal(sale)}>{t("exp.sales.open")}</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="card activity-card">
          <div className="card-heading">{t("exp.activity.title")}</div>
          <div className="card-sub">{t("exp.activity.sub")}</div>
          <div className="activity-list" id="client-activity-list">
            {!activityItems.length ? <div className="activity-empty">{t("exp.activity.empty")}</div> : (
              activityItems.map((a) => (
                <div key={a.id} className="activity-item">
                  <span className={`activity-dot ${a.type || ""}`} />
                  <div>
                    <div className="activity-main">{a.title}</div>
                    {a.note && <div className="activity-sub">{a.note}</div>}
                  </div>
                  <div className="activity-date">{a.date ? longDate(a.date, lang) : ""}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ClientRecordModal
        open={!!recordModal}
        onOpenChange={(open) => { if (!open) closeRecordModal(); }}
        mode={recordModal?.mode || "edit-data"}
        clientName={clientDisplayName(c)}
        prospectForm={form}
        onProspectChange={setForm}
        saleForm={saleForm}
        onSaleChange={setSaleForm}
        onSave={saveRecord}
        onCancel={closeRecordModal}
      />

      {isOwner && (
        <ShareProspectModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          prospectId={id}
          prospectName={clientDisplayName(c)}
        />
      )}

      <SalesModal open={noteOpen} onOpenChange={setNoteOpen} title={t("exp.note.title")} sub={t("exp.note.sub")}>
        <div style={{ marginBottom: 16 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>{t("exp.note.type")}</div>
          <div className="seg">
            {NOTE_TYPE_OPTIONS.map(([type, labelKey]) => (
              <button key={type} type="button" className={`seg-btn${noteForm.type === type ? " on" : ""}`} onClick={() => setNoteForm({ ...noteForm, type })}>{t(labelKey)}</button>
            ))}
          </div>
        </div>
        <div className="link-box" style={{ margin: "12px 0" }}>
          <div className="link-title">{t("exp.note.reminder")}</div>
          <div className="prospect-grid">
            <div className="prospect-field"><label>{t("entry.reminder.date")}</label><input type="date" value={noteForm.date} onFocus={selectOnFocus} onChange={(e) => setNoteForm({ ...noteForm, date: e.target.value })} /></div>
            <div className="prospect-field"><label>{t("entry.reminder.timeOptional")}</label><input type="time" value={noteForm.time} onFocus={selectOnFocus} onChange={(e) => setNoteForm({ ...noteForm, time: e.target.value })} /></div>
          </div>
          <div className="route-note" style={{ marginTop: 10 }}>{t("exp.note.reminderHint")}</div>
        </div>
        <label className="field-label">{t("exp.note.content")}</label>
        <textarea rows={4} placeholder={t("exp.note.placeholder")} value={noteForm.note} onFocus={selectOnFocus} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} />
        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={() => setNoteOpen(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={saveNote}>{t("exp.note.save")}</button>
        </div>
      </SalesModal>
    </>
  );
}
