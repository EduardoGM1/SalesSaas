export function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ];
  return lines.join("\r\n");
}
