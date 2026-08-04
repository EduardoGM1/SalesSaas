# Limpieza / diagnóstico: “roles duplicados” en Admin → Roles

**Fecha:** 2026-08-03  
**Migración relacionada:** `0066_admin_list_roles_platform_only.sql`

## Causa raíz (no eran filas basura globales)

`admin_list_roles()` listaba **todas** las filas de `public.roles`, incluidos puestos **tenant** (`empresa_id` seteado) creados por el seed por empresa (`empresa-roles-seed.js` / migraciones 0056+0065).

Con 3 empresas, la UI de plataforma mostraba Liner×3, Gerente×2, etc. Cada fila es un puesto **válido y distinto** por empresa (permite renombrar / paquetes por compañía).

## Qué NO se fusionó ni se borró

| Capa | Roles | Acción |
|------|--------|--------|
| Plataforma (`empresa_id IS NULL`) | Superadmin, Admin, Vendedor, Soporte | Se mantienen (únicos) |
| Tenant (por empresa) | Gerente, Vendedor, Liner, Cerrador (+ customs) | Se mantienen; se dejan de listar en Panel → Roles |

No hubo reasignación de `workspace_miembros.role_id` ni borrado de puestos tenant: **no hacía falta** para corregir el bug visual.

## Fix aplicado

1. RPC `admin_list_roles` filtra `empresa_id IS NULL`.
2. API `listRoles` (full + lite) filtra plataforma.
3. UI Roles agrupa Sistema vs Personalizados.

## Seed

El seed por empresa **sigue siendo correcto e idempotente** (`WHERE NOT EXISTS` / upsert por `(empresa_id, slug)`).  
Los puestos operativos **no** deben ser globales únicos: el Admin de empresa renombra Liner/Cerrador por tenant.

## Vendedor / Soporte (confirmado 2026-08-03)

| Rol | Decisión | Motivo |
|-----|----------|--------|
| **Soporte** | **Mantener** (plataforma) | Tickets/ayuda; no es puesto de sala |
| **Vendedor** (plataforma) | **Mantener** | Rol default de perfiles personales / legacy |
| **Vendedor** (tenant) | **Mantener** | Puesto de sala junto a Liner/Cerrador |

No se migra ni elimina Vendedor-tenant en este pase.
