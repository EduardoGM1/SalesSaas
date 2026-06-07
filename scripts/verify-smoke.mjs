/**
 * Verificación rápida de rutas públicas y API (sin auth).
 * Uso: npm run verify  (arranca el servidor en otro terminal o usa BASE_URL)
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const checks = [
  { name: "Home redirect/login", path: "/", expect: [200, 307, 308] },
  { name: "Login page", path: "/login", expect: [200] },
  { name: "API root", path: "/api/v1", expect: [200] },
  { name: "Admin role API sin auth", path: "/api/v1/admin/users/00000000-0000-4000-8000-000000000001/role", method: "PATCH", body: { role: "vendedor" }, expect: [401, 403] },
  { name: "Profile API sin auth", path: "/api/v1/profile", expect: [401] },
  { name: "Manifest", path: "/manifest.webmanifest", expect: [200] },
];

async function run() {
  console.log(`\n=== Smoke test → ${BASE} ===\n`);
  let failed = 0;

  for (const c of checks) {
    try {
      const res = await fetch(`${BASE}${c.path}`, {
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
