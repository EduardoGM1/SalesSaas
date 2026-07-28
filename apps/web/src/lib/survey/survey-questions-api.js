import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buildFallbackBankRows } from "@/lib/survey/fallback-bank.js";
import { mergeSurveyQuestions } from "@/lib/survey/resolve-survey-questions.js";

async function surveyConfigJson(init) {
  const res = await fetch("/api/v1/survey/questions-config", {
    credentials: "include",
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "No se pudo completar la operación.");
  }
  return body.data ?? body;
}

/**
 * Carga banco global + overrides del usuario vía API y los fusiona.
 * Sin sesión o sin backend disponible usa el banco local de respaldo.
 */
export async function loadMergedSurveyQuestions({ includeInactive = false } = {}) {
  let bank = buildFallbackBankRows();
  let overrides = [];
  if (isSupabaseConfigured()) {
    try {
      const config = await surveyConfigJson();
      if (Array.isArray(config?.bank) && config.bank.length) bank = config.bank;
      if (Array.isArray(config?.overrides)) overrides = config.overrides;
    } catch {
      // Offline o sin sesión: se conserva el banco de respaldo.
    }
  }
  return {
    bank,
    overrides,
    merged: mergeSurveyQuestions(bank, overrides, { includeInactive }),
  };
}

/**
 * Guarda overrides del usuario.
 * items: [{ pregunta_id, activa, orden, texto_override, opciones_override }]
 */
export async function saveSurveyUserOverrides(userId, items, seccion) {
  if (!userId || !isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }
  return surveyConfigJson({
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seccion, items }),
  });
}
