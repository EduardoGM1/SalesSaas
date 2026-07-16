import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign, FileText, Palmtree, Wallet } from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { PageBack } from "@/components/layout/page-back.jsx";
import { NewClientModal } from "@/components/clients/new-client-modal.jsx";
import { PremiumFeatureCard } from "@/components/premium/premium-feature-card.jsx";
import { useAppStore } from "@/stores/app-store.js";
import { useI18n } from "@/hooks/use-i18n.js";

export function ToolsHubPage() {
  const navigate = useNavigate();
  const setToolMode = useAppStore((s) => s.setToolMode);
  const { t } = useI18n();
  const [newClientOpen, setNewClientOpen] = useState(false);

  const TOOLS = [
    { href: "/tools/survey", labelKey: "tools.survey", descKey: "tools.surveyDesc", icon: FileText, tone: "blue" },
    { href: "/tools/vacaciones", labelKey: "tools.vacation", descKey: "tools.vacationDesc", icon: Palmtree, tone: "green" },
    { href: "/tools/worksheet", labelKey: "tools.worksheet", descKey: "tools.worksheetDesc", icon: DollarSign, tone: "purple", nestMoneyBox: true },
  ];

  return (
    <>
      <Topbar title={t("page.tools.title")} subtitle={t("page.tools.subtitle")} />
      <div className="sales-page tools-hub-page">
        <div className="page-toolbar">
          <PageBack inline />
        </div>
        <div className="exp-tool-list tools-hub-list">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <div key={tool.href} className="tool-card-stack">
                <Link to={tool.href} className="tool-card" onClick={() => setToolMode("libre", null)}>
                  <div className={`tool-icon ${tool.tone}`}><Icon size={20} /></div>
                  <div>
                    <div className="tool-name">{t(tool.labelKey)}</div>
                    <div className="tool-desc">{t(tool.descKey)}</div>
                  </div>
                  <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>›</div>
                </Link>
                {tool.nestMoneyBox && (
                  <PremiumFeatureCard
                    featureKey="money_box"
                    title={t("moneyBox.title")}
                    description={t("moneyBox.cardDesc")}
                    icon={Wallet}
                    tone="green"
                    onOpen={() => {
                      setToolMode("libre", null);
                      navigate("/tools/money-box");
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="tools-hub-cta">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewClientOpen(true)}>
            {t("clients.new")}
          </button>
        </div>
      </div>
      <NewClientModal
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        adoptLibreTools
        onCreated={(client) => navigate(`/clients/${client.id}`)}
      />
    </>
  );
}
