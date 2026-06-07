export function fmtN(n: number): string {
  return isNaN(n) ? "0" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtN2(n: number): string {
  return isNaN(n) ? "0.00" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmt(n: number): string {
  return `$${fmtN(n)}`;
}

export function fmtD(n: number): string {
  if (isNaN(n)) return "0";
  const v = Number(n);
  return v.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export function parseMoney(v: string | number | undefined): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function formatMoneyValue(v: string | number | undefined): string {
  const raw = String(v ?? "").replace(/[^0-9.\-]/g, "");
  if (raw === "" || raw === "-" || raw === ".") return "";
  const n = parseFloat(raw);
  return isNaN(n) ? "" : fmtN(n);
}

export function onlyDigits(v: string | number | undefined): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}
