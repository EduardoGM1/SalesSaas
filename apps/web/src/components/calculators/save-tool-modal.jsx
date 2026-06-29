
import { useEffect, useState } from "react";
import {  useNavigate  } from "react-router-dom";
import { SalesModal } from "@/components/ui/sales-modal";
import { toast } from "@/lib/toast";
import { translate } from "@/lib/i18n.js";
import { activeClients, clientDisplayName } from "@/lib/clients";
import { ymdToday } from "@/lib/format/dates";
import { parseMoney } from "@/lib/format/money";
import { createEmptyClient, useDbStore } from "@/stores/db-store";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { shallow } from "zustand/shallow";

type Tool = "survey" | "vacaciones" | "worksheet";

const TOOL_LABEL_KEYS: Record<Tool, string> = {
  survey: "tools.survey",
  vacaciones: "tools.vacation",
  worksheet: "tools.worksheet",
};

const STATUS_OPTIONS = [
  { value: "", key: "status.empty" },
  { value: "venta", key: "status.sale" },
  { value: "bback", key: "status.bback" },
  { value: "pendiente", key: "status.notProcessable" },
  { value: "perdido", key: "status.lost" },
];

const emptyFields = () => ({
  name1: "", occ1: "", city: "", country: "",
  tipoTour: "", tourCuantificable: true,
  contract: "", tourDate: "", status: "",
  processDate: "", processAmount: "", note: "",
});

interface SaveToolModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tool: Tool;
}

export function SaveToolModal({ open, onOpenChange, tool }: SaveToolModalProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const db = useDbStore((s) => s.db, shallow);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveClient = useDbStore((s) => s.saveClient);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const tourTypes = db.settings?.tourTypes ?? ["Q", "NQ", "CT", "Member"];

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
      if (!existingId || !db.clients[existingId]) return toast.error(translate("tools.saveModal.errorProspect"));
      saveToolBucket(tool, "client", src, existingId);
      onOpenChange(false);
      navigate(`/clients/${existingId}`);
      return;
    }

    if (!f.name1.trim()) return toast.error(translate("tools.saveModal.errorName"));
    if (!f.tipoTour) return toast.error(translate("clients.missingTourType"));
    const c = createEmptyClient(f.name1.trim(), f.tourDate || ymdToday(), f.tipoTour, f.tourCuantificable);
    c.name = f.name1.trim();
    c.name1 = f.name1;
    c.occupation1 = f.occ1;
    c.city = f.city;
    c.country = f.country;
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
    <SalesModal open={open} onOpenChange={onOpenChange} title={t("tools.saveModal.title")} sub={`${t(TOOL_LABEL_KEYS[tool])} · ${t("tools.saveModal.sub")}`}>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" className={`seg-btn${targetMode === "new" ? " on" : ""}`} onClick={() => setTargetMode("new")}>{t("tools.saveModal.modeNew")}</button>
        <button type="button" className={`seg-btn${targetMode === "existing" ? " on" : ""}`} onClick={() => setTargetMode("existing")}>{t("tools.saveModal.modeExisting")}</button>
      </div>

      {targetMode === "existing" && (
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">{t("tools.saveModal.selectProspect")}</label>
          <select value={existingId} onChange={(e) => setExistingId(e.target.value)}>
            <option value="">{clients.length ? t("tools.saveModal.selectProspect") : t("clients.emptyAll")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{clientDisplayName(c)}{c.contract ? ` · ${c.contract}` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {targetMode === "new" && (
        <div className="prospect-grid">
          <div className="prospect-field"><label>{t("exp.edit.name")}</label><input type="text" placeholder={t("tools.survey.namePlaceholder")} value={f.name1} onFocus={selectOnFocus} onChange={(e) => set("name1", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("exp.edit.occ1")}</label><input type="text" placeholder={t("tools.survey.occPlaceholder")} value={f.occ1} onFocus={selectOnFocus} onChange={(e) => set("occ1", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("exp.edit.city")}</label><input type="text" placeholder={t("tools.survey.city")} value={f.city} onFocus={selectOnFocus} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("exp.edit.country")}</label><input type="text" placeholder={t("tools.survey.country")} value={f.country} onFocus={selectOnFocus} onChange={(e) => set("country", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("clients.tourType")}</label>
            <select value={f.tipoTour} onChange={(e) => set("tipoTour", e.target.value)}>
              <option value="">{t("clients.tourTypePlaceholder")}</option>
              {tourTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="prospect-field"><label>{t("clients.isTourQuantifiable")}</label>
            <div className="seg newclient-seg" role="group" aria-label={t("clients.isTourQuantifiable")}>
              <button type="button" className={`seg-btn${f.tourCuantificable ? " on" : ""}`} onClick={() => set("tourCuantificable", true)}>{t("clients.yes")}</button>
              <button type="button" className={`seg-btn${!f.tourCuantificable ? " on" : ""}`} onClick={() => set("tourCuantificable", false)}>{t("clients.no")}</button>
            </div>
          </div>
          <div className="prospect-field"><label>{t("exp.edit.contract")}</label><input type="text" placeholder={t("exp.sale.contractPlaceholder")} value={f.contract} onFocus={selectOnFocus} onChange={(e) => set("contract", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("exp.edit.tourDate")}</label><input type="date" value={f.tourDate} onFocus={selectOnFocus} onChange={(e) => set("tourDate", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("exp.edit.status")}</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS_OPTIONS.map(({ value, key }) => (
                <option key={value || "empty"} value={value}>{t(key)}</option>
              ))}
            </select>
          </div>
          <div className="prospect-field"><label>{t("exp.edit.processDate")}</label><input type="date" value={f.processDate} onFocus={selectOnFocus} onChange={(e) => set("processDate", e.target.value)} /></div>
          <div className="prospect-field"><label>{t("tools.survey.table.amount")}</label><div className="mfield"><span className="mpfx">$</span><input type="text" placeholder="0" value={f.processAmount} onFocus={selectOnFocus} onChange={(e) => set("processAmount", e.target.value)} /></div></div>
          <div className="prospect-field full"><label>{t("exp.edit.note")}</label><textarea rows={3} placeholder={t("exp.edit.notePlaceholder")} value={f.note} onFocus={selectOnFocus} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
      )}

      <div className="ethic-box" style={{ marginTop: 16 }}>{t("tools.saveModal.ethics")}</div>
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</button>
        <button type="button" className="btn btn-primary" onClick={handleSave}>{t("common.save")}</button>
      </div>
    </SalesModal>
  );
}
