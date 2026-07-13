import { useI18n } from "@/hooks/use-i18n.js";
import { ExpedienteSectionLockBanner, ExpedientePresenceBar } from "@/components/clients/expediente-presence-bar.jsx";

export function SharedToolBanner({ show, lockedBy, peers }) {
  const { t } = useI18n();
  return (
    <>
      <ExpedientePresenceBar peers={peers || []} />
      {lockedBy ? (
        <ExpedienteSectionLockBanner lockedBy={lockedBy} />
      ) : show ? (
        <div className="shared-tool-readonly-banner" role="status">
          {t("network.sharedReadOnlyHint")}
        </div>
      ) : null}
    </>
  );
}
