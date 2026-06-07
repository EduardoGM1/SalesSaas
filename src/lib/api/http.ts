import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

export function parseBody<T extends Record<string, unknown>>(body: unknown): T | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as T;
}

export function pickStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function pickNum(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function pickBool(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return undefined;
}

export function parseLimitOffset(searchParams: URLSearchParams, max = 200) {
  const limit = Math.min(max, Math.max(1, Number(searchParams.get("limit") ?? "50") || 50));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? "0") || 0);
  return { limit, offset };
}
