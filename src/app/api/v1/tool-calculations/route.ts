import type { NextRequest } from "next/server";
import { authenticateApi } from "@/lib/api/auth";
import { apiError, json, parseBody } from "@/lib/api/http";
import { bodyToToolUpsert, sanitizeTool } from "@/lib/api/validators";
import { isUuid } from "@/lib/data/mappers";

/** GET /api/v1/tool-calculations?tool=survey&prospect_id=uuid|libre */
export async function GET(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const tool = sp.get("tool");
  const prospectRaw = sp.get("prospect_id");

  let q = auth.supabase.from("tool_calculations").select("*").eq("user_id", auth.userId);
  if (tool && sanitizeTool(tool)) q = q.eq("tool", tool);

  if (prospectRaw === "libre" || prospectRaw === "null") {
    q = q.is("prospect_id", null);
  } else if (prospectRaw && isUuid(prospectRaw)) {
    q = q.eq("prospect_id", prospectRaw);
  }

  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) return apiError(error.message, 500);
  return json({ data: data ?? [] });
}

/** PUT /api/v1/tool-calculations — Upsert calculadora (tool + data; prospect_id opcional). */
export async function PUT(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const body = parseBody<Record<string, unknown>>(await request.json().catch(() => null));
  if (!body) return apiError("Cuerpo JSON inválido.");

  const row = bodyToToolUpsert(body, auth.userId);
  if (!row) return apiError("tool (survey|vacaciones|worksheet) y data son requeridos.");

  const { data, error } = await auth.supabase
    .from("tool_calculations")
    .upsert(row, { onConflict: "user_id,prospect_id,tool" })
    .select()
    .single();

  if (error) return apiError(error.message, 400);
  return json({ data });
}

/** DELETE /api/v1/tool-calculations?tool=survey&prospect_id=libre */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateApi(request);
  if (!auth.ok) return apiError(auth.message, auth.status);

  const sp = request.nextUrl.searchParams;
  const tool = sanitizeTool(sp.get("tool"));
  if (!tool) return apiError("Query tool requerido.");

  const prospectRaw = sp.get("prospect_id");
  let q = auth.supabase
    .from("tool_calculations")
    .delete({ count: "exact" })
    .eq("user_id", auth.userId)
    .eq("tool", tool);

  if (prospectRaw === "libre" || prospectRaw === "null" || !prospectRaw) {
    q = q.is("prospect_id", null);
  } else if (isUuid(prospectRaw)) {
    q = q.eq("prospect_id", prospectRaw);
  } else {
    return apiError("prospect_id inválido (uuid o libre).");
  }

  const { error, count } = await q;
  if (error) return apiError(error.message, 400);
  if (!count) return apiError("Calculadora no encontrada.", 404);
  return json({ ok: true });
}
