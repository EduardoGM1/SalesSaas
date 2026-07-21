import { AlertTriangle, Info, Siren } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";

const ICONS = {
  critical: Siren,
  warning: AlertTriangle,
  info: Info,
};

export function TeamAlerts({ alerts = [] }) {
  const { t } = useI18n();

  if (!alerts.length) {
    return <div className="admin-empty">{t("team.exec.alertsEmpty")}</div>;
  }

  return (
    <ul className="team-alerts">
      {alerts.map((a) => {
        const Icon = ICONS[a.severity] || Info;
        return (
          <li key={a.code} className={`team-alert team-alert--${a.severity || "info"}`}>
            <Icon size={16} aria-hidden />
            <div>
              <div className="team-alert-msg">{a.message}</div>
              {a.value != null ? (
                <div className="team-alert-val">{t("team.exec.alertValue", { n: a.value })}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
