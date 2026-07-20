import { ServiceError } from "../lib/service-error.js";

const SECTIONS = new Set(["motivaciones", "timeshare"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BANK_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const CUSTOM_KEY_RE = /^custom_[a-z0-9]{6,32}$/;
const MAX_OPTIONS = 30;
const MAX_LABEL = 120;
const MAX_TITLE = 200;

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, "").trim();
}

function normalizeTextoOverride(raw) {
  if (raw == null || raw === "") return null;
  const s = stripTags(raw);
  if (!s) return null;
  if (s.length > MAX_TITLE) {
    throw new ServiceError(`El título no puede superar ${MAX_TITLE} caracteres.`, 400);
  }
  return s;
}

function normalizeOpcionesOverride(raw, bankKeys) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    throw new ServiceError("opciones_override debe ser un arreglo o null.", 400);
  }
  if (raw.length > MAX_OPTIONS) {
    throw new ServiceError(`Máximo ${MAX_OPTIONS} opciones por pregunta.`, 400);
  }
  const bankSet = new Set(bankKeys || []);
  const seen = new Set();
  const out = [];

  for (const item of raw) {
    const key = String(item?.key || "").trim();
    if (!key) throw new ServiceError("Cada opción necesita una clave.", 400);
    if (seen.has(key)) throw new ServiceError("Hay claves de opción duplicadas.", 400);
    seen.add(key);

    const isCustom = CUSTOM_KEY_RE.test(key);
    const isBank = BANK_KEY_RE.test(key) && bankSet.has(key);
    if (!isCustom && !isBank) {
      throw new ServiceError(`Clave de opción inválida o no pertenece al banco: ${key}`, 400);
    }

    let label = item?.label;
    if (label == null || label === "") {
      label = null;
    } else {
      label = stripTags(label);
      if (!label) label = null;
      else if (label.length > MAX_LABEL) {
        throw new ServiceError(`El texto de opción no puede superar ${MAX_LABEL} caracteres.`, 400);
      }
    }

    if (isCustom && !label) {
      throw new ServiceError("Las opciones nuevas requieren un texto.", 400);
    }

    out.push(label == null ? { key } : { key, label });
  }

  return out;
}

/**
 * Persiste overrides de activación/orden/texto/opciones del Survey para el usuario autenticado.
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
      texto_override: raw?.texto_override ?? null,
      opciones_override: Object.prototype.hasOwnProperty.call(raw || {}, "opciones_override")
        ? raw.opciones_override
        : null,
    });
  }

  const { data: bankRows, error: bankErr } = await supabase
    .from("survey_preguntas")
    .select("id, opciones")
    .eq("seccion", seccion)
    .eq("es_global", true)
    .in("id", [...seenIds]);

  if (bankErr) throw new ServiceError(bankErr.message || "No se pudo validar el banco.", 500);

  const bankById = new Map((bankRows || []).map((r) => [r.id, r]));
  if (bankById.size !== seenIds.size) {
    throw new ServiceError(
      "Una o más preguntas no pertenecen a esta sección o no existen.",
      403,
    );
  }

  const payload = normalized.map((item) => {
    const bank = bankById.get(item.pregunta_id);
    const bankKeys = Array.isArray(bank?.opciones) ? bank.opciones.map(String) : [];
    return {
      usuario_id: userId,
      pregunta_id: item.pregunta_id,
      activa: item.activa,
      orden: item.orden,
      texto_override: normalizeTextoOverride(item.texto_override),
      opciones_override: normalizeOpcionesOverride(item.opciones_override, bankKeys),
      updated_at: new Date().toISOString(),
    };
  });

  const { error: upsertErr } = await supabase
    .from("survey_preguntas_usuario")
    .upsert(payload, { onConflict: "usuario_id,pregunta_id" });

  if (upsertErr) {
    throw new ServiceError(upsertErr.message || "No se pudo guardar la configuración.", 500);
  }

  return { saved: payload.length, seccion };
}
