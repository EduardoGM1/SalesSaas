/**
 * Caché ligera en memoria para catálogos admin (equivalente a staleTime alto).
 * Evita re-descargar roles/módulos/vendedores en cada visita al panel.
 */

const store = new Map();

const STALE_MS_BY_PREFIX = [
  ["roles", 15 * 60 * 1000],
  ["modules", 15 * 60 * 1000],
  ["sellers", 5 * 60 * 1000],
  ["me", 2 * 60 * 1000],
];

function staleTimeForUrl(url) {
  const path = String(url).replace(/^.*\/api\/v1\/admin\//, "");
  for (const [prefix, ms] of STALE_MS_BY_PREFIX) {
    if (path === prefix || path.startsWith(`${prefix}?`)) return ms;
  }
  return 0;
}

export function invalidateFetchCache(prefix = "") {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.includes(prefix)) store.delete(key);
  }
}

export async function cachedAdminFetch(url, { force = false } = {}) {
  const staleMs = staleTimeForUrl(url);
  const now = Date.now();
  const hit = store.get(url);

  if (!force && hit && staleMs > 0 && now - hit.at < staleMs) {
    return hit.data;
  }

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (staleMs > 0) store.set(url, { data, at: now });
  return data;
}
