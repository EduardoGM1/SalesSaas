import { clientDisplayName, ensureProspectIdentity } from "@/lib/clients";
import { getLang, getMonths, translate } from "@/lib/i18n.js";
import { longDate } from "@/lib/format/dates";
import { statusLabel } from "@/lib/format/status";
import { createEmptyClient, useDbStore } from "@/stores/db-store";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

function normalizeSearch(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function filterAndSortClients(clients, query) {
  const lang = getLang(useDbStore.getState().db.settings);
  const normalizedQuery = normalizeSearch(query).trim();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const allClients = Object.values(clients);
  const filtered = terms.length
    ? allClients.filter((c) => {
        const date = c.tourDate || c.createdYmd || "";
        const dt = date ? new Date(`${date}T00:00:00`) : null;
        const monthName = dt && !Number.isNaN(dt.getTime()) ? getMonths(lang)[dt.getMonth()] : "";
        const text = [
          clientDisplayName(c), c.name, c.name1, c.occupation1,
          c.contract, c.prospectCode, c.city, c.country, c.status, statusLabel(c.status, lang),
          c.tipo_tour, String(c.tour_cuantificable ?? ""),
          date, date ? longDate(date, lang) : "", monthName, dt ? String(dt.getMonth() + 1) : "", dt ? String(dt.getFullYear()) : "",
        ].filter(Boolean).join(" ");
        const haystack = normalizeSearch(text);
        return terms.every((term) => haystack.includes(term));
      })
    : allClients;

  return filtered.sort((a, b) => {
    const da = a.tourDate || a.createdYmd || "";
    const db2 = b.tourDate || b.createdYmd || "";
    if (db2 !== da) return db2.localeCompare(da);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function createProspectFromName(name, tipoTour, tourCuantificable) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    toast.error(translate("toast.client.missingName"));
    return { ok: false, reason: "missing_name" };
  }
  const client = createEmptyClient(trimmed, undefined, tipoTour, tourCuantificable);
  useDbStore.getState().saveClient(client);
  return { ok: true, client };
}

export function saveClientEdit(client, form) {
  const updated = ensureProspectIdentity({
    ...client,
    ...form,
    name: form.name1 || form.name || client.name,
    name2: "",
    occupation2: "",
  });
  useDbStore.getState().saveClient(updated);
  return updated;
}

export async function deleteClientWithConfirm(clientId, displayName) {
  const ok = await confirmDialog(translate("toast.client.deleteConfirm", { name: displayName }));
  if (!ok) return false;
  useDbStore.getState().deleteClient(clientId);
  toast.success(translate("toast.client.deleted"));
  return true;
}
