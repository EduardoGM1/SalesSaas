/**
 * Autorización de crons (Vercel / externo).
 * El secreto vive en CRON_SECRET; no se loguea.
 */
export function authorizeCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.get("authorization") || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = String(req.get("x-cron-secret") || "").trim();
  const token = bearer || header;
  return Boolean(token && token === secret);
}
