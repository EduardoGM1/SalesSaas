
import { useEffect, useMemo, useState } from "react";
import {  useNavigate  } from "react-router-dom";
import { SalesModal } from "@/components/ui/sales-modal";
import { useCalendarActions } from "@/hooks/use-calendar-actions.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";

type EType = "venta" | "follow" | "notaCliente" | "notaUsuario" | "descanso" | "noTour";

interface EntryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  day: number;
}

const TYPE_TAB_KEYS: [EType, string][] = [
  ["venta", "entry.tab.sale"],
  ["notaCliente", "entry.tab.clientNote"],
  ["noTour", "entry.tab.noTour"],
  ["follow", "entry.tab.follow"],
  ["notaUsuario", "entry.tab.userNote"],
  ["descanso", "entry.tab.dayOff"],
];

export function EntryDialog({ open, onOpenChange, year, month, day }: EntryDialogProps) {
  const navigate = useNavigate();
  const { t, months, weekdays } = useI18n();
  const { saveUserNote, saveDayOff, saveNoTour } = useCalendarActions();

  const [eType, setEType] = useState<EType>("venta");
  const [nota, setNota] = useState("");
  const [remDate, setRemDate] = useState("");
  const [remTime, setRemTime] = useState("");

  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dow = new Date(year, month, day).getDay();
  const title = `${weekdays[dow]} ${day} ${t("entry.titleSuffix")} ${months[month]}`;
  const subtitle = `${months[month]} ${year}`;

  const clientAction = eType === "venta" || eType === "follow" || eType === "notaCliente";

  const routeCopy = useMemo(() => {
    if (eType === "venta") return t("entry.route.sale.copy");
    if (eType === "follow") return t("entry.route.follow.copy");
    if (eType === "notaCliente") return t("entry.route.clientNote.copy");
    return t("entry.route.default.copy");
  }, [eType, t]);

  const routeNote = useMemo(() => {
    if (eType === "venta") return t("entry.route.sale.path");
    if (eType === "follow") return t("entry.route.follow.path");
    if (eType === "notaCliente") return t("entry.route.clientNote.path");
    return t("entry.route.default.path");
  }, [eType, t]);

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
      return;
    }

    if (eType === "noTour") {
      saveNoTour({ year, month, day, note: nota });
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
      modalClassName="entry-modal-sticky"
    >
      <div className="entry-modal-sticky-head">
        <div className="entry-type-label">{t("entry.prompt")}</div>
        <div className="seg entry-type-seg entry-type-seg--grid">
          {TYPE_TAB_KEYS.map(([typeKey, labelKey]) => (
            <button
              key={typeKey}
              type="button"
              className={`seg-btn${eType === typeKey ? " on" : ""}`}
              onClick={() => setEType(typeKey)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="entry-modal-sticky-body">
        <div className="entry-modal-sticky-content">
        {eType === "descanso" && (
          <div id="ef-descanso">
            <div className="hint">{t("entry.dayOff.hint")}</div>
          </div>
        )}

        {eType === "noTour" && (
          <div id="ef-no-tour">
            <div className="hint">{t("entry.noTour.hint")}</div>
            <label className="entry-field-label">
              {t("entry.noTour.label")}
            </label>
            <textarea
              rows={3}
              className="entry-field-textarea"
              value={nota}
              onFocus={selectOnFocus}
              onChange={(e) => setNota(e.target.value)}
              placeholder={t("entry.noTour.placeholder")}
            />
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
                    <div className="route-card-title">{t("entry.route.createNew.title")}</div>
                    <div className="route-card-sub">{t("entry.route.createNew.sub")}</div>
                  </div>
                </button>
                <button type="button" className="route-card green" onClick={goClientsFromAgenda}>
                  <div className="route-card-icon">↗</div>
                  <div>
                    <div className="route-card-title">{t("entry.route.existing.title")}</div>
                    <div className="route-card-sub">{t("entry.route.existing.sub")}</div>
                  </div>
                </button>
              </div>
              <div className="route-note" id="agenda-client-route-note">{routeNote}</div>
            </div>
          </div>
        )}

        {eType === "notaUsuario" && (
          <>
            <div id="entry-reminder-wrap" className="link-box entry-reminder-wrap">
              <div className="link-title">{t("entry.reminder.title")}</div>
              <div className="prospect-grid">
                <div className="prospect-field">
                  <label>{t("entry.reminder.date")}</label>
                  <input type="date" id="e-rem-date" value={remDate} onFocus={selectOnFocus} onChange={(e) => setRemDate(e.target.value)} />
                </div>
                <div className="prospect-field">
                  <label>{t("entry.reminder.timeOptional")}</label>
                  <input type="time" id="e-rem-time" value={remTime} onFocus={selectOnFocus} onChange={(e) => setRemTime(e.target.value)} />
                </div>
              </div>
              <div className="route-note entry-reminder-hint">
                {t("entry.reminder.hint")}
              </div>
            </div>
            <div id="ef-nota">
              <label className="entry-field-label">
                {t("entry.userNote.label")}
              </label>
              <textarea
                id="e-nota-t"
                rows={4}
                className="entry-field-textarea"
                value={nota}
                onFocus={selectOnFocus}
                onChange={(e) => setNota(e.target.value)}
                placeholder={t("entry.userNote.placeholder")}
              />
            </div>
          </>
        )}

        </div>

        <div className="btn-row entry-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={() => close(false)}>{t("common.cancel")}</button>
          {!clientAction && (
            <button type="button" className="btn btn-primary" id="entry-save-btn" onClick={handleSave}>
              {t("common.save")}
            </button>
          )}
        </div>
      </div>
    </SalesModal>
  );
}
