import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { normalizeIds } from "@/lib/data/mappers";
import { pullAll, reconcile } from "@/lib/data/sync";
import type { AppDatabase } from "@/lib/storage/types";

/** GET /api/v1/sync — Estado completo del usuario (formato AppDatabase). */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  try {
    const db = await pullAll(auth.supabase, auth.userId);
    return json({ data: db, syncedAt: new Date().toISOString() });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Error al sincronizar.", 500);
  }
}

/** PUT /api/v1/sync — Reconcilia estado completo (mismo formato que GET). */
export async function PUT(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<{ data?: AppDatabase }>(await request.json().catch(() => null));
  const incoming = body?.data ?? (body as unknown as AppDatabase | null);
  if (!incoming || typeof incoming !== "object") return apiError("Cuerpo debe incluir { data: AppDatabase }.");

  try {
    const { db } = normalizeIds(incoming);
    await reconcile(auth.supabase, db, auth.userId);
    const fresh = await pullAll(auth.supabase, auth.userId);
    return json({ data: fresh, syncedAt: new Date().toISOString() });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Error al sincronizar.", 500);
  }
}
