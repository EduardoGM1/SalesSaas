import { Eye } from "lucide-react";
import { NetworkUserAvatar } from "@/components/network/network-user-avatar.jsx";
import { useI18n } from "@/hooks/use-i18n.js";

const SECTION_KEYS = {
  detail: "collab.section.detail",
  survey: "collab.section.survey",
  vacaciones: "collab.section.vacaciones",
  worksheet: "collab.section.worksheet",
};

/**
 * Ojo gris/verde + avatares. El nombre se muestra solo al hover del avatar.
 */
export function ExpedientePresenceBar({ peers = [], className = "" }) {
  const { t } = useI18n();
  const hasOthers = peers.length > 0;

  return (
    <div
      className={`exp-presence-bar ${hasOthers ? "is-active" : ""} ${className}`.trim()}
      aria-label={t("collab.viewing")}
    >
      <span
        className={`exp-presence-eye${hasOthers ? " is-active" : ""}`}
        title={hasOthers ? t("collab.viewingActive") : t("collab.viewingAlone")}
        aria-hidden="true"
      >
        <Eye size={18} strokeWidth={2.25} />
      </span>
      {hasOthers && (
        <div className="exp-presence-avatars">
          {peers.map((peer) => {
            const sectionKey = SECTION_KEYS[peer.section] || SECTION_KEYS.detail;
            const editing = peer.state === "editing";
            const tip = `${peer.name} · ${t(sectionKey)}${editing ? ` (${t("collab.editing")})` : ""}`;
            return (
              <div
                key={peer.user_id}
                className={`exp-presence-peer${editing ? " is-editing" : ""}`}
                tabIndex={0}
                aria-label={tip}
              >
                <NetworkUserAvatar
                  user={{ id: peer.user_id, full_name: peer.name, avatar_url: peer.avatar_url }}
                  label={peer.name}
                  size="md"
                />
                {editing && <span className="exp-presence-edit-dot" aria-hidden="true" />}
                <span className="exp-presence-tooltip" role="tooltip">
                  {tip}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
