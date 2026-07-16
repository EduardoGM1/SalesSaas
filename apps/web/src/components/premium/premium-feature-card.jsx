import { useState } from "react";
import { Lock } from "lucide-react";
import { useFeatureAccess } from "@/hooks/use-feature-access.js";
import { UpgradeComingSoonModal } from "@/components/premium/upgrade-coming-soon-modal.jsx";
import { useI18n } from "@/hooks/use-i18n.js";

/**
 * Tarjeta anidada de función premium (reutilizable).
 * Locked → modal Próximamente; unlocked → onOpen.
 */
export function PremiumFeatureCard({
  featureKey,
  title,
  description,
  icon: Icon,
  tone = "green",
  onOpen,
}) {
  const { t } = useI18n();
  const { locked, feature } = useFeatureAccess(featureKey);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const name = title || feature?.nombre_visible || featureKey;

  const handleClick = () => {
    if (locked) {
      setUpgradeOpen(true);
      return;
    }
    onOpen?.();
  };

  return (
    <>
      <div className="premium-feature-nest">
        <div className="premium-feature-connector" aria-hidden />
        <button
          type="button"
          className={`tool-card premium-feature-card${locked ? " is-locked" : ""}`}
          onClick={handleClick}
        >
          <div className={`tool-icon ${tone}`}>
            {Icon ? <Icon size={18} /> : null}
          </div>
          <div className="premium-feature-copy">
            <div className="tool-name premium-feature-name">
              <span>{name}</span>
              <span className="premium-pro-badge">{t("premium.badge")}</span>
              {locked && <Lock size={14} className="premium-lock-icon" aria-hidden />}
            </div>
            <div className="tool-desc">{description}</div>
          </div>
          <div className="premium-feature-chevron" aria-hidden>›</div>
        </button>
      </div>
      <UpgradeComingSoonModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={name}
      />
    </>
  );
}
