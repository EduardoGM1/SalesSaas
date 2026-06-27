import { generateProspectCode } from "@/lib/ids";
import { ClientRecord } from "@/lib/storage/types";

export function ensureProspectIdentity(c: ClientRecord): ClientRecord {
  if (!c.id) c.id = `p${Date.now()}`;
  if (!c.prospectId) c.prospectId = c.id;
  if (!c.prospectCode) c.prospectCode = generateProspectCode(c.id);
  return c;
}

export function clientDisplayName(c: ClientRecord | undefined): string {
  return c?.name || [c?.name1, c?.name2].filter(Boolean).join(" / ") || "Prospecto";
}

export function activeClients(clients: Record<string, ClientRecord>): ClientRecord[] {
  return Object.values(clients)
    .map(ensureProspectIdentity)
    .filter((c) => !["cerrado", "perdido"].includes(c.status || ""))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
}
