import { Resend } from "resend";
import { reportServerIssue } from "../lib/observability.js";
import { primaryWebOrigin } from "../lib/origins.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isSupportEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.SUPPORT_EMAIL);
}

/**
 * Envía aviso de ticket a soporte. Nunca lanza: el ticket ya está guardado.
 */
export async function sendSupportTicketEmail({
  ticketId,
  requestTypeLabel,
  appAreaLabel,
  description,
  platform,
  userName,
  userEmail,
  screenshotSignedUrl,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL || "Saletse Soporte <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.warn("[support:email] RESEND_API_KEY o SUPPORT_EMAIL no configurados; se omite email.");
    return { ok: false, reason: "not_configured" };
  }

  const origin = primaryWebOrigin() || "https://app.saletse.local";
  const adminUrl = `${origin}/admin/support?ticket=${encodeURIComponent(ticketId)}`;

  const lines = [
    `<p><strong>Nuevo ticket de Atención a usuario</strong></p>`,
    `<p><strong>Tipo:</strong> ${escapeHtml(requestTypeLabel)}</p>`,
    `<p><strong>Área:</strong> ${escapeHtml(appAreaLabel)}</p>`,
    `<p><strong>Plataforma:</strong> ${escapeHtml(platform)}</p>`,
    `<p><strong>Usuario:</strong> ${escapeHtml(userName || "—")} (${escapeHtml(userEmail || "sin email")})</p>`,
    `<p><strong>Descripción:</strong></p>`,
    `<pre style="white-space:pre-wrap;font-family:inherit;background:#f6f8fb;padding:12px;border-radius:8px;">${escapeHtml(description)}</pre>`,
    `<p><a href="${escapeHtml(adminUrl)}">Abrir en panel de admin</a></p>`,
  ];

  if (screenshotSignedUrl) {
    lines.push(
      `<p><a href="${escapeHtml(screenshotSignedUrl)}">Ver captura (enlace con expiración)</a></p>`,
      `<p style="color:#64748b;font-size:12px;">No se adjunta la imagen al correo para no saturar la cuota de envío.</p>`,
    );
  } else {
    lines.push(`<p><em>Sin captura adjunta.</em></p>`);
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: `[Saletse Soporte] ${requestTypeLabel} — ${appAreaLabel}`,
      html: lines.join("\n"),
    });
    if (error) {
      await reportServerIssue("email_failed", {
        message: error.message || "Resend error",
        ticketId,
        error,
      });
      return { ok: false, reason: "send_failed", error };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    await reportServerIssue("email_failed", {
      message: err instanceof Error ? err.message : String(err),
      ticketId,
      error: err,
    });
    return { ok: false, reason: "send_failed", error: err };
  }
}
