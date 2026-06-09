/**
 * Verificación rápida de API y SPA (sin auth).
 * Uso: npm run verify  (API en :4000, web en :5173)
 */
const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const WEB_BASE = process.env.WEB_BASE ?? "http://localhost:5173";

const checks = [
  { base: API_BASE, name: "API health", path: "/health", expect: [200] },
  { base: API_BASE, name: "API root", path: "/api/v1", expect: [200] },
  { base: API_BASE, name: "Geo countries", path: "/api/v1/geo/countries", expect: [200] },
  { base: API_BASE, name: "Profile sin auth", path: "/api/v1/profile", expect: [401, 503] },
  { base: API_BASE, name: "Reminders sin auth", path: "/api/v1/reminders", expect: [401, 503] },
  { base: WEB_BASE, name: "SPA index", path: "/", expect: [200] },
];

async function run() {
  console.log(`\n=== Smoke test API=${API_BASE} WEB=${WEB_BASE} ===\n`);
  let failed = 0;

  for (const c of checks) {
    try {
      const res = await fetch(`${c.base}${c.path}`, {
        method: c.method ?? "GET",
        headers: c.body ? { "Content-Type": "application/json" } : undefined,
        body: c.body ? JSON.stringify(c.body) : undefined,
        redirect: "manual",
      });
      const ok = c.expect.includes(res.status);
      console.log(`${ok ? "✓" : "✗"} ${c.name} → ${res.status}`);
      if (!ok) failed += 1;
    } catch (e) {
      console.log(`✗ ${c.name} → ${e instanceof Error ? e.message : e}`);
      failed += 1;
    }
  }

  console.log(failed ? `\n${failed} fallo(s).\n` : "\nTodo OK.\n");
  process.exit(failed ? 1 : 0);
}

run();
