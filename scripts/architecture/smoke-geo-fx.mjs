/**
 * Smoke de módulo geo-fx: solo GET públicos (sin auth, sin escrituras).
 * Uso: API_BASE=http://localhost:4000 node scripts/architecture/smoke-geo-fx.mjs
 */
const API_BASE = process.env.API_BASE ?? "http://localhost:4000";

async function check(name, path, assertFn) {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  assertFn(res, json);
  console.log(`✓ ${name} → ${res.status}`);
}

async function main() {
  console.log(`\n=== Smoke geo-fx API=${API_BASE} ===\n`);
  let failed = 0;
  try {
    await check("geo countries", "/api/v1/geo/countries", (res, json) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      if (!Array.isArray(json?.data) || json.data.length < 1) throw new Error("data vacío");
    });
    await check("geo cities MX", "/api/v1/geo/countries/MX/cities", (res, json) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      if (!Array.isArray(json?.data?.cities)) throw new Error("cities ausente");
    });
    await check("fx USD", "/api/v1/exchange-rates?to=USD", (res, json) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      if (json?.data?.rate !== 1) throw new Error("USD rate != 1");
    });
    await check("fx MXN", "/api/v1/exchange-rates?to=MXN", (res, json) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      const rate = Number(json?.data?.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("MXN rate inválido");
    });
  } catch (err) {
    failed = 1;
    console.error(`✗ ${err instanceof Error ? err.message : err}`);
  }
  console.log(failed ? "\nFallo.\n" : "\nTodo OK (solo lecturas).\n");
  process.exit(failed);
}

main();
