import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";

function formatWhen(iso, lang) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-US" : "es-MX", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

export function TeamActivityFeed({ activity = [] }) {
  const { t, lang } = useI18n();

  if (!activity.length) {
    return <div className="admin-empty">{t("team.exec.activityEmpty")}</div>;
  }

  return (
    <ul className="team-activity">
      {activity.map((ev, idx) => (
        <li key={`${ev.user_id}-${ev.at}-${idx}`} className="team-activity-item">
          <div className="team-activity-time">{formatWhen(ev.at, lang)}</div>
          <div className="team-activity-body">
            <strong>{ev.user_name}</strong>
            {" — "}
            {ev.href ? <Link to={ev.href}>{ev.text}</Link> : ev.text}
          </div>
        </li>
      ))}
    </ul>
  );
}
