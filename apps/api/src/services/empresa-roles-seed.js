import { ServiceError } from "../lib/service-error.js";

/** Rol plataforma Liner (ex-Vendedor, mismo UUID tras migración 0069). */
const LINER_PLATFORM_ROLE_ID = "a0000000-0000-4000-8000-000000000003";

const LINER_FLAG_MATCH = (clave) =>
  clave === "survey"
  || String(clave).startsWith("survey.tab.")
  || clave === "proyeccion_vacaciones";

/**
 * Idempotente por (empresa_id, slug): paquetes + puestos operativos
 * (Gerente, Liner, Cerrador) **por empresa**.
 *
 * No son roles globales de plataforma: cada tenant puede renombrar Liner/Cerrador
 * y ajustar módulos. El Panel → Roles solo lista roles con empresa_id IS NULL.
 * Asistente de Empresa / Sala: sin permisos de catálogo; acceso vía permisos_delegados.
 * (Rol Vendedor eliminado en 0069 — migrado a Liner.)
 */
export async function ensureEmpresaOperationalRoles(admin, empresaId) {
  if (!admin || !empresaId) throw new ServiceError("empresaId requerido.", 400);

  const packages = [
    {
      slug: "operacion-base",
      nombre: "Operación base",
      descripcion: "Módulos base de sala de ventas.",
      flagFilter: null,
    },
    {
      slug: "cierre",
      nombre: "Cierre",
      descripcion: "Todos los módulos, incluyendo Money Box.",
      flagFilter: null,
    },
    {
      slug: "liner",
      nombre: "Liner",
      descripcion: "Survey completo + Proyección de Vacaciones.",
      flagFilter: LINER_FLAG_MATCH,
    },
  ];

  const { data: flags, error: flagsErr } = await admin
    .from("flags")
    .select("id, clave");
  if (flagsErr) throw new ServiceError(flagsErr.message, 500);
  const allFlags = flags ?? [];

  const packageIds = {};
  for (const pack of packages) {
    const { data: existing } = await admin
      .from("paquetes_acceso")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("slug", pack.slug)
      .maybeSingle();

    let packageId = existing?.id;
    if (!packageId) {
      const { data: created, error } = await admin
        .from("paquetes_acceso")
        .insert({
          empresa_id: empresaId,
          nombre: pack.nombre,
          slug: pack.slug,
          descripcion: pack.descripcion,
          es_sistema: true,
          activo: true,
        })
        .select("id")
        .single();
      if (error) throw new ServiceError(error.message, 400);
      packageId = created.id;
    }
    packageIds[pack.slug] = packageId;

    const wanted = pack.flagFilter
      ? allFlags.filter((f) => pack.flagFilter(f.clave))
      : allFlags;

    if (wanted.length) {
      const rows = wanted.map((f) => ({
        paquete_id: packageId,
        flag_id: f.id,
        activo: true,
      }));
      const { error: pfErr } = await admin
        .from("paquete_flags")
        .upsert(rows, { onConflict: "paquete_id,flag_id" });
      if (pfErr) throw new ServiceError(pfErr.message, 400);
    }
  }

  const rolesSpec = [
    { slug: "gerente", nombre: "Gerente", packageSlug: "operacion-base", scope: "workspace" },
    { slug: "liner", nombre: "Liner", packageSlug: "liner", scope: "workspace" },
    { slug: "cerrador", nombre: "Cerrador", packageSlug: "cierre", scope: "workspace" },
    { slug: "asistente_sala", nombre: "Asistente de Sala", packageSlug: null, scope: "workspace", delegatedOnly: true },
    { slug: "asistente_empresa", nombre: "Asistente de Empresa", packageSlug: null, scope: "empresa", delegatedOnly: true },
  ];

  for (const spec of rolesSpec) {
    const { data: existing } = await admin
      .from("roles")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("slug", spec.slug)
      .maybeSingle();

    let roleId = existing?.id;
    if (!roleId) {
      const { data: created, error } = await admin
        .from("roles")
        .insert({
          empresa_id: empresaId,
          nombre: spec.nombre,
          slug: spec.slug,
          scope: spec.scope,
          paquete_id: spec.packageSlug ? (packageIds[spec.packageSlug] || null) : null,
          es_sistema: true,
        })
        .select("id")
        .single();
      if (error) throw new ServiceError(error.message, 400);
      roleId = created.id;
    } else {
      const patch = { scope: spec.scope };
      if (spec.packageSlug) patch.paquete_id = packageIds[spec.packageSlug] || null;
      await admin.from("roles").update(patch).eq("id", roleId);
    }

    if (spec.delegatedOnly) {
      await admin.from("rol_permisos").delete().eq("rol_id", roleId);
      continue;
    }

    const { data: existingPerms } = await admin
      .from("rol_permisos")
      .select("permiso_id")
      .eq("rol_id", roleId);
    const have = new Set((existingPerms ?? []).map((r) => r.permiso_id));

    const { data: basePerms } = await admin
      .from("rol_permisos")
      .select("permiso_id")
      .eq("rol_id", LINER_PLATFORM_ROLE_ID);

    const workflowKeys = spec.slug === "cerrador"
      ? ["workflow:ver", "workflow:avanzar", "workflow:cerrar"]
      : spec.slug === "gerente"
        ? [
          "workflow:ver",
          "workflow:revisar",
          "workflow:asignar_cerrador",
          "expedientes:ver_equipo",
          "ventas:ver_equipo",
          "dashboard:ver_equipo",
        ]
        : ["workflow:ver", "workflow:avanzar"];

    const { data: wfPerms } = await admin
      .from("permisos")
      .select("id")
      .in("clave", workflowKeys);

    const toInsert = [
      ...(basePerms ?? []).map((row) => row.permiso_id),
      ...(wfPerms ?? []).map((p) => p.id),
    ]
      .filter((id) => id && !have.has(id))
      .map((permiso_id) => ({ rol_id: roleId, permiso_id }));

    if (toInsert.length) {
      const { error: permErr } = await admin.from("rol_permisos").insert(toInsert);
      if (permErr && permErr.code !== "23505") throw new ServiceError(permErr.message, 400);
    }
  }

  return { ok: true, packageIds };
}
