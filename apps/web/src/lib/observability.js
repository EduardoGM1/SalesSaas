let sentryInitStarted = false;
let sentryModule = null;

async function ensureSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return null;
  if (sentryModule) return sentryModule;
  if (sentryInitStarted) return null;
  sentryInitStarted = true;

  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      enabled: import.meta.env.PROD,
    });
    sentryModule = Sentry;
    return Sentry;
  } catch {
    return null;
  }
}

/** Reporta fallos de vínculo OneSignal external_id (Sentry si VITE_SENTRY_DSN está configurado). */
export async function reportOneSignalLinkIssue(detail) {
  console.warn("[onesignal:link]", detail);

  const Sentry = await ensureSentry();
  if (!Sentry) return;

  Sentry.withScope((scope) => {
    scope.setTag("feature", "onesignal");
    scope.setTag("onesignal_stage", detail.stage || "link");
    scope.setContext("onesignal", {
      userId: detail.userId ?? null,
      externalId: detail.externalId ?? null,
      onesignalId: detail.onesignalId ?? null,
      subscriptionId: detail.subscriptionId ?? null,
      subscribed: detail.subscribed ?? null,
      attempt: detail.attempt ?? null,
    });
    if (detail.error instanceof Error) {
      Sentry.captureException(detail.error);
      return;
    }
    Sentry.captureMessage(detail.message || "OneSignal external_id link failed", "warning");
  });
}

/** Reporta fallos al activar/suscribir push (optIn, SW, permiso). */
export async function reportOneSignalPushIssue(detail) {
  console.warn("[onesignal:push]", detail);

  const Sentry = await ensureSentry();
  if (!Sentry) return;

  Sentry.withScope((scope) => {
    scope.setTag("feature", "onesignal");
    scope.setTag("onesignal_stage", detail.stage || "subscribe");
    scope.setTag("onesignal_code", detail.code || "UNKNOWN");
    scope.setContext("onesignal_push", {
      code: detail.code ?? null,
      permission: detail.permission ?? null,
      detail: detail.detail ?? null,
      optedIn: detail.optedIn ?? null,
      subscriptionId: detail.subscriptionId ?? null,
      hasToken: detail.hasToken ?? null,
    });
    if (detail.error instanceof Error) {
      Sentry.captureException(detail.error);
      return;
    }
    Sentry.captureMessage(detail.message || "OneSignal push subscribe failed", "error");
  });
}
