import { Link } from "react-router-dom";
import { DollarSign, FileText, Palmtree } from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useAppStore } from "@/stores/app-store.js";
import { useI18n } from "@/hooks/use-i18n.js";

export function ToolsHubPage() {
  const setToolMode = useAppStore((s) => s.setToolMode);
  const { t } = useI18n();

  const TOOLS = [
    { href: "/tools/survey", labelKey: "tools.survey", descKey: "tools.surveyDesc", icon: FileText, tone: "blue" },
    { href: "/tools/vacaciones", labelKey: "tools.vacation", descKey: "tools.vacationDesc", icon: Palmtree, tone: "green" },
    { href: "/tools/worksheet", labelKey: "tools.worksheet", descKey: "tools.worksheetDesc", icon: DollarSign, tone: "purple" },
  ];

  return (
    <>
      <Topbar title={t("page.tools.title")} subtitle={t("page.tools.subtitle")} />
      <div className="sales-page">
        <PageBack />
        <div className="exp-tool-list" style={{ marginTop: 16 }}>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href} to={tool.href} className="tool-card" onClick={() => setToolMode("libre", null)}>
                <div className={`tool-icon ${tool.tone}`}><Icon size={20} /></div>
                <div>
                  <div className="tool-name">{t(tool.labelKey)}</div>
                  <div className="tool-desc">{t(tool.descKey)}</div>
                </div>
                <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>›</div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
