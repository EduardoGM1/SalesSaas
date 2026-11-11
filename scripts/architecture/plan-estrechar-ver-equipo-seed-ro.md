# Plan RO — estrechar `*:ver_equipo` (residual D2)

**Estado:** **aplicado en prod** 2026-11-11 (UTC `201715`).  
**Ruta:** migración `supabase/migrations/0103_estrechar_ver_equipo_puestos.sql` vía `scripts/architecture/apply-estrechar-ver-equipo-0103.py apply` (backup `_backup_rp_ver_equipo_0103`).  
**Conteos (sin PII):** drift `rol_permisos` **15 → 0**; Sala RH (C) solo `gerente` post-apply; (B) delegaciones `ver_equipo` = **0**; overrides sala = **0**. Snapshots: `~/.saletse-ops/ver-equipo-ro-before-20261111-201715.json` / `…-after-…`.  
**Contexto:** Etapas 1–3 ya en prod (`c9c1dfd`). El predicado RLS / `es_gerente_asistente_o_admin` **no** se tocó. Seed API ya estrecha en re-seed; este apply cerró drift residual en BD.  
**Código seed:** `apps/api/src/modulos/admin/servicios/empresa-roles-seed.js` — re-seed **añade** extras de gerente y **quita** `*:ver_equipo` de liner/cerrador/marketing/opc.

Sala RH (referencia histórica): `b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815`.

Claves:

- `expedientes:ver_equipo`
- `ventas:ver_equipo`
- `dashboard:ver_equipo`
- `metas:ver_equipo`

Quién **conserva** `ver_equipo` vía puesto seed: solo slug `gerente` (dashboards/metas).  
Quién **ve todos** (D2): `rol_en_workspace=gerente` / slug `asistente_sala`|`asistente_empresa` / `empresa_miembros.es_admin` / superadmin — **nunca** por estas claves.

---

## 1. SELECT antes (solo lectura)

```sql
-- A) Miembros Sala RH + puesto + claves ver_equipo efectivas vía rol_permisos
with sala as (
  select 'b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815'::uuid as workspace_id
),
ve as (
  select id, clave from public.permisos
  where clave in (
    'expedientes:ver_equipo',
    'ventas:ver_equipo',
    'dashboard:ver_equipo',
    'metas:ver_equipo'
  )
)
select
  wm.usuario_id,
  wm.rol_en_workspace,
  r.slug as puesto_slug,
  array_agg(distinct p.clave order by p.clave) filter (where p.clave is not null) as ver_equipo_en_rol
from public.workspace_miembros wm
join sala s on s.workspace_id = wm.workspace_id
left join public.roles r on r.id = wm.role_id
left join public.rol_permisos rp on rp.rol_id = r.id
left join ve p on p.id = rp.permiso_id
group by wm.usuario_id, wm.rol_en_workspace, r.slug
order by r.slug nulls last, wm.usuario_id;

-- B) Delegaciones que otorgan ver_equipo en esa sala / empresa de la sala
with sala as (
  select w.id as workspace_id, w.empresa_id
  from public.workspaces w
  where w.id = 'b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815'
),
ve as (
  select id, clave from public.permisos
  where clave like '%:ver_equipo'
)
select
  d.usuario_asistente_id,
  d.alcance,
  d.sala_id,
  d.empresa_id,
  p.clave
from public.permisos_delegados d
join ve p on p.id = d.permiso_id
join sala s on (
  (d.sala_id = s.workspace_id)
  or (d.empresa_id = s.empresa_id)
)
order by d.usuario_asistente_id, p.clave;

-- C) Puestos de la empresa RH con ver_equipo en rol_permisos (matriz seed)
with emp as (
  select empresa_id from public.workspaces
  where id = 'b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815'
),
ve as (
  select id, clave from public.permisos where clave like '%:ver_equipo'
)
select r.slug, array_agg(p.clave order by p.clave) as ver_equipo
from public.roles r
join emp e on e.empresa_id = r.empresa_id
join public.rol_permisos rp on rp.rol_id = r.id
join ve p on p.id = rp.permiso_id
group by r.slug
order by r.slug;
```

Esperado post-estrecho: en (C) solo `gerente` (si aplica); en (A) miembros no excepción sin claves; asistentes pueden seguir sin `rol_permisos` (D2 por slug).

---

## 2. Apply no destructivo (cuando se autorice; **no** ejecutar ahora)

Orden sugerido:

1. Deploy API con seed reconciliable (este residual).
2. Re-seed **por empresa** vía flujo ya existente (`ensureEmpresaOperationalRoles` al gestionar empresa / bootstrap), **o** SQL acotado solo a `rol_permisos` de slugs ≠ `gerente`:

```sql
-- BORRADOR — revisar IDs con SELECT (C) antes; no aplica RLS.
delete from public.rol_permisos rp
using public.roles r, public.permisos p, public.workspaces w
where rp.rol_id = r.id
  and rp.permiso_id = p.id
  and r.empresa_id = w.empresa_id
  and w.id = 'b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815'
  and r.slug is distinct from 'gerente'
  and p.clave in (
    'expedientes:ver_equipo',
    'ventas:ver_equipo',
    'dashboard:ver_equipo',
    'metas:ver_equipo'
  );
```

3. Si (B) muestra delegaciones `ver_equipo` a no-asistentes / no gerentes: decidir caso a caso (asistente D2 no las necesita para “ver todos”). No borrar a ciegas sin dueño de producto.
4. **Prohibido** en este residual: alterar `0101`/`0102`, `user_can_access_prospect`, ni `es_gerente_asistente_o_admin`.

---

## 3. Verificación post-apply (RO)

Repetir SELECT (A)/(C). Smoke: cerrador sin asignación → no lista ajenos (ya cubierto por Etapa 1–3); gerente conserva dashboard de equipo (`dashboard:ver_equipo`).

## 4. Rollback

Re-insertar filas `rol_permisos` desde backup/select previo (guardar salida de (C) antes del delete). No revertir predicado RLS.
