const BASE = process.env.API_BASE ?? "http://localhost:4000";

const checks = [
  { name: "Health", path: "/health", expect: [200] },
  { name: "API root", path: "/api/v1", expect: [200] },
  { name: "Profile sin auth", path: "/api/v1/profile", expect: [401, 503] },
  { name: "Admin role sin auth", path: "/api/v1/admin/users/00000000-0000-4000-8000-000000000001/role", method: "PATCH", body: { role: "vendedor" }, expect: [401, 403, 503] },
];

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

if (failed) process.exit(1);
console.log("Smoke API OK");
