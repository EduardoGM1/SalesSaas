const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
]);

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Orígenes permitidos para CORS y redirects de auth (local + Vercel). */
export function webOrigins() {
  const production = [
    normalizeOrigin(process.env.WEB_ORIGIN),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
  ].filter(Boolean);

  const local = ["http://localhost:5173", "http://localhost:3000"];
  const onVercel = Boolean(process.env.VERCEL);
  const list = onVercel ? [...production, ...local] : [...local, ...production];
  return [...new Set(list)];
}

export function primaryWebOrigin() {
  const origins = webOrigins();
  const preferred = origins.find((origin) => !LOCAL_ORIGINS.has(origin));
  return preferred ?? origins[0] ?? "http://localhost:5173";
}

/** Origen para enlaces de correo/auth: respeta el host de la petición si está permitido. */
export function resolveWebOrigin(req) {
  if (req) {
    const fromRequest =
      normalizeOrigin(req.get("origin")) ||
      normalizeOrigin(req.get("referer"));
    const allowed = new Set(webOrigins());
    if (fromRequest && allowed.has(fromRequest)) return fromRequest;
  }
  return primaryWebOrigin();
}
