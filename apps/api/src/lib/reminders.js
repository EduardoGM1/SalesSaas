function padDay(day) {
  return String(day).padStart(2, "0");
}

function clientName(c) {
  if (!c) return "Cliente";
  return c.name || c.companion || c.contract || "Cliente";
}

export function collectReminders(db, { from, to } = {}) {
  const items = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [ym, month] of Object.entries(db?.cal ?? {})) {
    for (const [day, entries] of Object.entries(month?.days ?? {})) {
      const date = `${ym}-${padDay(day)}`;
      for (const entry of entries ?? []) {
        const type = entry.t || entry.type;
        if (type !== "follow") continue;
        items.push({
          id: `cal-${date}-${entry.ts ?? entry.note ?? items.length}`,
          type: "follow-up",
          date,
          due: date < today ? "overdue" : date === today ? "today" : "upcoming",
          note: entry.note ?? "Seguimiento",
          clientId: entry.clientId ?? null,
          prospectId: entry.prospectId ?? null,
        });
      }
    }
  }

  for (const c of Object.values(db?.clients ?? {})) {
    if (!c?.processDate) continue;
    const date = String(c.processDate).slice(0, 10);
    items.push({
      id: `proc-${c.id}`,
      type: "processing",
      date,
      due: date < today ? "overdue" : date === today ? "today" : "upcoming",
      note: `Procesamiento pendiente: ${clientName(c)}`,
      clientId: c.id ?? null,
      prospectId: c.prospectId ?? c.id ?? null,
      contract: c.contract ?? null,
      amount: c.processAmount ?? null,
    });
  }

  let filtered = items;
  if (from) filtered = filtered.filter((r) => r.date >= from);
  if (to) filtered = filtered.filter((r) => r.date <= to);

  return filtered.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}
