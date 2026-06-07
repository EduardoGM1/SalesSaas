/** Genera un UUID v4. Usa crypto.randomUUID cuando está disponible. */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (entornos sin crypto.randomUUID)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateClientId(): string {
  return uuid();
}

export function generateProspectCode(id?: string): string {
  const fromId = String(id || "").replace(/\D/g, "").slice(-6);
  const base = fromId.length === 6 ? fromId : String(Date.now()).slice(-6);
  return `P-${base}`;
}

export function generateSaleId(): string {
  return uuid();
}

export function generateActivityId(prefix?: string): string {
  void prefix;
  return uuid();
}

export function generateEntryId(): string {
  return uuid();
}
