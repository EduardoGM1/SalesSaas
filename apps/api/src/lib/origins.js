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

function vercelProductionOrigin() {
  if (process.env.WEB_ORIGIN) {
    const fromEnv = normalizeOrigin(process.env.WEB_ORIGIN);
    if (fromEnv) return fromEnv;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  return null;
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
  if (process.env.VERCEL) {
    const fromVercel = vercelProductionOrigin();
    if (fromVercel) return fromVercel;
  }

  const origins = webOrigins();
  const preferred = origins.find((origin) => !LOCAL_ORIGINS.has(origin));
  return preferred ?? origins[0] ?? "http://localhost:5173";
}

function originFromRequestHost(req) {
  if (!req) return null;
  const host = req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
  if (!host || host.startsWith("localhost")) return null;
  const proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || (process.env.VERCEL ? "https" : "http");
  return normalizeOrigin(`${proto}://${host}`);
}

/**
 * Origen para enlaces de correo/auth.
 * @param {import('express').Request} [req]
 * @param {string} [clientOriginHint] — window.location.origin enviado por el cliente
 */
export function resolveWebOrigin(req, clientOriginHint) {
  const allowed = new Set(webOrigins());

  const hint = normalizeOrigin(clientOriginHint);
  if (hint && allowed.has(hint)) return hint;

  if (req) {
    const fromRequest =
      normalizeOrigin(req.get("origin")) ||
      normalizeOrigin(req.get("referer"));
    if (fromRequest && allowed.has(fromRequest)) return fromRequest;

    const fromHost = originFromRequestHost(req);
    if (fromHost) {
      if (allowed.has(fromHost)) return fromHost;
      // Mismo despliegue en Vercel: confiar en el host de la petición.
      if (process.env.VERCEL && (!hint || hint === fromHost)) return fromHost;
    }

    // Hint del cliente coincide con el host servido (p. ej. dominio custom).
    if (hint && fromHost && hint === fromHost) return hint;
  }

  return primaryWebOrigin();
}

export { normalizeOrigin };
