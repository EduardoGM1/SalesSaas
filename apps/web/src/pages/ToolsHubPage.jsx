import { Link } from "react-router-dom";
import { DollarSign, FileText, Palmtree } from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useAppStore } from "@/stores/app-store.js";

const TOOLS = [
  { href: "/tools/survey", label: "Survey", desc: "Viaje actual, últimas vacaciones y viajes futuros", icon: FileText, tone: "blue" },
  { href: "/tools/vacaciones", label: "Proyección de Vacaciones", desc: "Costo futuro con inflación", icon: Palmtree, tone: "green" },
  { href: "/tools/worksheet", label: "Worksheet", desc: "Enganche y financiamiento", icon: DollarSign, tone: "purple" },
];

export function ToolsHubPage() {
  const setToolMode = useAppStore((s) => s.setToolMode);
  return (
    <>
      <Topbar title="Herramientas" subtitle="Calculadoras libres" />
      <div className="sales-page">
        <PageBack href="/" label="Volver" />
        <div className="exp-tool-list" style={{ marginTop: 16 }}>
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Link key={t.href} to={t.href} className="tool-card" onClick={() => setToolMode("libre", null)}>
                <div className={`tool-icon ${t.tone}`}><Icon size={20} /></div>
                <div>
                  <div className="tool-name">{t.label}</div>
                  <div className="tool-desc">{t.desc}</div>
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
