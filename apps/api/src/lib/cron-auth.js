/**
 * Autorización de crons (Vercel / externo).
 * El secreto vive en CRON_SECRET; nunca se loguea ni se devuelve al cliente.
 * La comparación es en tiempo constante para no filtrar el secreto por timing.
 */
import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Acepta `Authorization: Bearer <secret>` o `X-Cron-Secret: <secret>`.
 * @param {import('express').Request} req
 */
export function authorizeCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.get("authorization") || "");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = String(req.get("x-cron-secret") || "").trim();
  const token = bearer || header;
  return Boolean(token) && safeEqual(token, secret);
}
