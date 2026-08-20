/**
 * Credenciales y medición de payloads para auditoría de egress.
 * No crea datos. Skip si faltan E2E_EMAIL / E2E_PASSWORD.
 */

export const E2E_EMAIL = process.env.E2E_EMAIL || process.env.EGRESS_EMAIL || "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD || process.env.EGRESS_PASSWORD || "";
export const EGRESS_EXPECT_MIN_ROWS = Number(process.env.EGRESS_EXPECT_MIN_ROWS || "1") || 1;
export const EGRESS_REALTIME_IDLE_MS = Number(process.env.EGRESS_REALTIME_IDLE_MS || "60000") || 60_000;

/** Umbrales por fila (JSON). Superarlos sugiere select('*'), joins o blobs inesperados. */
export const MAX_BYTES_PER_ROW = {
  prospects: 4_096,
  sales: 8_192,
  "calendar-entries": 4_096,
  "tool-calculations": 250_000,
};

/** Sync incluye snapshots JSON de tools; ~80 KB/expediente es techo de alarma. */
export const MAX_SYNC_BYTES_PER_CLIENT = 80_000;

export function hasEgressCredentials() {
  return Boolean(E2E_EMAIL && E2E_PASSWORD);
}

/**
 * @param {import("@playwright/test").APIRequestContext} request
 */
export async function loginApi(request) {
  const res = await request.post("/auth/login", {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  return res;
}

/**
 * @param {import("@playwright/test").APIRequestContext} request
 * @param {string} path
 */
export async function measureGet(request, path) {
  const res = await request.get(path);
  const body = await res.body();
  let parsed = null;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    parsed = null;
  }
  const rows = extractRows(parsed, path);
  const bytes = body.length;
  return {
    path,
    status: res.status(),
    ok: res.ok(),
    bytes,
    rows,
    bytesPerRow: rows > 0 ? Math.round(bytes / rows) : bytes,
    json: parsed,
  };
}

function extractRows(parsed, path) {
  if (!parsed || typeof parsed !== "object") return 0;
  if (path.includes("/sync")) {
    const clients = parsed.data?.clients || parsed.clients;
    if (clients && typeof clients === "object" && !Array.isArray(clients)) {
      return Object.keys(clients).length;
    }
    return 0;
  }
  if (Array.isArray(parsed.data)) return parsed.data.length;
  if (parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) return 1;
  if (Array.isArray(parsed)) return parsed.length;
  return 0;
}

export function formatTable(rows) {
  const cols = ["endpoint", "status", "bytes", "filas", "bytes/fila"];
  const lines = [cols.join("\t")];
  for (const row of rows) {
    lines.push([
      row.path,
      String(row.status),
      String(row.bytes),
      String(row.rows),
      String(row.bytesPerRow),
    ].join("\t"));
  }
  return lines.join("\n");
}
