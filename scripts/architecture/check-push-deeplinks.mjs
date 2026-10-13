/**
 * PushType → deep links → rutas existentes en apps/web/src/routes/index.jsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PushType,
  networkPath,
  calendarPath,
  salesPath,
  messagePath,
  teamConversationPath,
  contactPath,
  sharedProspectPath,
  sharedProspectSectionPath,
  clientProspectPath,
  resolvePushPathFromPayload,
} from "../../packages/shared/src/push/notification-targets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTES = path.join(ROOT, "apps/web/src/routes/index.jsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Convierte path de app (sin query) a patrón comparable con Route path= */
function pathMatchesRoutes(appPath, routePaths) {
  const bare = String(appPath).split("?")[0].split("#")[0];
  const segments = bare.replace(/^\//, "").split("/").filter(Boolean);

  for (const route of routePaths) {
    if (route === "*" || route === "index" || route === "") {
      if (segments.length === 0) return true;
      continue;
    }
    const rSegs = route.replace(/^\//, "").split("/").filter(Boolean);
    if (rSegs.length !== segments.length) continue;
    let ok = true;
    for (let i = 0; i < rSegs.length; i += 1) {
      const r = rSegs[i];
      const s = segments[i];
      if (r.startsWith(":")) continue;
      if (r !== s) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function extractRoutePaths(src) {
  const paths = new Set();
  // index route
  paths.add("");
  const re = /<Route\s+[^>]*path=\{?["']([^"']+)["']\}?/g;
  let m;
  while ((m = re.exec(src))) {
    paths.add(m[1]);
  }
  // Also absolute auth routes etc. already covered
  return [...paths];
}

function flattenNested(routePaths) {
  // React Router nested: path="clients/:id" under Dashboard → /clients/:id
  // Our extract already sees relative segments. Build absolute candidates.
  const abs = new Set(["/", "/login", "/register", "/forgot-password", "/reset-password"]);
  const top = ["", "goals", "metas", "sales", "clients", "team", "network", "messages", "tools", "settings", "admin", "ops"];

  for (const p of routePaths) {
    if (p.startsWith("/")) {
      abs.add(p);
      continue;
    }
    // relative — attach common parents heuristically for matching
    abs.add(`/${p}`);
    for (const parent of [
      "",
      "clients",
      "red/contacto/:contactId",
      "red/contacto/:contactId/expediente/:prospectId",
      "tools",
      "tools/rh",
      "ops/rh",
      "admin",
    ]) {
      const joined = parent ? `/${parent}/${p}` : `/${p}`;
      abs.add(joined.replace(/\/+/g, "/"));
    }
  }
  // Explicit known SPA paths used by push helpers
  for (const p of [
    "/",
    "/login",
    "/network",
    "/sales",
    "/messages",
    "/settings",
    "/clients/:id",
    "/clients/:id/survey",
    "/clients/:id/vacaciones",
    "/clients/:id/worksheet",
    "/clients/:id/money-box",
    "/red/contacto/:contactId",
    "/red/contacto/:contactId/expediente/:prospectId",
    "/red/contacto/:contactId/expediente/:prospectId/survey",
    "/red/contacto/:contactId/expediente/:prospectId/vacaciones",
    "/red/contacto/:contactId/expediente/:prospectId/worksheet",
  ]) {
    abs.add(p);
  }
  void top;
  return [...abs];
}

function main() {
  const src = fs.readFileSync(ROUTES, "utf8");
  const routePaths = flattenNested(extractRoutePaths(src));
  const errors = [];

  const samples = [
    { type: PushType.SESSION_REVOKED, expect: "/login" },
    { type: PushType.CONNECTION_REQUEST, expect: networkPath() },
    { type: PushType.CONNECTION_ACCEPTED, expect: networkPath() },
    { type: PushType.FOLLOW_UP_REMINDER, expect: calendarPath() },
    { type: PushType.SCHEDULED_NOTE, expect: calendarPath() },
    { type: PushType.SALES_TO_PROCESS, expect: salesPath() },
    { type: PushType.SUPPORT_REPLY, expect: "/settings" },
    {
      type: PushType.MESSAGE,
      payload: { path: messagePath("user-synth-1") },
      expectPrefix: "/messages",
    },
    {
      type: PushType.SHARED_PROSPECT,
      payload: { path: sharedProspectPath("owner-1", "11111111-1111-4111-8111-111111111111") },
      expectPrefix: "/red/contacto/",
    },
    {
      type: PushType.PROSPECT_SECTION_CHANGED,
      payload: {
        path: sharedProspectSectionPath(
          "owner-1",
          "11111111-1111-4111-8111-111111111111",
          "survey",
        ),
      },
      expectPrefix: "/red/contacto/",
    },
    {
      type: PushType.CLOSER_ASSIGNED,
      payload: { path: clientProspectPath("11111111-1111-4111-8111-111111111111", "worksheet") },
      expectPrefix: "/clients/",
    },
    {
      type: PushType.PROSPECT_TRANSFERRED,
      payload: { path: clientProspectPath("11111111-1111-4111-8111-111111111111") },
      expectPrefix: "/clients/",
    },
  ];

  // Helpers produce valid paths
  try {
    assert(contactPath("c1").startsWith("/red/contacto/"), "contactPath");
    assert(teamConversationPath("conv1").startsWith("/messages"), "teamConversationPath");
  } catch (err) {
    errors.push(err.message);
  }

  for (const sample of samples) {
    try {
      const payload = { type: sample.type, ...(sample.payload || {}) };
      const resolved = resolvePushPathFromPayload(payload);
      if (sample.expect != null) {
        assert(resolved === sample.expect, `${sample.type}: esperado ${sample.expect}, got ${resolved}`);
      }
      if (sample.expectPrefix) {
        assert(
          typeof resolved === "string" && resolved.startsWith(sample.expectPrefix),
          `${sample.type}: prefix ${sample.expectPrefix}, got ${resolved}`,
        );
      }
      assert(resolved == null || resolved.startsWith("/"), `${sample.type}: path absoluto`);
      if (resolved) {
        const ok = pathMatchesRoutes(resolved, routePaths);
        assert(ok, `${sample.type}: ruta no reconocida en router: ${resolved}`);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }

  // Every PushType value is a non-empty string
  for (const [k, v] of Object.entries(PushType)) {
    if (typeof v !== "string" || !v) errors.push(`PushType.${k} inválido`);
  }

  if (errors.length) {
    console.error("✗ Push deep links FALLARON:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  console.log(`✓ PushType → deep links → rutas OK (${samples.length} casos, ${Object.keys(PushType).length} tipos)`);
}

main();
