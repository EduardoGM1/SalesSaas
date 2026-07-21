# Precedencia RBAC, módulos y grupos

Documento de equipo (espejo de la rule local `.cursor/rules/rbac-modulos-precedencia.mdc`).

## Precedencia de permisos (única)

1. Override de **usuario** (`usuario_permisos_override`) — deny/grant  
2. Override de **grupo** (reservado / `group_overrides`)  
3. Permisos del **rol** (`rol_permisos`)  
4. Default: denegar  

Solo claves con `permisos.permite_override = true` admiten override individual.

Fuente de verdad: `resolve_user_permission_keys` / `resolveUserPermissions` → `permission_keys` en sesión.  
`admin_permissions` y `user_permissions` son proyecciones legacy (sync).

## Módulos

Tablas `modulos` + `modulo_activacion`.  
Precedencia: **usuario > grupo > organización > activo_por_default**.  
Hook: `useModuloAccess(clave)`. Plan PRO (`requiere_plan`) es requisito aparte.

## Gerente / grupos (MVP)

`organizaciones`, `grupos`, `grupo_miembros`.  
RLS SELECT vía `is_gerente_of(owner_id)`.  
API: `GET /api/v1/prospects?scope=team`, `GET /api/v1/team/members`.  
Escritura sigue siendo del owner. Sync offline sigue por usuario.

## Migración

Aplicar `supabase/migrations/0050_rbac_modulos_grupos.sql` en Supabase.
