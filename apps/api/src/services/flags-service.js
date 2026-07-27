import { ServiceError, assertFound } from "../lib/service-error.js";
import { isSuperAdmin } from "@salesapp/shared/auth/permissions.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

export const FLAG_CLAVES = {
  SURVEY: "survey",
  VACACIONES: "proyeccion_vacaciones",
  WORKSHEET: "worksheet",
  MONEY_BOX: "worksheet.money_box",
  ANALYSIS: "analysis",
  TAB_MOTIVACIONES: "survey.tab.motivaciones",
  TAB_TIMESHARE: "survey.tab.timeshare_information",
  TAB_GASTOS: "survey.tab.gastos_viaje",
  TAB_RESUMEN: "survey.tab.resumen",
};

/** Mapa herramienta UI → flag de módulo */
export const TOOL_FLAG_KEYS = {
  survey: FLAG_CLAVES.SURVEY,
  vacaciones: FLAG_CLAVES.VACACIONES,
  worksheet: FLAG_CLAVES.WORKSHEET,
  analysis: FLAG_CLAVES.ANALYSIS,
};

function flagsMissing(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    error.code === "PGRST205"
    || error.code === "42P01"
    || msg.includes("does not exist")
    || msg.includes("schema cache")
  );
}

/**
 * Resuelve todos los flags del usuario. Fallback vacío si 0051 no está aplicada.
 */
export async function resolveAllFlags(supabase, userId) {
  if (!userId) return {};
  try {
    const { data, error } = await supabase.rpc("resolver_all_flags", { p_usuario_id: userId });
    if (error) {
      if (flagsMissing(error)) return {};
      throw new ServiceError(error.message, 500);
    }
    return data && typeof data === "object" ? data : {};
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    return {};
  }
}

export async function resolveFlag(supabase, userId, clave) {
  if (!userId || !clave) return false;
  try {
    const { data, error } = await supabase.rpc("resolver_flag", {
      p_clave: clave,
      p_usuario_id: userId,
    });
    if (error) {
      if (flagsMissing(error)) return false;
      throw new ServiceError(error.message, 500);
    }
    return data === true;
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    return false;
  }
}

export async function listFlagsTree(supabase, adminProfile) {
  if (!isSuperAdmin(adminProfile) && adminProfile?.role !== "admin") {
    throw new ServiceError("No autorizado.", 403);
  }
  const { data: flags, error } = await supabase
    .from("flags")
    .select("id, clave, nombre_visible, flag_padre, default_global, created_at")
    .order("clave");
  if (error) {
    if (flagsMissing(error)) throw new ServiceError("Flags no disponibles (aplica migración 0051).", 503);
    throw new ServiceError(error.message, 500);
  }
  const { data: rules, error: rErr } = await supabase
    .from("flag_reglas")
    .select("id, flag_id, alcance, alcance_id, activo, created_at");
  if (rErr) throw new ServiceError(rErr.message, 500);

  const byParent = new Map();
  const roots = [];
  for (const f of flags ?? []) {
    const node = { ...f, children: [], rules: (rules ?? []).filter((r) => r.flag_id === f.id) };
    byParent.set(f.id, node);
  }
  for (const f of flags ?? []) {
    const node = byParent.get(f.id);
    if (f.flag_padre && byParent.has(f.flag_padre)) {
      byParent.get(f.flag_padre).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function updateFlagDefault(_supabase, adminProfile, flagId, defaultGlobal) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  if (typeof defaultGlobal !== "boolean") throw new ServiceError("default_global inválido.");
  const admin = createServiceSupabaseClient();
  if (!admin) throw new ServiceError("Service role no configurado.", 500);
  const { data, error } = await admin
    .from("flags")
    .update({ default_global: defaultGlobal })
    .eq("id", flagId)
    .select("id, clave, nombre_visible, flag_padre, default_global")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Flag no encontrado.");
}

/**
 * Reemplaza el conjunto de reglas de un flag.
 * body.rules = [{ alcance, alcance_id, activo }]
 */
export async function replaceFlagRules(supabase, adminProfile, flagId, rules) {
  if (!isSuperAdmin(adminProfile)) throw new ServiceError("Solo Superadmin.", 403);
  const list = Array.isArray(rules) ? rules : [];
  for (const r of list) {
    if (!["rol", "usuario"].includes(r.alcance)) throw new ServiceError("alcance inválido.");
    if (!r.alcance_id) throw new ServiceError("alcance_id requerido.");
    if (typeof r.activo !== "boolean") throw new ServiceError("activo inválido.");
  }

  const admin = createServiceSupabaseClient() || supabase;
  const { error: delErr } = await admin.from("flag_reglas").delete().eq("flag_id", flagId);
  if (delErr) throw new ServiceError(delErr.message, 400);

  if (list.length) {
    const rows = list.map((r) => ({
      flag_id: flagId,
      alcance: r.alcance,
      alcance_id: r.alcance_id,
      activo: r.activo === true,
    }));
    const { error: insErr } = await admin.from("flag_reglas").insert(rows);
    if (insErr) throw new ServiceError(insErr.message, 400);
  }

  const { data } = await admin
    .from("flag_reglas")
    .select("id, flag_id, alcance, alcance_id, activo")
    .eq("flag_id", flagId);
  return data ?? [];
}

/** Sync regla usuario de Money Box según plan (PRO → activo, otro → quitar o false). */
export async function syncMoneyBoxFlagForUser(userId, planNombre) {
  const admin = createServiceSupabaseClient();
  if (!admin || !userId) return;

  const { data: flag, error } = await admin
    .from("flags")
    .select("id")
    .eq("clave", FLAG_CLAVES.MONEY_BOX)
    .maybeSingle();
  if (error || !flag) return;

  const isPro = String(planNombre || "").toLowerCase() === "pro";
  if (isPro) {
    await admin.from("flag_reglas").upsert({
      flag_id: flag.id,
      alcance: "usuario",
      alcance_id: userId,
      activo: true,
    }, { onConflict: "flag_id,alcance,alcance_id" });
  } else {
    await admin
      .from("flag_reglas")
      .delete()
      .eq("flag_id", flag.id)
      .eq("alcance", "usuario")
      .eq("alcance_id", userId);
  }
}
