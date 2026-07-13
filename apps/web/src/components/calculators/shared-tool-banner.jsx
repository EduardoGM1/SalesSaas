import { useI18n } from "@/hooks/use-i18n.js";
import { ExpedientePresenceBar } from "@/components/clients/expediente-presence-bar.jsx";

/** Presencia + aviso de solo lectura por permiso (sin banner de “también está en el apartado”). */
export function SharedToolBanner({ show, peers }) {
  const { t } = useI18n();
  return (
    <>
      <ExpedientePresenceBar peers={peers || []} />
      {show ? (
        <div className="shared-tool-readonly-banner" role="status">
          {t("network.sharedReadOnlyHint")}
        </div>
      ) : null}
    </>
  );
}
