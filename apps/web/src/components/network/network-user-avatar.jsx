import { useContactPresence } from "@/components/providers/presence-provider.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { formatLastSeen } from "@/lib/presence/format-last-seen.js";

function displayName(user, fallback = "Usuario") {
  return user?.full_name?.trim() || user?.email?.split("@")[0] || fallback;
}

export function NetworkUserAvatar({ user, label, size = "md", showPresence = false }) {
  const text = (label || displayName(user)).slice(0, 2).toUpperCase();
  const sizeClass = size === "lg" ? "network-avatar-lg" : "";
  return (
    <div className={`network-avatar-wrap ${sizeClass}`.trim()}>
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt="" className={`network-avatar-img ${sizeClass}`.trim()} />
      ) : (
        <div className={`network-avatar ${sizeClass}`.trim()}>{text}</div>
      )}
      {showPresence && user?.id && <PresenceDot userId={user.id} />}
    </div>
  );
}

export function PresenceDot({ userId }) {
  const { online } = useContactPresence(userId);
  return (
    <span
      className={`presence-dot${online ? " presence-dot--online" : ""}`}
      aria-hidden="true"
    />
  );
}

export function ContactPresenceStatus({ userId, className = "" }) {
  const { t, lang } = useI18n();
  const { online, lastSeen } = useContactPresence(userId);

  if (!userId) return null;

  if (online) {
    return (
      <p className={`contact-presence-status online ${className}`.trim()}>
        <span className="presence-dot presence-dot--online presence-dot--inline" aria-hidden="true" />
        {t("network.online")}
      </p>
    );
  }

  const seen = formatLastSeen(lastSeen, lang, t);
  return (
    <p className={`contact-presence-status offline ${className}`.trim()}>
      <span className="presence-dot presence-dot--inline" aria-hidden="true" />
      {seen || t("network.offline")}
    </p>
  );
}

export { displayName as networkDisplayName };
