import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const enriched = JSON.parse(readFileSync(resolve(root, "docs/_audit-vendedor-profiles-enriched.json"), "utf8"));
const audit = JSON.parse(readFileSync(resolve(root, "docs/_audit-vendedor-liner-raw.json"), "utf8"));

const lines = [];
lines.push("# Migración Vendedor → Liner — respaldo y registro");
lines.push("");
lines.push(`**Fecha snapshot:** ${audit.generated_at}`);
lines.push("**Decisión:** eliminar rol Vendedor; migrar usuarios a Liner (nunca a Cerrador). Soporte sin cambios.");
lines.push("");
lines.push("## Hallazgo de permisos (antes de migrar)");
lines.push("");
lines.push("| Ámbito | Comparación | Mitigación |");
lines.push("|---|---|---|");
lines.push("| Plataforma Vendedor | No existía Liner de plataforma | Se **renombra** el rol sistema `a0000000-0000-4000-8000-000000000003` de Vendedor→Liner **conservando UUID, permisos y flag_reglas** (survey, proyección, worksheet, analysis). Los perfiles no pierden módulos. |");
lines.push("| Tenant (saletse test / Empresa QA) | Liner carece de flags `analysis` y `worksheet` vs paquete operacion-base de Vendedor | **0** usuarios en `workspace_miembros`/`empresa_miembros` con `role_id` de Vendedor-tenant. Sin pérdida actual. Nuevas altas default usan Liner (Survey+Proyección). |");
lines.push("");
lines.push("## Roles Vendedor en catálogo (pre-migración)");
lines.push("");
lines.push("| id | capa | empresa |");
lines.push("|---|---|---|");
for (const r of audit.vendedor_roles) {
  lines.push(`| \`${r.id}\` | ${r.empresa_id ? "tenant" : "plataforma"} | ${r.empresas?.nombre || "—"} |`);
}
lines.push("");
lines.push("## Usuarios con `profiles.role_id` = Vendedor (plataforma)");
lines.push("");
lines.push("| id | nombre | correo | workspaces |");
lines.push("|---|---|---|---|");
for (const p of enriched) {
  const ws = (p.memberships || [])
    .map((m) => `${m.tipo || "?"}:${m.sala || ""}${m.empresa ? ` / ${m.empresa}` : ""}`)
    .join("; ") || "—";
  lines.push(`| \`${p.id}\` | ${p.full_name || ""} | ${p.email || ""} | ${ws} |`);
}
lines.push("");
lines.push(`**Total perfiles:** ${enriched.length}`);
lines.push("");
lines.push("## Membresías tenant con `role_id` Vendedor");
lines.push("");
lines.push("- workspace_miembros: **0**");
lines.push("- empresa_miembros: **0**");
lines.push("");
lines.push("## Soporte (verificación pre — no tocar)");
lines.push("");
lines.push("```json");
lines.push(JSON.stringify(audit.soporte_roles, null, 2));
lines.push("```");
lines.push("");
lines.push(`profiles con Soporte: ${audit.soporte_profiles_count}`);
lines.push("");
lines.push("## Nota sobre `rol_en_workspace = vendedor`");
lines.push("");
lines.push("El enum `workspace_rol` solo admite `gerente|vendedor` (legacy). Ese valor **no** es el catálogo de roles; permanece como “no-gerente” en BD. La UI debe mostrar `roles.nombre` (Liner/Cerrador/…).");
lines.push("");
lines.push("## Reversión");
lines.push("");
lines.push("1. Renombrar rol plataforma `liner` → `vendedor` (mismo UUID `a0000000-0000-4000-8000-000000000003`).");
lines.push("2. Recrear roles tenant `slug=vendedor` por empresa desde seed o backup JSON.");
lines.push("3. Restaurar `profiles.role_id` desde `migracion_vendedor_liner_backup` / esta tabla.");
lines.push("");
lines.push("---");
lines.push("*El resultado post-ejecución se añade al final por el script de migración.*");

writeFileSync(resolve(root, "docs/migracion-vendedor-liner.md"), lines.join("\n"), "utf8");
console.log("OK", enriched.length);
