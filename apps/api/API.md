# API REST — SalesApp

API versionada montada en `/api/v1`. Backend Express + Node.js (JavaScript puro).

## Convenciones

- **Versionado**: todas las rutas viven bajo `/api/v1/...`. Cambios incompatibles se publicarán como `/api/v2`.
- **Recursos**: sustantivos en plural (`/prospects`, `/sales`, `/workspaces/:id/members`). Sin verbos en la URL; las transiciones de estado se modelan como sub-recursos de acción (`POST /prospects/:id/workflow/advance`).
- **Autenticación**: `Authorization: Bearer <supabase_access_token>` o cookies de sesión web. Toda ruta (salvo `GET /api/v1/`) valida sesión en el backend.
- **Autorización**: cada servicio valida permisos/alcance del actor (workspace, empresa) antes de tocar datos. Las políticas RLS de Supabase son la última línea de defensa.
- **Respuestas**: éxito envuelve el payload en `{ "data": ... }`; error responde `{ "error": "mensaje" }`.
- **Códigos de estado**: `200` OK, `201` creado, `400` input inválido, `401` sin sesión, `403` sin permiso, `404` no encontrado, `409` conflicto de estado, `429` rate limit, `500` error interno.
- **Catálogo vivo**: `GET /api/v1/` devuelve el índice de endpoints principal (autodescriptivo).

## Rate limiting

Ventana fija en memoria por IP (`apps/api/src/middleware/rate-limit.js`), aplicado a endpoints sensibles:

| Endpoint | Límite |
|---|---|
| `GET /admin/tenant/empresas/:empresaId/users/search` | 30 req/min |
| `GET /network/users/search` | 30 req/min |
| `POST /workspace/invite` | 20 req/min |

Al excederse responde `429` con header `Retry-After`.

## Módulos

| Módulo | Base | Capa de servicio |
|---|---|---|
| Sesión y perfil | `/auth/session`, `/profile` | `session-service`, `profile-service` |
| Prospectos (expedientes) | `/prospects` | `prospects-service` |
| Ventas | `/sales` | `sales-service` |
| Calendario | `/calendar-entries` | `calendar-service` |
| Metas | `/goals` | `goals-service` |
| Actividades | `/activities` | `activities-service` |
| Herramientas (Survey, Proyección, Money Box…) | `/tool-calculations` | `tools-service` |
| Red y mensajes | `/network/*`, `/messages/*` | `network-service`, `messages-service` |
| Notificaciones | `/notifications/*` | `push-notifications-service` |
| Workspaces | `/workspace/*`, `/auth/workspace` | `workspace-service`, `workspace-ops-service` |
| Workflow comercial | `/workflow/inbox`, `/prospects/:id/workflow/*` | `workflow-service` |
| Admin plataforma | `/admin/*` | `admin-users-service`, `roles-service`, `flags-service`… |
| Admin tenant (empresa/sala) | `/admin/tenant/*`, `/admin/workspaces/*` | `tenant-admin-service`, `tenant-rbac-service` |

## Admin tenant (empresa y salas)

Autorización: Super Admin o Admin activo de la empresa (`requireEmpresaAdmin`, en `apps/api/src/lib/tenant-access.js`). Un Admin de Empresa nunca puede operar sobre otra empresa (403).

| Método y ruta | Propósito |
|---|---|
| `GET /admin/tenant/context` | Contexto jerárquico del actor (scope, empresas, salas, permisos). |
| `GET /admin/tenant/empresas/:empresaId/overview` | KPIs de la empresa (salas, miembros, expedientes, ventas). |
| `PATCH /admin/tenant/empresas/:empresaId` | Branding y plan de la empresa. |
| `GET /admin/tenant/empresas/:empresaId/users/search?q=` | Busca usuarios asignables por nombre o correo (`ILIKE` sobre ambos). Solo devuelve usuarios de la misma empresa o sin organización; máx. 10 resultados. |
| `GET\|POST /admin/tenant/empresas/:empresaId/admins` | Lista / añade administradores de empresa (`usuario_id` o `email`, `role_id` opcional). |
| `DELETE /admin/tenant/empresas/:empresaId/admins/:userId` | Retira un admin (409 si es el último). |
| `GET\|POST /admin/tenant/empresas/:empresaId/salas` | Lista / crea Salas de Ventas (`nombre`, `gerente_id`). |
| `GET\|POST /admin/tenant/empresas/:empresaId/roles` | Puestos configurables de la empresa (con `permission_keys`, `paquete_id`). |
| `PATCH\|DELETE /admin/tenant/empresas/:empresaId/roles/:roleId` | Edita / elimina un puesto (403 si es de sistema, 409 si está asignado). |
| `GET\|POST /admin/tenant/empresas/:empresaId/packages` | Paquetes de Acceso (módulos vía `flag_keys`). |
| `PATCH\|DELETE /admin/tenant/empresas/:empresaId/packages/:packageId` | Edita / elimina un paquete. |
| `GET /admin/tenant/empresas/:empresaId/flags` | Catálogo de módulos (flags) disponibles. |
| `GET /admin/tenant/empresas/:empresaId/permissions` | Catálogo de permisos. |
| `POST /admin/workspaces/:workspaceId/members` | Añade miembro a una sala (`usuario_id` o `email`, `role_id` opcional). |
| `PATCH /admin/workspaces/:workspaceId/members/:userId/role` | Cambia el puesto de un miembro. |
| `DELETE /admin/workspaces/:workspaceId/members/:userId` | Retira a un miembro de la sala. |
| `PATCH /admin/workspaces/:workspaceId/gerente` | Designa gerente de la sala. |

### Ejemplo: búsqueda de usuarios asignables

```
GET /api/v1/admin/tenant/empresas/:empresaId/users/search?q=edu
→ 200 { "data": [ { "id": "…", "full_name": "Eduardo", "email": "eduardolalito99@hotmail.com", "avatar_url": null, "en_empresa": true } ] }
→ 200 { "data": [] }          (sin coincidencias dentro del alcance)
→ 400 (q > 80 caracteres) · 403 (no es admin de esa empresa) · 429 (rate limit)
```

## Workflow comercial

Autorización por capacidades resueltas en `workflow-service` (permisos de workspace + asignaciones). Los RPC de transición solo aceptan `service_role`: el cliente nunca puede transicionar directo contra la base.

| Método y ruta | Propósito |
|---|---|
| `GET /workflow/inbox` | Expedientes que requieren acción del actor según su rol. |
| `GET /prospects/:id/workflow` | Estado actual + capacidades del actor. |
| `GET /prospects/:id/workflow/timeline` | Historial append-only de eventos. |
| `POST /prospects/:id/workflow/advance` | Avanza a la siguiente etapa. |
| `POST /prospects/:id/workflow/send-review` | Envía al gerente. |
| `POST /prospects/:id/workflow/review` | Gerente aprueba o regresa. |
| `POST /prospects/:id/workflow/assign-closer` | Asigna cerrador. |

## Arquitectura por capas

- **Rutas/controladores** (`src/routes/`): validan sesión, parsean input y delegan; no acceden a Supabase directamente.
- **Servicios** (`src/services/`): lógica de negocio y acceso a datos; lanzan `ServiceError(mensaje, status)`.
- **Lib** (`src/lib/`): helpers transversales (`tenant-access.js` para autorización tenant, `workspace-scope.js` para permisos/flags de workspace, `http.js` para respuestas).
- **Frontend**: los componentes de UI consumen servicios de API centralizados (`apps/web/src/lib/*-api.js`, `adminJson`); el cliente Supabase directo queda confinado a `apps/web/src/lib/` (sync offline y realtime) hasta completar la migración.

## Migración incremental (estado)

1. **Migrado a REST + capas**: prospectos, ventas, metas, actividades, herramientas, workspaces, workflow, admin plataforma, admin tenant, red/mensajes/notificaciones.
2. **Pendiente de migrar** (aún usa el cliente Supabase desde `apps/web/src/lib/`): sincronización offline (`lib/data/sync.ts`), realtime de notificaciones/chat (por naturaleza usa el socket de Supabase), helpers de sesión. Se migrarán módulo por módulo manteniendo compatibilidad.

Mantener este documento actualizado al añadir o cambiar endpoints.
