"use client";

import { useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";
import { MONTHS, DAYS } from "@/lib/constants";
import { fmt } from "@/lib/format/money";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { EntryDialog } from "./entry-dialog";
import { CalEntry } from "@/lib/storage/types";

export function CalendarPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const selDay = useAppStore((s) => s.selDay);
  const setSelDay = useAppStore((s) => s.setSelDay);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const getCalMonth = useDbStore((s) => s.getCalMonth);
  const deleteCalEntry = useDbStore((s) => s.deleteCalEntry);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ venta: true });

  if (!hydrated) return <Topbar title="Agenda" subtitle="Cargando..." />;

  const data = getCalMonth(calYear, calMonth);
  const first = new Date(calYear, calMonth, 1).getDay();
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const entries: CalEntry[] = selDay ? data.days[selDay] || [] : [];

  const openAdd = () => {
    if (!selDay) return toast.info("Selecciona un día primero.");
    setDialogOpen(true);
  };

  const renderGroup = (type: CalEntry["t"], label: string, dotClass: string, items: CalEntry[]) => {
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
            {type === "venta" && <span className="dg-sum">{fmt(totalVol)}</span>}
            {type !== "venta" && <span className="dg-count">{items.length}{type === "nota" ? ` nota${items.length > 1 ? "s" : ""}` : type === "descanso" ? ` día${items.length > 1 ? "s" : ""}` : ""}</span>}
            <span className="dg-count">{open ? "▾" : "▸"}</span>
          </div>
        </button>
        {open && (
          <div className="dg-body">
            {items.map((e, i) => {
              const idx = entries.indexOf(e);
              return (
                <div key={i} className="dg-entry">
                  <div style={{ flex: 1 }}>
                    {e.t === "venta" && <div className="dg-name">{fmt(e.vol || 0)} — {e.tours || 0} tour(s)</div>}
                    {e.note && <div className="dp-date" style={{ color: e.t === "venta" ? undefined : "var(--text)" }}>{e.note}</div>}
                  </div>
                  <button type="button" className="dg-del" onClick={async () => {
                    if (await confirmDialog("¿Eliminar este registro?") && selDay) deleteCalEntry(calYear, calMonth, selDay, idx);
                  }}>✕</button>
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
      <Topbar title="Agenda" subtitle="Registro operativo diario" />
      <div className="sales-page">
        <div className="cal-layout">
          <div className="cal-widget">
            <div className="agenda-month-nav">
              <button type="button" className="tb-nav-btn" onClick={calPrev}>‹</button>
              <div className="agenda-month-label">{MONTHS[calMonth]} {calYear}</div>
              <button type="button" className="tb-nav-btn" onClick={calNext}>›</button>
            </div>
            <div className="cal-weekdays">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => <div key={d} className="cal-wd">{d}</div>)}
            </div>
            <div className="cal-grid">
              {Array.from({ length: first }).map((_, i) => <div key={`e${i}`} className="cal-day other" />)}
              {Array.from({ length: dim }, (_, i) => {
                const d = i + 1;
                const es = data.days[d] || [];
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
                      {es.some((e) => e.t === "venta") && <span className="cal-dot sale" />}
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
                <div className="dp-title">{selDay ? `${DAYS[new Date(calYear, calMonth, selDay).getDay()]} ${selDay}` : "Detalle del día"}</div>
                <div className="dp-date">{selDay ? `${MONTHS[calMonth]} ${calYear}` : "Selecciona un día del calendario"}</div>
              </div>
              <button type="button" className="add-fab" onClick={openAdd}>+</button>
            </div>
            {!selDay && <div className="dp-empty">Selecciona un día para ver sus registros.</div>}
            {selDay && !entries.length && <div className="dp-empty">Sin registros. Haz clic en + para agregar nota, follow-up o descanso.</div>}
            {selDay && entries.length > 0 && (
              <div>
                {renderGroup("venta", "Ventas", "sale", entries.filter((e) => e.t === "venta"))}
                {renderGroup("nota", "Notas", "note", entries.filter((e) => e.t === "nota"))}
                {renderGroup("follow", "Follow-ups", "follow", entries.filter((e) => e.t === "follow"))}
                {renderGroup("descanso", "Descanso", "descanso", entries.filter((e) => e.t === "descanso"))}
              </div>
            )}
          </div>
        </div>
      </div>
      {selDay && <EntryDialog open={dialogOpen} onOpenChange={setDialogOpen} year={calYear} month={calMonth} day={selDay} />}
    </>
  );
}
