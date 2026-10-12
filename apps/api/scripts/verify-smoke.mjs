const BASE = (process.env.API_BASE ?? "http://localhost:4000").replace(/\/$/, "");
const EDGE_BASE = (process.env.EDGE_BASE ?? "").replace(/\/$/, "");

const checks = [
  { name: "Health", path: "/health", expect: [200] },
  { name: "API root", path: "/api/v1", expect: [200] },
  { name: "Geo countries", path: "/api/v1/geo/countries", expect: [200] },
  { name: "Profile sin auth", path: "/api/v1/profile", expect: [401, 503] },
  { name: "Reminders sin auth", path: "/api/v1/reminders", expect: [401, 503] },
  {
    name: "Admin role sin auth",
    path: "/api/v1/admin/users/00000000-0000-4000-8000-000000000001/role",
    method: "PATCH",
    body: { role: "vendedor" },
    expect: [401, 403, 503],
  },
];

function fail(msg) {
  console.error(`FAIL ${msg}`);
  return 1;
}

async function verifyEdgeSecurityHeaders(edgeBase) {
  if (/^https:\/\/187\.77\.14\.148/i.test(edgeBase)) {
    console.error(
      "FAIL Edge headers: no uses https://187.77.14.148 (443 es vhost CuidateAPP). Usa http://187.77.14.148",
    );
    return 1;
  }

  let failed = 0;
  for (const { id, path } of [
    { id: "edge_health", path: "/health" },
    { id: "edge_spa_index", path: "/" },
  ]) {
    const res = await fetch(`${edgeBase}${path}`, { method: "HEAD", redirect: "follow" });
    const csp = res.headers.get("content-security-policy") || "";
    const nosniff = res.headers.get("x-content-type-options");
    const powered = res.headers.get("x-powered-by");

    if (res.status !== 200) {
      console.error(`FAIL ${id}: status ${res.status}`);
      failed++;
      continue;
    }
    if (powered) {
      console.error(`FAIL ${id}: X-Powered-By presente`);
      failed++;
    } else {
      console.log(`OK   ${id}: sin X-Powered-By`);
    }
    if (!/default-src/i.test(csp)) {
      console.error(`FAIL ${id}: CSP ausente o inesperada (${csp.slice(0, 80) || "vacía"})`);
      failed++;
    } else {
      console.log(`OK   ${id}: CSP presente`);
    }
    if (nosniff !== "nosniff") {
      console.error(`FAIL ${id}: X-Content-Type-Options=${nosniff ?? "ausente"}`);
      failed++;
    } else {
      console.log(`OK   ${id}: nosniff`);
    }
  }
  return failed;
}

let failed = 0;

for (const c of checks) {
  const res = await fetch(`${BASE}${c.path}`, {
    method: c.method ?? "GET",
    headers: c.body ? { "Content-Type": "application/json" } : undefined,
    body: c.body ? JSON.stringify(c.body) : undefined,
  });
  if (!c.expect.includes(res.status)) {
    console.error(`FAIL ${c.name}: ${res.status}`);
    failed++;
  } else {
    console.log(`OK   ${c.name}`);
  }
}

if (EDGE_BASE) {
  console.log(`--- Edge headers (${EDGE_BASE}) ---`);
  failed += await verifyEdgeSecurityHeaders(EDGE_BASE);
}

if (failed) process.exit(1);
console.log("Smoke API OK");
