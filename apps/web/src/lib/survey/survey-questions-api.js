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
      .select("pregunta_id, activa, orden")
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

/** Upsert overrides del usuario. items: [{ pregunta_id, activa, orden }] */
export async function saveSurveyUserOverrides(userId, items) {
  if (!userId || !isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }
  const sb = createClient();
  const payload = (items || []).map((item) => ({
    usuario_id: userId,
    pregunta_id: item.pregunta_id,
    activa: item.activa !== false,
    orden: item.orden ?? null,
    updated_at: new Date().toISOString(),
  }));
  if (!payload.length) return;
  const { error } = await sb
    .from("survey_preguntas_usuario")
    .upsert(payload, { onConflict: "usuario_id,pregunta_id" });
  if (error) throw error;
}
