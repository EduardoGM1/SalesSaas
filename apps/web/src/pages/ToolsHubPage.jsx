import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DollarSign, FileText, Palmtree, Wallet, LineChart, Percent, CalendarDays,
  Coins, BedDouble, Briefcase,
} from "lucide-react";
import { Topbar } from "@/components/layout/topbar.jsx";
import { PageBack } from "@/components/layout/page-back.jsx";
import { NewClientModal } from "@/components/clients/new-client-modal.jsx";
import { PremiumFeatureCard } from "@/components/premium/premium-feature-card.jsx";
import { useAppStore } from "@/stores/app-store.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useFlag, useFlags } from "@/hooks/use-flag.js";
import { TOOL_PERMISSION_KEYS } from "@/lib/auth/tool-permissions.js";
import { TOOL_FLAG_KEYS, WORKSHEET_ROYAL_HOLIDAY_FLAG, RH_TOOL_FLAGS } from "@/lib/auth/tool-flags.js";

function ToolLink({ href, label, desc, icon: Icon, tone, onClick }) {
  return (
    <Link to={href} className="tool-card" onClick={onClick}>
      <div className={`tool-icon ${tone}`}><Icon size={20} /></div>
      <div>
        <div className="tool-name">{label}</div>
        <div className="tool-desc">{desc}</div>
      </div>
      <div style={{ color: "var(--muted2)", marginLeft: "auto", fontSize: 18 }}>›</div>
    </Link>
  );
}

export function ToolsHubPage() {
  const navigate = useNavigate();
  const setToolMode = useAppStore((s) => s.setToolMode);
  const { t } = useI18n();
  const { can } = useUserPermissions();
  const { isEnabled, hasCatalog } = useFlags();
  const rhFlag = useFlag(WORKSHEET_ROYAL_HOLIDAY_FLAG);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const toolAllowed = (tool) => {
    const flagKey = TOOL_FLAG_KEYS[tool];
    if (hasCatalog && flagKey) return isEnabled(flagKey) === true;
    return can(TOOL_PERMISSION_KEYS[tool]);
  };

  const rhToolOn = (clave) => {
    if (!rhFlag.enabled) return false;
    const v = isEnabled(clave);
    // Si el flag hijo aún no está en sesión, mostrar cuando RH está activo
    if (v === null || v === undefined) return true;
    return v === true;
  };

  const TOOLS = [
    { href: "/tools/survey", tool: "survey", labelKey: "tools.survey", descKey: "tools.surveyDesc", icon: FileText, tone: "blue" },
    { href: "/tools/vacaciones", tool: "vacaciones", labelKey: "tools.vacation", descKey: "tools.vacationDesc", icon: Palmtree, tone: "green" },
    { href: "/tools/worksheet", tool: "worksheet", labelKey: "tools.worksheet", descKey: "tools.worksheetDesc", icon: DollarSign, tone: "purple" },
  ].filter((tool) => toolAllowed(tool.tool));

  const RH_TOOLS = [
    { href: "/tools/worksheet", label: "Worksheet", desc: "Datos venta y financiamiento", icon: DollarSign, tone: "purple", flag: null },
    { href: "/tools/rh/bottom-lines", label: "Calculadora B. Lines", desc: "Board online y M.Fee", icon: LineChart, tone: "blue", flag: RH_TOOL_FLAGS.bottom_lines },
    { href: "/tools/rh/comisiones", label: "Calculadora Comisiones", desc: "% y fecha de pago", icon: Percent, tone: "green", flag: RH_TOOL_FLAGS.comisiones },
    { href: "/tools/rh/calendario-comisiones", label: "Calendario comisiones", desc: "Pagos programados", icon: CalendarDays, tone: "blue", flag: RH_TOOL_FLAGS.calendario_comisiones },
    { href: "/tools/rh/creditos", label: "Calculadora de Créditos", desc: "Explorar HC y programas", icon: Coins, tone: "purple", flag: RH_TOOL_FLAGS.creditos },
    { href: "/tools/rh/dias-descanso", label: "Días de descanso", desc: "Registrar descansos", icon: BedDouble, tone: "green", flag: RH_TOOL_FLAGS.dias_descanso },
  ].filter((tool) => !tool.flag || rhToolOn(tool.flag));

  const showOps = rhFlag.enabled && rhToolOn(RH_TOOL_FLAGS.ops);

  return (
    <>
      <Topbar title={t("page.tools.title")} subtitle={t("page.tools.subtitle")} />
      <div className="sales-page tools-hub-page">
        <div className="page-toolbar">
          <PageBack inline />
        </div>

        {rhFlag.enabled && (
          <div className="rh-tools-section">
            <div className="rh-tools-section-title">Herramientas (Gerente, Closer, Reps)</div>
            <div className="exp-tool-list tools-hub-list">
              {RH_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div key={tool.href} className="tool-card-stack">
                    <ToolLink
                      href={tool.href}
                      label={tool.label}
                      desc={tool.desc}
                      icon={Icon}
                      tone={tool.tone}
                      onClick={() => setToolMode("libre", null)}
                    />
                  </div>
                );
              })}
            </div>
            {showOps && (
              <>
                <div className="rh-tools-section-title">Administrativo operaciones</div>
                <div className="exp-tool-list tools-hub-list">
                  <div className="tool-card-stack">
                    <ToolLink
                      href="/ops/rh"
                      label="Operaciones sala"
                      desc="Premanifiesto, línea, resumen, OKR…"
                      icon={Briefcase}
                      tone="blue"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {(!rhFlag.enabled || TOOLS.some((t) => t.tool !== "worksheet")) && (
          <>
            {rhFlag.enabled && <div className="rh-tools-section-title">Otras herramientas</div>}
            <div className="exp-tool-list tools-hub-list">
              {TOOLS.filter((tool) => !rhFlag.enabled || tool.tool !== "worksheet").map((tool) => {
                const Icon = tool.icon;
                return (
                  <div key={tool.href} className="tool-card-stack">
                    <ToolLink
                      href={tool.href}
                      label={t(tool.labelKey)}
                      desc={t(tool.descKey)}
                      icon={Icon}
                      tone={tool.tone}
                      onClick={() => setToolMode("libre", null)}
                    />
                    {tool.tool === "worksheet" && (
                      <PremiumFeatureCard
                        featureKey="money_box"
                        title={t("moneyBox.title")}
                        description={t("moneyBox.cardDesc")}
                        icon={Wallet}
                        tone="green"
                        to="/tools/money-box"
                        onBeforeOpen={() => setToolMode("libre", null)}
                      />
                    )}
                  </div>
                );
              })}
              {!TOOLS.some((tool) => tool.tool === "worksheet") && !rhFlag.enabled && (
                <div className="tool-card-stack">
                  <PremiumFeatureCard
                    featureKey="money_box"
                    title={t("moneyBox.title")}
                    description={t("moneyBox.cardDesc")}
                    icon={Wallet}
                    tone="green"
                    to="/tools/money-box"
                    onBeforeOpen={() => setToolMode("libre", null)}
                  />
                </div>
              )}
            </div>
          </>
        )}

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
