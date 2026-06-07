export function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
  ];
  return lines.join("\r\n");
}
