function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function generateClientId() {
  return uuid();
}
function generateProspectCode(id) {
  const fromId = String(id || "").replace(/\D/g, "").slice(-6);
  const base = fromId.length === 6 ? fromId : String(Date.now()).slice(-6);
  return `P-${base}`;
}
function generateSaleId() {
  return uuid();
}
function generateActivityId(prefix) {
  void prefix;
  return uuid();
}
function generateEntryId() {
  return uuid();
}
export {
  generateActivityId,
  generateClientId,
  generateEntryId,
  generateProspectCode,
  generateSaleId
};
