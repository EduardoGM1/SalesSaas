import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { UpgradeComingSoonModal } from "@/components/premium/upgrade-coming-soon-modal.jsx";
import { useI18n } from "@/hooks/use-i18n.js";

/**
 * Tarjeta anidada de función premium (reutilizable).
 * - loading: estado neutro (sin candado), no navega ni abre upgrade
 * - locked (confirmado): modal Próximamente
 * - unlocked: navega a `to` o llama `onOpen`
 */
export function PremiumFeatureCard({
  featureKey,
  title,
  description,
  icon: Icon,
  tone = "green",
  /** Ruta explícita (preferida). */
  to,
  onOpen,
  onBeforeOpen,
}) {
  const { t } = useI18n();
  const { locked, loading, feature } = useFeatureAccess(featureKey);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const name = title || feature?.nombre_visible || featureKey;

  const className = [
    "tool-card",
    "premium-feature-card",
    loading ? "is-loading" : "",
    locked ? "is-locked" : "",
  ].filter(Boolean).join(" ");

  const inner = (
    <>
      <div className={`tool-icon ${tone}`}>
        {Icon ? <Icon size={18} /> : null}
      </div>
      <div className="premium-feature-copy">
        <div className="tool-name premium-feature-name">
          <span>{name}</span>
          <span className="premium-pro-badge">{t("premium.badge")}</span>
          {locked && !loading && <Lock size={14} className="premium-lock-icon" aria-hidden />}
        </div>
        <div className="tool-desc">{description}</div>
      </div>
      <div className="premium-feature-chevron" aria-hidden>›</div>
    </>
  );

  const openFeature = (e) => {
    if (loading) {
      e?.preventDefault?.();
      return;
    }
    if (locked) {
      e?.preventDefault?.();
      setUpgradeOpen(true);
      return;
    }
    onBeforeOpen?.();
    if (!to) onOpen?.();
  };

  return (
    <>
      <div className="premium-feature-nest">
        <div className="premium-feature-connector" aria-hidden />
        {to && !locked && !loading ? (
          <Link
            to={to}
            className={className}
            onClick={() => onBeforeOpen?.()}
          >
            {inner}
          </Link>
        ) : (
          <button type="button" className={className} onClick={openFeature} disabled={loading}>
            {inner}
          </button>
        )}
      </div>
      <UpgradeComingSoonModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={name}
      />
    </>
  );
}
