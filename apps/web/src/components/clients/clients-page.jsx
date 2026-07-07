
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Eye, Share2, Trash2 } from "lucide-react";
import { SalesModal } from "@/components/ui/sales-modal";
import { ShareProspectModal } from "@/components/network/share-prospect-modal.jsx";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { clientDisplayName } from "@/lib/clients";
import { shortDate } from "@/lib/format/dates";
import { useI18n } from "@/hooks/use-i18n.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { DEFAULT_TOUR_TYPES } from "@/lib/store-empty.js";
import { useDbStore } from "@/stores/db-store";
import { useAppStore } from "@/stores/app-store";
import { useClientActions } from "@/hooks/use-client-actions.js";
import { shallow } from "zustand/shallow";

export function ClientsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const hydrated = useAppStore((s) => s.hydrated);
  const { searchClients, createProspect, removeClient } = useClientActions();
  const db = useDbStore((s) => s.db, shallow);
  const [open, setOpen] = useState(false);
  const [name, setname] = useState("");
  const [tourCuantificable, setTourCuantificable] = useState(true);
  const [tipoTour, setTipoTour] = useState("");
  const [missingName, setMissingName] = useState(false);
  const [missingTipoTour, setMissingTipoTour] = useState(false);
  const [query, setQuery] = useState("");
  const [shareClient, setShareClient] = useState(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const canShare = isSupabaseConfigured();

  const tourTypes = db.settings?.tourTypes ?? DEFAULT_TOUR_TYPES;

  useEffect(() => {
    if (!open) return;
    setMissingName(false);
    setMissingTipoTour(false);
    const timer = window.setTimeout(() => nameRef.current?.focus(), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const allClients = searchClients("");
  const sorted = searchClients(query);
  const hasSearch = query.trim().length > 0;

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      setname("");
      setTourCuantificable(true);
      setTipoTour("");
      setMissingName(false);
      setMissingTipoTour(false);
    }
  };

  const handleCreate = () => {
    let hasError = false;
    if (!name.trim()) {
      setMissingName(true);
      nameRef.current?.focus();
      hasError = true;
    }
    if (!tipoTour) {
      setMissingTipoTour(true);
      hasError = true;
    }
    if (hasError) return;
    const result = createProspect(name.trim(), tipoTour, tourCuantificable);
    if (!result.ok) {
      if (result.reason === "missing_name") {
        setMissingName(true);
        nameRef.current?.focus();
      }
      return;
    }
    handleOpenChange(false);
  };

  if (!hydrated) return <Topbar title={t("page.clients.title")} subtitle={t("common.loading")} />;

  const handleRowClick = (clientId, event) => {
    if (!window.matchMedia("(max-width: 768px)").matches) return;
    if (event.target.closest(".client-actions")) return;
    navigate(`/clients/${clientId}`);
  };

  return (
    <>
      <Topbar title={t("page.clients.title")} subtitle={t("page.clients.subtitle")} />
      <div className="sales-page clients-page">
        <div className="page-toolbar page-toolbar--between">
          <PageBack inline />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleOpenChange(true)}>{t("clients.new")}</button>
        </div>

        <div className="client-search-card">
          <div className="client-search-row">
            <div className="client-search-input-wrap">
              <input
                type="search"
                className="client-search-input"
                placeholder={t("clients.searchPlaceholder")}
                value={query}
                onFocus={selectOnFocus}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery("")}>{t("common.clear")}</button>
            <div className="client-search-count">
              {hasSearch
                ? t("clients.filesCount", { shown: sorted.length, total: allClients.length })
                : t("clients.filesTotal", { total: allClients.length })}
            </div>
          </div>
          <div className="client-search-help">{t("clients.searchHelp")}</div>
        </div>

        {!allClients.length ? (
          <div className="client-empty">{t("clients.emptyCreate")}</div>
        ) : !sorted.length ? (
          <div className="client-search-empty">{t("clients.noResults", { query })}</div>
        ) : (
          <div className="client-table-card">
            <table className="client-table">
              <thead>
                <tr>
                  <th>{t("clients.colName")}</th>
                  <th>{t("clients.colDate")}</th>
                  <th>{t("clients.colTourType")}</th>
                  <th style={{ textAlign: "center" }}>{t("clients.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr
                    key={c.id}
                    className="client-table-row"
                    onClick={(e) => handleRowClick(c.id, e)}
                  >
                    <td>
                      <Link to={`/clients/${c.id}`} className="client-name-link client-name-link--desktop">
                        <span>{clientDisplayName(c)}</span>
                        <span className="client-code">{c.prospectCode}</span>
                      </Link>
                      <div className="client-name-link client-name-link--mobile">
                        <span>{clientDisplayName(c)}</span>
                        <span className="client-code">{c.prospectCode}</span>
                      </div>
                    </td>
                    <td>{c.tourDate ? shortDate(c.tourDate, lang) : c.createdYmd ? shortDate(c.createdYmd, lang) : "—"}</td>
                    <td>{c.tipo_tour ? `${c.tipo_tour} - ${c.tour_cuantificable !== false ? "1" : "0"}` : "—"}</td>
                    <td>
                      <div className="client-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <Link to={`/clients/${c.id}`} className="icon-btn client-action-view" title={t("clients.viewFile")}><Eye size={14} /></Link>
                        {canShare && (
                          <button
                            type="button"
                            className="icon-btn"
                            title={t("clients.share")}
                            onClick={() => {
                              setShareClient({ id: c.id, name: clientDisplayName(c) });
                            }}
                          >
                            <Share2 size={14} />
                          </button>
                        )}
                        <button type="button" className="icon-btn danger" title={t("clients.delete")} onClick={async () => {
                          await removeClient(c.id, clientDisplayName(c));
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

      {canShare && (
        <ShareProspectModal
          open={!!shareClient}
          onOpenChange={(open) => { if (!open) setShareClient(null); }}
          prospectId={shareClient?.id}
          prospectName={shareClient?.name}
        />
      )}

      <SalesModal
        open={open}
        onOpenChange={handleOpenChange}
        title={t("clients.modalTitle")}
        sub={t("clients.modalSub")}
      >
        <div className={`newclient-field required-field${missingName ? " field-missing" : ""}`}>
          <label className="required-label">
            {t("clients.name")}
            <span className="req-star">*</span>
          </label>
          <input
            ref={nameRef}
            id="nc-name"
            type="text"
            value={name}
            placeholder={t("clients.name")}
            onFocus={selectOnFocus}
            onChange={(e) => {
              setname(e.target.value);
              if (e.target.value.trim()) setMissingName(false);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
        </div>
        <div className="newclient-field">
          <label>{t("clients.isTourQuantifiable")}</label>
          <div className="seg newclient-seg" role="group" aria-label={t("clients.isTourQuantifiable")}>
            <button
              type="button"
              className={`seg-btn${tourCuantificable ? " on" : ""}`}
              onClick={() => setTourCuantificable(true)}
            >
              {t("clients.yes")}
            </button>
            <button
              type="button"
              className={`seg-btn${!tourCuantificable ? " on" : ""}`}
              onClick={() => setTourCuantificable(false)}
            >
              {t("clients.no")}
            </button>
          </div>
        </div>
        <div className={`newclient-field required-field${missingTipoTour ? " field-missing" : ""}`}>
          <label className="required-label">
            {t("clients.tourType")}
            <span className="req-star">*</span>
          </label>
          <select
            value={tipoTour}
            onChange={(e) => {
              setTipoTour(e.target.value);
              if (e.target.value) setMissingTipoTour(false);
            }}
          >
            <option value="">{t("clients.tourTypePlaceholder")}</option>
            {tourTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={() => handleOpenChange(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={handleCreate}>{t("clients.createExpediente")}</button>
        </div>
      </SalesModal>
    </>
  );
}
