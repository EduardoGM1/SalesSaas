export function json(res, data, status = 200) {
  return res.status(status).json(data);
}

export function apiError(res, message, status = 400, code) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export function parseBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body;
}

export function pickStr(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function pickNum(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function pickBool(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

export function parseLimitOffset(query, max = 200) {
  const limit = Math.min(max, Math.max(1, Number(query.limit ?? "50") || 50));
  const offset = Math.max(0, Number(query.offset ?? "0") || 0);
  return { limit, offset };
}
