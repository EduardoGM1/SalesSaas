
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { translate } from "@/lib/i18n.js";
import { isActiveAgendaSale } from "@/lib/sales/agenda-sales";
import { useI18n } from "@/hooks/use-i18n.js";
import { useMoney } from "@/hooks/use-money.js";
import { calKey } from "@/lib/format/dates";
import { EMPTY_CAL_MONTH } from "@/lib/store-empty.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { EntryDialog } from "./entry-dialog";
import { SaleDetailModal } from "@/components/sales/sale-detail-modal.jsx";
import { useUserFeatures } from "@/hooks/use-user-features.js";
import { resolveEntryClientId } from "@/lib/clients/resolve-entry-client";
import { CalEntry } from "@/lib/storage/types";

export function CalendarPage() {
  const navigate = useNavigate();
  const { t, months, weekdays, weekdaysShort } = useI18n();
  const { fmt } = useMoney();
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const selDay = useAppStore((s) => s.selDay);
  const setSelDay = useAppStore((s) => s.setSelDay);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const deleteCalEntry = useDbStore((s) => s.deleteCalEntry);
  const db = useDbStore((s) => s.db);
  const data = useDbStore((s) => s.db.cal[calKey(calYear, calMonth)] ?? EMPTY_CAL_MONTH);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ venta: true });
  const [viewSaleId, setViewSaleId] = useState<string | null>(null);
  const { canViewSaleModal, canViewSaleDetail } = useUserFeatures();

  if (!hydrated) return <Topbar title={t("page.agenda.title")} subtitle={t("common.loading")} />;
  const first = new Date(calYear, calMonth, 1).getDay();
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const entries: CalEntry[] = selDay
    ? (data.days[selDay] || []).filter((entry) => !entry.completed && (entry.t !== "venta" || isActiveAgendaSale(db, entry)))
    : [];

  const openAdd = () => {
    if (!selDay) return toast.info(t("cal.selectDayFirst"));
    setDialogOpen(true);
  };

  const renderGroup = (type: CalEntry["t"], label, dotClass, items: CalEntry[]) => {
    if (!items.length) return null;
    const open = openGroups[type] ?? false;
    const totalVol = items.reduce((a, e) => a + (e.vol || 0), 0);
    return (
      <div key={type} className="day-group">
        <button type="button" className="dg-head w-full text-left" onClick={() => setOpenGroups((s) => ({ ...s, [type]: !open }))}>
          <div className="dg-left">
            <span className={`dg-dot ${dotClass}`} />
            <span className="dg-name">{label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {type === "venta" && (
              <>
                {items.length > 1 && <span className="dg-count">{items.length}</span>}
                <span className="dg-sum">{fmt(totalVol)}</span>
              </>
            )}
            {type !== "venta" && <span className="dg-count">{items.length}{type === "nota" ? ` nota${items.length > 1 ? "s" : ""}` : type === "descanso" ? ` día${items.length > 1 ? "s" : ""}` : ""}</span>}
            <span className="dg-count">{open ? "▾" : "▸"}</span>
          </div>
        </button>
        {open && (
          <div className="dg-body open">
            {items.map((e, i) => {
              const idx = selDay ? (data.days[selDay] || []).indexOf(e) : -1;
              const clientId = resolveEntryClientId(db, e);
              return (
                <div key={i} className="dg-entry">
                  <div style={{ flex: 1 }}>
                    {e.t === "venta" && <div className="dg-name">{fmt(e.vol || 0)} — {e.tours || 0} {t("cal.tours")}</div>}
                    {e.note && <div className="dp-date" style={{ color: e.t === "venta" ? undefined : "var(--text)" }}>{e.note}</div>}
                  </div>
                  <div className="dg-entry-actions">
                    {type === "venta" && e.saleId && canViewSaleModal ? (
                      <button type="button" className="dg-link" onClick={() => setViewSaleId(e.saleId || null)}>{t("common.viewSale")}</button>
                    ) : null}
                    {clientId ? (
                      <button type="button" className="dg-link" onClick={() => navigate(`/clients/${clientId}`)}>{t("common.goToFile")}</button>
                    ) : e.t !== "venta" ? (
                      <button type="button" className="dg-del" onClick={async () => {
                        if (await confirmDialog(translate("toast.cal.deleteEntry")) && selDay) deleteCalEntry(calYear, calMonth, selDay, idx);
                      }}>✕</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Topbar title={t("page.agenda.title")} subtitle={t("page.agenda.subtitle")} />
      <div className="sales-page">
        <PageBack
          onClick={() => {
            if (selDay != null) setSelDay(null);
            else navigate(-1);
          }}
        />
        <div className="cal-layout">
          <div className="cal-widget">
            <div className="agenda-month-nav">
              <button type="button" className="tb-nav-btn" onClick={calPrev}>‹</button>
              <div className="agenda-month-label">{months[calMonth]} {calYear}</div>
              <button type="button" className="tb-nav-btn" onClick={calNext}>›</button>
            </div>
            <div className="cal-weekdays">
              {weekdaysShort.map((d) => <div key={d} className="cal-wd">{d}</div>)}
            </div>
            <div className="cal-grid">
              {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} className="cal-day other" />)}
              {Array.from({ length: dim }, (_, i) => {
                const d = i + 1;
                const es = (data.days[d] || []).filter((entry) => !entry.completed);
                const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
                const isSel = selDay === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelDay(d)}
                    className={`cal-day${isToday ? " today" : ""}${isSel ? " sel" : ""}`}
                  >
                    <div className="cal-dn">{d}</div>
                    <div className="cal-dots">
                      {es.some((e) => isActiveAgendaSale(db, e)) && <span className="cal-dot sale" />}
                      {es.some((e) => e.t === "nota") && <span className="cal-dot note" />}
                      {es.some((e) => e.t === "follow") && <span className="cal-dot follow" />}
                      {es.some((e) => e.t === "descanso") && <span className="cal-dot descanso" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="day-panel">
            <div className="dp-head">
              <div>
                <div className="dp-title">{selDay ? `${weekdays[new Date(calYear, calMonth, selDay).getDay()]} ${selDay}` : t("cal.dayDetail")}</div>
                <div className="dp-date">{selDay ? `${months[calMonth]} ${calYear}` : t("cal.selectDay")}</div>
              </div>
              <button type="button" className="add-fab" onClick={openAdd}>+</button>
            </div>
            {!selDay && <div className="dp-empty">{t("cal.selectDayHint")}</div>}
            {selDay && !entries.length && <div className="dp-empty">{t("cal.emptyDay")}</div>}
            {selDay && entries.length > 0 && (
              <div>
                {renderGroup("venta", t("cal.sales"), "sale", entries.filter((e) => isActiveAgendaSale(db, e)))}
                {renderGroup("nota", t("cal.notes"), "note", entries.filter((e) => e.t === "nota"))}
                {renderGroup("follow", t("cal.followups"), "follow", entries.filter((e) => e.t === "follow"))}
                {renderGroup("descanso", t("cal.rest"), "descanso", entries.filter((e) => e.t === "descanso"))}
              </div>
            )}
          </div>
        </div>
      </div>
      {selDay && <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} year={calYear} month={calMonth} day={selDay} />}
      <SaleDetailModal
        open={!!viewSaleId}
        onOpenChange={(open) => { if (!open) setViewSaleId(null); }}
        saleId={viewSaleId}
        showTools={canViewSaleDetail}
      />
    </>
  );
}
