import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      const index = value.indexOf("=");
      if (index < 0) continue;
      const key = value.slice(0, index).trim();
      let content = value.slice(index + 1).trim();
      if (/^(['"]).*\1$/.test(content)) content = content.slice(1, -1);
      if (!process.env[key]) process.env[key] = content;
    }
  } catch {
    // .env.local es opcional en CI.
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL/VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [
    { data: memberships, error: membershipsError },
    { data: companyMemberships, error: companyError },
    { data: roles, error: rolesError },
    { data: workflows, error: workflowError },
    { data: events, error: eventsError },
  ] = await Promise.all([
    db.from("workspace_miembros").select("workspace_id, usuario_id, role_id, workspaces(empresa_id), roles(empresa_id, scope)"),
    db.from("empresa_miembros").select("empresa_id, usuario_id, role_id, roles(empresa_id, scope)"),
    db.from("roles").select("id, empresa_id, scope, paquete_id, paquetes_acceso(empresa_id)"),
    db.from("prospect_workflows").select("prospect_id, workspace_id, etapa_actual, representante_id, prospects(workspace_id)"),
    db.from("prospect_workflow_events").select("id").limit(1),
  ]);
  for (const error of [membershipsError, companyError, rolesError, workflowError, eventsError]) {
    if (error) throw error;
  }

  for (const row of memberships ?? []) {
    if (!row.role_id) continue;
    assert(row.roles?.scope === "workspace", `Puesto no-workspace en membresía ${row.workspace_id}`);
    assert(row.roles?.empresa_id === row.workspaces?.empresa_id, `Puesto cross-tenant en sala ${row.workspace_id}`);
  }
  for (const row of companyMemberships ?? []) {
    if (!row.role_id) continue;
    assert(row.roles?.scope === "empresa", `Rol no-empresa en empresa ${row.empresa_id}`);
    assert(row.roles?.empresa_id === row.empresa_id, `Rol cross-tenant en empresa ${row.empresa_id}`);
  }
  for (const role of roles ?? []) {
    if (!role.paquete_id) continue;
    assert(role.empresa_id === role.paquetes_acceso?.empresa_id, `Paquete cross-tenant en rol ${role.id}`);
  }
  for (const workflow of workflows ?? []) {
    assert(workflow.workspace_id === workflow.prospects?.workspace_id, `Workflow fuera del workspace del expediente ${workflow.prospect_id}`);
  }

  for (const membership of (memberships ?? []).filter((row) => row.role_id).slice(0, 10)) {
    const { data, error } = await db.rpc("effective_workspace_permissions", {
      p_usuario_id: membership.usuario_id,
      p_workspace_id: membership.workspace_id,
    });
    if (error) throw error;
    assert(Array.isArray(data), `Resolver contextual inválido para ${membership.usuario_id}`);
  }

  if (workflows?.[0]) {
    const workflow = workflows[0];
    const { error } = await db.rpc("transition_prospect_workflow", {
      p_prospect_id: workflow.prospect_id,
      p_actor_id: workflow.representante_id,
      p_expected_stage: "__etapa_invalida__",
      p_next_stage: "survey",
      p_event_type: "verification_should_fail",
      p_actor_role: "test",
      p_metadata: {},
    });
    assert(Boolean(error), "Se aceptó una transición con etapa origen inválida.");
  }

  if (events?.[0]?.id) {
    const { error } = await db
      .from("prospect_workflow_events")
      .update({ metadata: { verification_should_fail: true } })
      .eq("id", events[0].id);
    assert(Boolean(error), "El historial permite UPDATE; se esperaba inmutabilidad.");
  }

  console.log("OK aislamiento membresías:", memberships?.length ?? 0);
  console.log("OK aislamiento administradores:", companyMemberships?.length ?? 0);
  console.log("OK roles/paquetes:", roles?.length ?? 0);
  console.log("OK workflows:", workflows?.length ?? 0);
  console.log("OK matriz de permisos:", Math.min(memberships?.length ?? 0, 10));
  console.log("OK transición inválida:", workflows?.length ? "rechazada" : "sin workflows aún");
  console.log("OK eventos append-only:", events?.length ? "validado" : "sin eventos aún");
}

main().catch((error) => {
  console.error("ERROR validación tenant/workflow:", error.message || error);
  process.exit(1);
});
