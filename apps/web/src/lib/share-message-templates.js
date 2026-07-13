/**
 * Plantillas bilingües de compartición (externo + copy).
 * Idioma = settings del emisor.
 */

export function buildShareTemplates({
  lang = "es",
  sharerName,
  clientName,
  url,
}) {
  const name = sharerName || "Saletse";
  const client = clientName || (lang === "en" ? "a client" : "un cliente");

  if (lang === "en") {
    const subject = `${name} shared a client file with you on Saletse`;
    const body = [
      `Hi,`,
      ``,
      `${name} shared the client file «${client}» with you on Saletse.`,
      ``,
      `You can review the Survey, Vacation Projection, Worksheet, notes, and sales follow-up — and collaborate on the same file.`,
      ``,
      `Saletse is built for timeshare and vacation club sales professionals.`,
      ``,
      `Open client file:`,
      url,
      ``,
      `If you don't have an account yet, create one or sign in to continue.`,
    ].join("\n");
    return { subject, body, cta: "Open client file", url };
  }

  const subject = `${name} te compartió un expediente en Saletse`;
  const body = [
    `Hola,`,
    ``,
    `${name} te compartió el expediente «${client}» en Saletse.`,
    ``,
    `Puedes revisar el Survey, la Proyección de Vacaciones, el Worksheet, notas y el seguimiento comercial — y colaborar sobre el mismo expediente.`,
    ``,
    `Saletse está pensado para profesionales de ventas de timeshare y clubes vacacionales.`,
    ``,
    `Abrir expediente:`,
    url,
    ``,
    `Si aún no tienes cuenta, créala o inicia sesión para continuar.`,
  ].join("\n");
  return { subject, body, cta: "Abrir expediente", url };
}

export function buildMailtoHref({ subject, body }) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
