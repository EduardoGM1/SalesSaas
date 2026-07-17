import { ServiceError } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

const PLAN_RANK = { basico: 0, pro: 1 };

export function planRank(nombre) {
  return PLAN_RANK[String(nombre || "").toLowerCase()] ?? 0;
}

/**
 * Membresía vigente del usuario (plan + estado).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
export async function getCurrentMembership(supabase, userId) {
  const { data, error } = await supabase.rpc("current_membership", { p_user_id: userId });
  if (error) throw new ServiceError(error.message, 500);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      plan: "basico",
      status: "activa",
      fecha_inicio: null,
      fecha_proximo_cobro: null,
      plan_id: null,
      membresia_id: null,
    };
  }
  return {
    plan: row.plan_nombre || "basico",
    status: row.membresia_estado || "activa",
    fecha_inicio: row.fecha_inicio ?? null,
    fecha_proximo_cobro: row.fecha_proximo_cobro ?? null,
    plan_id: row.plan_id ?? null,
    membresia_id: row.membresia_id ?? null,
  };
}

export async function listPremiumFeatures(supabase) {
  const { data, error } = await supabase
    .from("funciones_premium")
    .select("clave, nombre_visible, herramienta_padre, plan_minimo_requerido, planes:plan_minimo_requerido(nombre)")
    .order("clave");
  if (error) throw new ServiceError(error.message, 500);
  return (data || []).map((f) => ({
    clave: f.clave,
    nombre_visible: f.nombre_visible,
    herramienta_padre: f.herramienta_padre,
    plan_minimo: f.planes?.nombre || "pro",
  }));
}

/**
 * Asigna plan (histórico): cancela activa previa e inserta nueva.
 * @param {string} userId
 * @param {string} planNombre
 * @param {{ changedBy?: string | null }} [options]
 */
export async function assignMembership(userId, planNombre, options = {}) {
  const planKey = String(planNombre || "").toLowerCase();
  if (planKey !== "basico" && planKey !== "pro") {
    throw new ServiceError("Plan no válido.", 400);
  }
  const serviceSb = createServiceSupabaseClient();
  if (!serviceSb) throw new ServiceError("Service role no configurado.", 500);

  const { data: plan, error: planErr } = await serviceSb
    .from("planes")
    .select("id, nombre")
    .eq("nombre", planKey)
    .eq("activo", true)
    .maybeSingle();
  if (planErr) throw new ServiceError(planErr.message, 500);
  if (!plan) throw new ServiceError("Plan no encontrado.", 404);

  const now = new Date().toISOString();
  const changedBy = options.changedBy || null;

  const { error: cancelErr } = await serviceSb
    .from("membresias")
    .update({ estado: "cancelada" })
    .eq("usuario_id", userId)
    .in("estado", ["activa", "en_prueba"]);
  if (cancelErr) throw new ServiceError(cancelErr.message, 400);

  const { data: inserted, error: insErr } = await serviceSb
    .from("membresias")
    .insert({
      usuario_id: userId,
      plan_id: plan.id,
      estado: "activa",
      fecha_inicio: now,
      fecha_cambio: now,
      cambiado_por: changedBy,
    })
    .select("id, estado, fecha_inicio, fecha_proximo_cobro, cambiado_por, fecha_cambio")
    .single();
  if (insErr) throw new ServiceError(insErr.message, 400);

  return {
    plan: plan.nombre,
    status: inserted.estado,
    fecha_inicio: inserted.fecha_inicio,
    fecha_proximo_cobro: inserted.fecha_proximo_cobro ?? null,
    membresia_id: inserted.id,
    cambiado_por: inserted.cambiado_por ?? changedBy,
    fecha_cambio: inserted.fecha_cambio ?? now,
  };
}

/**
 * Mapa userId → membresía vigente (para listado admin).
 */
export async function loadMembershipsByUserIds(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  // Una query por lote: últimas membresías activas/en_prueba
  const { data, error } = await supabase
    .from("membresias")
    .select("id, usuario_id, estado, fecha_inicio, fecha_proximo_cobro, planes:plan_id(nombre)")
    .in("usuario_id", ids)
    .in("estado", ["activa", "en_prueba"])
    .order("fecha_inicio", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);

  for (const row of data || []) {
    if (map.has(row.usuario_id)) continue;
    map.set(row.usuario_id, {
      plan: row.planes?.nombre || "basico",
      status: row.estado,
      fecha_inicio: row.fecha_inicio,
      fecha_proximo_cobro: row.fecha_proximo_cobro,
      membresia_id: row.id,
    });
  }
  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, { plan: "basico", status: "activa", fecha_inicio: null, fecha_proximo_cobro: null, membresia_id: null });
    }
  }
  return map;
}

export { PLAN_RANK };
