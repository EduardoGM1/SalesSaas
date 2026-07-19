import { ServiceError } from "../lib/service-error.js";

const SECTIONS = new Set(["motivaciones", "timeshare"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Persiste overrides de activación/orden del Survey para el usuario autenticado.
 * Valida que los IDs pertenezcan a la sección indicada y que el orden no tenga duplicados.
 */
export async function saveSurveyQuestionsConfig(supabase, userId, body) {
  if (!userId) throw new ServiceError("No autenticado.", 401);

  const seccion = String(body?.seccion || "").trim();
  if (!SECTIONS.has(seccion)) {
    throw new ServiceError("Sección inválida. Usa motivaciones o timeshare.", 400);
  }

  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items?.length) {
    throw new ServiceError("Debes enviar al menos una pregunta.", 400);
  }
  if (items.length > 100) {
    throw new ServiceError("Demasiadas preguntas en el payload.", 400);
  }

  const seenIds = new Set();
  const seenOrdenes = new Set();
  const normalized = [];

  for (const raw of items) {
    const preguntaId = String(raw?.pregunta_id || "").trim();
    if (!UUID_RE.test(preguntaId)) {
      throw new ServiceError("ID de pregunta inválido.", 400);
    }
    if (seenIds.has(preguntaId)) {
      throw new ServiceError("Hay IDs de pregunta duplicados en el orden.", 400);
    }
    seenIds.add(preguntaId);

    const ordenRaw = raw?.orden;
    const orden = Number(ordenRaw);
    if (!Number.isInteger(orden) || orden < 0 || orden > 100000) {
      throw new ServiceError("Orden inválido.", 400);
    }
    if (seenOrdenes.has(orden)) {
      throw new ServiceError("Hay posiciones de orden duplicadas.", 400);
    }
    seenOrdenes.add(orden);

    normalized.push({
      pregunta_id: preguntaId,
      activa: raw?.activa !== false,
      orden,
    });
  }

  const { data: bankRows, error: bankErr } = await supabase
    .from("survey_preguntas")
    .select("id")
    .eq("seccion", seccion)
    .eq("es_global", true)
    .in("id", [...seenIds]);

  if (bankErr) throw new ServiceError(bankErr.message || "No se pudo validar el banco.", 500);

  const allowed = new Set((bankRows || []).map((r) => r.id));
  if (allowed.size !== seenIds.size) {
    throw new ServiceError(
      "Una o más preguntas no pertenecen a esta sección o no existen.",
      403,
    );
  }

  const payload = normalized.map((item) => ({
    usuario_id: userId,
    pregunta_id: item.pregunta_id,
    activa: item.activa,
    orden: item.orden,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from("survey_preguntas_usuario")
    .upsert(payload, { onConflict: "usuario_id,pregunta_id" });

  if (upsertErr) {
    throw new ServiceError(upsertErr.message || "No se pudo guardar la configuración.", 500);
  }

  return { saved: payload.length, seccion };
}
