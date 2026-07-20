import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { buildFallbackBankRows } from "@/lib/survey/fallback-bank.js";
import { mergeSurveyQuestions } from "@/lib/survey/resolve-survey-questions.js";

export async function fetchSurveyBank() {
  if (!isSupabaseConfigured()) return buildFallbackBankRows();
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("survey_preguntas")
      .select("*")
      .eq("es_global", true)
      .order("seccion", { ascending: true })
      .order("orden", { ascending: true });
    if (error || !data?.length) return buildFallbackBankRows();
    return data.map((row) => ({
      ...row,
      opciones: Array.isArray(row.opciones) ? row.opciones : [],
    }));
  } catch {
    return buildFallbackBankRows();
  }
}

export async function fetchSurveyUserOverrides(userId) {
  if (!userId || !isSupabaseConfigured()) return [];
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("survey_preguntas_usuario")
      .select("pregunta_id, activa, orden, texto_override, opciones_override")
      .eq("usuario_id", userId);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function loadMergedSurveyQuestions(userId, { includeInactive = false } = {}) {
  const [bank, overrides] = await Promise.all([
    fetchSurveyBank(),
    fetchSurveyUserOverrides(userId),
  ]);
  return {
    bank,
    overrides,
    merged: mergeSurveyQuestions(bank, overrides, { includeInactive }),
  };
}

/**
 * Guarda overrides vía API.
 * items: [{ pregunta_id, activa, orden, texto_override, opciones_override }]
 */
export async function saveSurveyUserOverrides(userId, items, seccion) {
  if (!userId || !isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }
  const res = await fetch("/api/v1/survey/questions-config", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seccion, items }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "No se pudo guardar la configuración.");
  }
  return body.data ?? body;
}
