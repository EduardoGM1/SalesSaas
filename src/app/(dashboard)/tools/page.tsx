"use client";

import Link from "next/link";
import { FileText, Palmtree, DollarSign } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { useAppStore } from "@/stores/app-store";

const TOOLS = [
  { href: "/tools/survey", label: "Survey", desc: "Viaje actual, últimas vacaciones y viajes futuros", icon: FileText, tone: "blue" as const },
  { href: "/tools/vacaciones", label: "Proyección de Vacaciones", desc: "Costo futuro con inflación", icon: Palmtree, tone: "green" as const },
  { href: "/tools/worksheet", label: "Worksheet", desc: "Enganche y financiamiento", icon: DollarSign, tone: "purple" as const },
];

export default function ToolsPage() {
  const setToolMode = useAppStore((s) => s.setToolMode);

  return (
    <>
      <Topbar title="Herramientas" subtitle="Calculadoras libres" />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">Herramientas</div>
            <div className="page-sub">Calculadoras libres para preparar propuestas y análisis</div>
          </div>
        </div>
        <div className="card">
          <div className="card-heading">Herramientas libres</div>
          <div className="card-sub">Usa estas calculadoras fuera de un expediente. Si decides guardar, la app te pedirá crear o vincular un prospecto.</div>
          <div className="exp-tool-list">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.href} href={t.href} className="tool-card" onClick={() => setToolMode("libre", null)}>
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
      </div>
    </>
  );
}
