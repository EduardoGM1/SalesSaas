/**
 * Observabilidad mínima en API (Sentry opcional vía SENTRY_DSN).
 */
import { logger } from "./logger.js";

export async function reportServerIssue(tag, detail = {}) {
  const message = detail.message || tag;
  const err = detail.error instanceof Error ? detail.error : null;
  logger.warn(`support.${tag}`, { message, error: err ?? detail.error ?? null });

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // Envelope mínimo sin SDK pesado: deja rastro si hay DSN de servidor.
    const match = /^https:\/\/([^@]+)@([^/]+)\/(\d+)/.exec(dsn);
    if (!match) return;
    const [, key, host, projectId] = match;
    const payload = {
      message: typeof message === "string" ? message : String(message),
      level: "warning",
      tags: { feature: "support", support_stage: tag },
      extra: {
        ...detail,
        error: err ? { name: err.name, message: err.message, stack: err.stack } : detail.error ?? null,
      },
      timestamp: new Date().toISOString(),
      platform: "node",
    };
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=saletse-api/1.0`,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // Nunca tumbar el request de soporte por fallos de telemetría.
  }
}
