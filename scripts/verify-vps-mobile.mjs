#!/usr/bin/env node
/**
 * Verificación API + PWA/móvil contra despliegue (VPS o local).
 * Uso: node scripts/verify-vps-mobile.mjs
 *      API_BASE=http://187.77.14.148 WEB_BASE=http://187.77.14.148 node scripts/verify-vps-mobile.mjs
 */
const API_BASE = (process.env.API_BASE ?? "http://187.77.14.148").replace(/\/$/, "");
const WEB_BASE = (process.env.WEB_BASE ?? API_BASE).replace(/\/$/, "");

/** @type {{ name: string; url: string; method?: string; body?: object; expect: number[]; check?: (res: Response, text: string) => string | null }} */
const checks = [
  // --- API core ---
  { name: "API health", url: `${API_BASE}/health`, expect: [200] },
  { name: "API health/supabase", url: `${API_BASE}/health/supabase`, expect: [200] },
  { name: "API v1 root", url: `${API_BASE}/api/v1`, expect: [200] },
  { name: "Geo countries", url: `${API_BASE}/api/v1/geo/countries`, expect: [200] },
  { name: "Profile sin auth", url: `${API_BASE}/api/v1/profile`, expect: [401, 503] },
  { name: "Sync sin auth", url: `${API_BASE}/api/v1/sync`, expect: [401, 503] },
  { name: "Realtime-session sin auth", url: `${API_BASE}/api/v1/auth/realtime-session`, expect: [401, 503] },
  { name: "Push config sin auth", url: `${API_BASE}/api/v1/notifications/config`, expect: [401, 503] },
  {
    name: "Login credenciales inválidas",
    url: `${API_BASE}/auth/login`,
    method: "POST",
    body: { email: "invalid@test.com", password: "wrongpass" },
    expect: [401, 503],
    check: (_r, text) => (text.includes("WebSocket") || text.includes("RealtimeClient") ? "error WebSocket en login" : null),
  },
  {
    name: "Auth signout (anon)",
    url: `${API_BASE}/auth/signout`,
    method: "POST",
    body: {},
    expect: [200],
  },

  // --- SPA / PWA ---
  { name: "SPA index", url: `${WEB_BASE}/`, expect: [200] },
  {
    name: "SPA mobile meta",
    url: `${WEB_BASE}/`,
    expect: [200],
    check: (_r, text) => {
      if (!text.includes("apple-mobile-web-app-capable")) return "falta meta apple-mobile-web-app-capable";
      if (!text.includes("mobile-web-app-capable")) return "falta meta mobile-web-app-capable";
      if (text.includes('host !== canonical')) return "redirect legacy a Vercel aún presente";
      return null;
    },
  },
  { name: "PWA manifest", url: `${WEB_BASE}/manifest.webmanifest`, expect: [200] },
  {
    name: "PWA manifest contenido",
    url: `${WEB_BASE}/manifest.webmanifest`,
    expect: [200],
    check: (_r, text) => {
      try {
        const m = JSON.parse(text);
        if (m.display !== "standalone") return `display=${m.display}, esperado standalone`;
        if (!m.icons?.length) return "manifest sin icons";
        return null;
      } catch {
        return "manifest no es JSON válido";
      }
    },
  },
  { name: "Service worker", url: `${WEB_BASE}/sw.js`, expect: [200] },
  { name: "Build id", url: `${WEB_BASE}/build-id.txt`, expect: [200] },
  { name: "Icon 192", url: `${WEB_BASE}/icon-192.png`, expect: [200] },
  { name: "Icon 512", url: `${WEB_BASE}/icon-512.png`, expect: [200] },
  { name: "Apple touch icon", url: `${WEB_BASE}/apple-touch-icon.png`, expect: [200] },
  { name: "Favicon", url: `${WEB_BASE}/favicon.ico`, expect: [200] },

  // --- OneSignal / push móvil ---
  { name: "OneSignal worker raíz", url: `${WEB_BASE}/OneSignalSDKWorker.js`, expect: [200] },
  { name: "OneSignal worker /onesignal/", url: `${WEB_BASE}/onesignal/OneSignalSDKWorker.js`, expect: [200] },
  { name: "OneSignal SW SDK", url: `${WEB_BASE}/onesignal/OneSignalSDK.sw.js`, expect: [200] },
  {
    name: "OneSignal worker Content-Type",
    url: `${WEB_BASE}/onesignal/OneSignalSDKWorker.js`,
    expect: [200],
    check: (res) => {
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("javascript") && !ct.includes("ecmascript")) {
        return `Content-Type inesperado: ${ct || "(vacío)"}`;
      }
      return null;
    },
  },

  // --- Rutas SPA móvil ---
  { name: "Ruta /login SPA", url: `${WEB_BASE}/login`, expect: [200] },
  { name: "Ruta /auth/callback SPA", url: `${WEB_BASE}/auth/callback`, expect: [200] },
  { name: "Ruta /reset-password SPA", url: `${WEB_BASE}/reset-password`, expect: [200] },
];

async function runOne(c) {
  const res = await fetch(c.url, {
    method: c.method ?? "GET",
    headers: c.body ? { "Content-Type": "application/json" } : undefined,
    body: c.body ? JSON.stringify(c.body) : undefined,
    redirect: "manual",
  });
  const text = await res.text().catch(() => "");
  const statusOk = c.expect.includes(res.status);
  let detail = null;
  if (statusOk && c.check) detail = c.check(res, text);
  else if (!statusOk) detail = `status ${res.status}, esperado ${c.expect.join("|")}`;
  return { ok: statusOk && !detail, status: res.status, detail, snippet: text.slice(0, 120) };
}

async function main() {
  console.log(`\n=== Verificación API + PWA/móvil ===`);
  console.log(`API: ${API_BASE}`);
  console.log(`WEB: ${WEB_BASE}\n`);

  let failed = 0;
  for (const c of checks) {
    try {
      const r = await runOne(c);
      const mark = r.ok ? "OK" : "FAIL";
      console.log(`${mark.padEnd(5)} ${c.name} → ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
      if (!r.ok) {
        failed += 1;
        if (r.snippet && r.detail?.includes("WebSocket")) console.log(`       ${r.snippet}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ${c.name} → ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(failed ? `\n${failed} fallo(s).\n` : "\nTodo OK.\n");

  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (email && password) {
    console.log("=== Pruebas autenticadas (TEST_EMAIL) ===\n");
    try {
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginBody = await loginRes.text();
      const cookies = loginRes.headers.getSetCookie?.() ?? [];
      const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");
      console.log(`${loginRes.ok ? "OK" : "FAIL"} Login → ${loginRes.status}`);
      if (!loginRes.ok) {
        console.log(`     ${loginBody.slice(0, 200)}`);
        process.exit(failed ? 1 : 0);
      }
      const authed = [
        { name: "Profile autenticado", path: "/api/v1/profile" },
        { name: "Realtime session", path: "/api/v1/auth/realtime-session" },
        { name: "Push config", path: "/api/v1/notifications/config" },
        { name: "Sync pull", path: "/api/v1/sync" },
      ];
      for (const a of authed) {
        const r = await fetch(`${API_BASE}${a.path}`, {
          headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
        });
        const ok = r.status === 200;
        console.log(`${ok ? "OK" : "FAIL"} ${a.name} → ${r.status}`);
        if (!ok) failed += 1;
      }
    } catch (err) {
      console.log(`FAIL Auth flow → ${err instanceof Error ? err.message : err}`);
      failed += 1;
    }
    console.log("");
  } else {
    console.log("(Opcional: TEST_EMAIL + TEST_PASSWORD para pruebas autenticadas)\n");
  }

  process.exit(failed ? 1 : 0);
}

main();
