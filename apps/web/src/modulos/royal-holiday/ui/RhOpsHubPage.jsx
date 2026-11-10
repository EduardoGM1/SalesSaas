import { Link } from "react-router-dom";
import {
  ClipboardList, Users, BarChart3, Target, CalendarDays, Coins, LayoutDashboard,
} from "lucide-react";
import { useFlags } from "@/hooks/use-flag.js";
import { RH_PREMANIFIESTO_READ_FLAGS, RH_TOOL_FLAGS } from "@/lib/auth/tool-flags.js";
import { RhToolShell } from "@/components/rh/rh-tool-shell.jsx";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";

const OPS = [
  {
    href: "/ops/rh/premanifiesto",
    label: "Premanifiesto",
    desc: "Shows del día",
    icon: ClipboardList,
    flag: RH_TOOL_FLAGS.premanifiesto,
    readFlags: RH_PREMANIFIESTO_READ_FLAGS,
  },
  { href: "/ops/rh/linea", label: "Línea", desc: "Asignación y rotación", icon: Users },
  { href: "/ops/rh/resumen", label: "Resumen", desc: "Día / semana / mes", icon: LayoutDashboard },
  { href: "/ops/rh/estadisticos", label: "Estadísticos sala", desc: "Reps y closers", icon: BarChart3 },
  { href: "/ops/rh/okr", label: "OKR de sala", desc: "Metas de sala (no alimenta Dashboard)", icon: Target },
  { href: "/ops/rh/calendario-descansos", label: "Calendario de descansos", desc: "Vista gerencial", icon: CalendarDays },
  { href: "/ops/rh/propinas", label: "Pago de propinas", desc: "Registro de propinas", icon: Coins },
];

export function RhOpsHubPage() {
  const { isEnabled, hasCatalog, ready, flagsStatus } = useFlags();

  if (flagsStatus === "unavailable") {
    return (
      <RhToolShell title="Administrativo operaciones" subtitle="Royal Holiday">
        <PermissionsUnavailableNotice variant="panel" kind="flags" />
      </RhToolShell>
    );
  }

  const visibleOps = OPS.filter((item) => {
    if (!item.readFlags) return true;
    if (!ready || !hasCatalog) return true;
    return item.readFlags.some((f) => isEnabled(f) === true);
  });

  return (
    <RhToolShell title="Administrativo operaciones" subtitle="Royal Holiday">
      <p className="muted">Módulos operativos de sala. Datos configurables en Admin → Catálogo RH.</p>
      <div className="rh-ops-hub-grid" style={{ marginTop: 12 }}>
        {visibleOps.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} to={item.href} className="tool-card">
              <div className="tool-icon blue"><Icon size={20} /></div>
              <div>
                <div className="tool-name">{item.label}</div>
                <div className="tool-desc">{item.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </RhToolShell>
  );
}
