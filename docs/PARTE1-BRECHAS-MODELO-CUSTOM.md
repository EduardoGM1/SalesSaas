# Parte 1 — Brechas del modelo actual (módulos custom / roles / API)

**Fecha:** 2026-08-05  
**Base:** `docs/INFORMACION-TECNICA-SISTEMA.md` + auditoría de código real

---

## 1. Feature flags / paquetes — cómo se define un módulo hoy

### Tablas (infraestructura existente)

| Tabla | Rol |
|---|---|
| `flags` | Catálogo global: `clave`, `nombre_visible`, `flag_padre`, `default_global` |
| `flag_reglas` | Excepciones por `alcance` (`rol` \| `usuario` \| `membresia`) |
| `paquetes_acceso` | Paquete **por empresa** (`empresa_id` NOT NULL) |
| `paquete_flags` | Flags activos dentro de un paquete |
| `roles` | Plataforma (`empresa_id IS NULL`) o tenant (`empresa_id` set) + `paquete_id` |

### Cómo se activa un módulo por empresa

1. Superadmin define flags en catálogo global (`flags`).
2. Admin de empresa crea/edita `paquetes_acceso` y marca `paquete_flags`.
3. Asigna el paquete a un rol tenant (`roles.paquete_id`).
4. RPC `resolver_flag` / `resolver_workspace_flag` / `resolver_all_flags` combina default + reglas + paquete.

### ¿Soporta “módulo exclusivo de una sola empresa”?

**Hoy: NO de forma nativa.**

- `flags.clave` es **UNIQUE global** — todo módulo entra al catálogo compartido entre tenants.
- Una empresa solo puede **activar/desactivar** flags del catálogo vía su paquete; no puede **crear** un flag que otras empresas no vean en el catálogo admin.
- `GET /admin/tenant/empresas/:id/flags` lista el catálogo completo (no filtrado por empresa).

**Brecha:** falta `flags.tipo` (`estandar`|`custom`) + `flags.empresa_id` nullable + unicidad `(empresa_id, clave)` para custom.

---

## 2. Roles — “solo 4 roles” en Panel → Roles

**No es pérdida de datos.** Es diseño explícito:

| Evidencia | Detalle |
|---|---|
| Migración `0066_admin_list_roles_platform_only.sql` | RPC `admin_list_roles` filtra `WHERE empresa_id IS NULL` |
| `roles-service.listRoles` | Defensa extra: `rows.filter((r) => !r.empresa_id)` |
| Comentario en `empresa-roles-seed.js` | “Panel → Roles solo lista roles con empresa_id IS NULL” |
| UI tenant | `tenant-company-administration.jsx` → `GET tenant/empresas/:id/roles` |

Los 4 roles visibles (Superadmin / Admin / Soporte / Vendedor) son **plataforma**.  
Gerente / Liner / Cerrador / Admin de Empresa viven como **roles tenant** por `empresa_id` y se gestionan en **Empresas → Acceso**, no en Panel → Roles.

**Brecha UX (no de datos):** la pantalla “Roles y permisos” no aclara que solo muestra plataforma; un admin puede creer que “se perdieron” los puestos de sala.

---

## 3. ¿Qué tan REST es la API vs `API.md`?

| Aspecto | Documentado | Real |
|---|---|---|
| Recursos plurales bajo `/api/v1` | Sí | Sí (`/prospects`, `/sales`, …) |
| Thin router + fat service | Implícito | Sí — **sin capa Controllers** |
| Acciones como sub-recursos | Sí | Sí (`/workflow/advance`, `/transfer`) |
| Sync blob único | Mencionado en docs técnicos | `GET\|PUT /sync` (no puramente REST por recurso) |
| Auth Bearer/cookies | Sí | Sí |
| Índice `GET /api/v1/` | Sí | Sí |

**Brecha:** API.md describe bien el contrato HTTP, pero el código aún mezcla orquestación HTTP en `routes/v1.js` (auth + parse + `runService`) sin `controllers/`. El sync bulk es el mayor desvío del modelo REST “puro”.

---

## 4. Reporte de brechas — módulos 100% custom por tenant

Sobre lo **ya existente**, falta exactamente:

| # | Brecha | Esfuerzo |
|---|---|---|
| B1 | `flags.tipo` + `flags.empresa_id` + constraint unique parcial | Migración SQL |
| B2 | Filtrar catálogo tenant: estándar globales + custom de su empresa | Service + RPC resolve |
| B3 | Tabla genérica `modulo_custom_datos` (JSONB + GIN) | Migración + service CRUD |
| B4 | Esquema declarativo UI (`schema` JSON en flag o tabla hermana) | Convención + renderer frontend |
| B5 | Puntos de extensión fijos (tab expediente, bloque dashboard) | Registry frontend |
| B6 | Admin UI para crear módulo custom sin migración | Página tenant |
| B7 | Aclarar Panel Roles vs Roles de empresa (copy UX) | UI copy |

**No hace falta** partir de cero: paquetes, reglas, resolución de flags y RBAC tenant ya cubren activación/asignación.
