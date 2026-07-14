export const LIBRE_TOOL_IDS = ["survey", "vacaciones", "worksheet"] as const;

export type LibreToolId = (typeof LIBRE_TOOL_IDS)[number];

export function isNonEmptyToolBucket(
  data: Record<string, string | number> | null | undefined,
): boolean {
  if (!data || typeof data !== "object") return false;
  return Object.entries(data).some(([, v]) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return v !== 0;
    return String(v).trim() !== "";
  });
}
