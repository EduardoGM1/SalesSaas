/**
 * Verifica multi-workspace 0052 + checklist ROL.
 * npm run verify:workspaces
 */
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const path = resolve(__dir, "../.env.local");
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* opcional */
  }
}

async function main() {
  loadEnvLocal();
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: wErr } = await sb.from("workspaces").select("id").limit(1);
  if (wErr) {
    console.error("✗ Tabla workspaces no disponible. Aplica migración 0052.");
    console.error(wErr.message);
    process.exit(2);
  }

  const { count: profiles } = await sb.from("profiles").select("id", { count: "exact", head: true });
  const { count: personals } = await sb
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "personal");

  console.log(`Profiles: ${profiles} · workspaces personal: ${personals}`);
  if ((personals ?? 0) < (profiles ?? 0)) {
    console.warn("⚠ Algunos perfiles podrían no tener workspace personal (revisa backfill).");
  } else {
    console.log("✓ Cada perfil tiene al menos cobertura de workspace personal (conteo).");
  }

  const { count: nullWs } = await sb
    .from("prospects")
    .select("id", { count: "exact", head: true })
    .is("workspace_id", null);
  if (nullWs) {
    console.error(`✗ ${nullWs} prospects sin workspace_id`);
    process.exit(3);
  }
  console.log("✓ prospects.workspace_id poblado");

  // Frontera: personal vs sala debe fallar
  const { data: personal } = await sb.from("workspaces").select("id").eq("tipo", "personal").limit(1).maybeSingle();
  const { data: sala } = await sb.from("workspaces").select("id").eq("tipo", "sala_de_venta").limit(1).maybeSingle();
  if (personal && sala) {
    const { data: ok } = await sb.rpc("workspace_boundary_ok", {
      p_src: personal.id,
      p_dst: sala.id,
    });
    if (ok === true) {
      console.error("✗ workspace_boundary_ok permitió personal↔sala");
      process.exit(4);
    }
    console.log("✓ Frontera personal↔sala rechazada");
  } else {
    console.log("· Sin sala_de_venta de muestra; frontera personal↔sala no ejercitada");
  }

  const { data: sameOk } = personal
    ? await sb.rpc("workspace_boundary_ok", { p_src: personal.id, p_dst: personal.id })
    : { data: true };
  if (sameOk !== true) {
    console.error("✗ Mismo workspace debe ser ok");
    process.exit(5);
  }
  console.log("✓ Mismo workspace permitido");

  console.log(`
── Checklist manual (UI / ROL) ───────────────────────────────
[ ] Vendedor con personal + sala → 2 íconos en rail; cada vista solo datos de ese WS
[ ] Compartir / pin personal → sala → mensaje: No puedes mover información entre tu espacio personal y el de la empresa
[ ] Gerente sala A no ve expedientes de sala B (misma empresa)
[ ] White-label sala: logo/colores al entrar; personal = Saletse
[ ] Salir de sala: pierde acceso a ese WS; personal intacto
[ ] POST /api/v1/auth/workspace cambia workspace_activo_id
──────────────────────────────────────────────────────────────
`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
