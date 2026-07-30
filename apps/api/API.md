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
| Configuración de Survey | `GET\|PUT /survey/questions-config` | `survey-questions-service` |
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

## Participantes del expediente (sin pipeline)

No hay etapas ni traspasos. Vendedor, Gerente y Cerrador colaboran sobre el mismo
registro (`prospect_workflows` = participantes; `etapa_actual` está deprecada).

| Método y ruta | Propósito |
|---|---|
| `GET /prospects/active` | Expedientes activos de la sala según rol (sin filtrar por etapa). |
| `GET /workflow/inbox` | Alias de compatibilidad → mismos datos que `/prospects/active`. |
| `GET /prospects/:id/participants` | Participantes + historial de eventos + capacidades. |
| `GET /prospects/:id/workflow` | Alias de compatibilidad → participants. |
| `POST /prospects/:id/participants/assign-closer` | Asigna/reasigna Cerrador (sin cambiar etapa). |
| `POST /prospects/:id/workflow/assign-closer` | Alias de compatibilidad. |
| `POST …/advance\|send-review\|review` | **410 Gone** — pipeline eliminado. |

## Chat grupal por expediente

Conversaciones multiparte en la sala (vendedor + gerente + cerrador). UI en
`/messages?scope=team` con el nombre de la sala.

| Método y ruta | Propósito |
|---|---|
| `GET /chat/conversations` | Chats de expediente del workspace activo. |
| `GET /chat/conversations/:id` | Detalle + miembros. |
| `GET /chat/conversations/:id/messages` | Mensajes del hilo. |
| `POST /chat/conversations/:id/messages` | Envía texto o `prospect_card`. |
| `POST /prospects/:id/chat` | Crea/sincroniza chat y devuelve `{ id }`. |

Miembros se sincronizan al crear/transferir el expediente y al asignar/reasignar Cerrador.

## Transferencia de expedientes

El expediente es la única fuente de verdad: la transferencia mueve el mismo registro
(mismo `id`), con sus herramientas, ventas, actividades y agenda; nunca se crean copias.

| Método y ruta | Propósito |
|---|---|
| `GET /prospects/:id/transfer-targets?mode=transfer\|duplicate` | Destinos válidos con razón de bloqueo. |
| `POST /prospects/:id/transfer` | Transfiere el expediente. `{ target_workspace_id }`. |
| `POST /prospects/:id/duplicate` | Copia el expediente (solo dentro de la misma frontera). |

Reglas de movimiento:

- **Personal → Sala de Ventas**: permitido solo al dueño, definitivo. Se ejecuta vía RPC
  `transfer_prospect_to_sala` (`service_role`, migración 0057): mueve hijos, inicializa el
  workflow de la sala y registra el evento `transferido` en el historial inmutable.
- **Sala → Personal**: prohibido (403).
- **Empresa A → Empresa B**: prohibido (`workspace_boundary_ok`).
- **Sala → Sala (misma empresa)**: permitido (comportamiento previo).
- Eliminar expedientes dentro de una sala queda reservado al gerente (o admin de empresa
  vía RLS); el historial de auditoría nunca se pierde por un borrado del vendedor.

## Arquitectura por capas

- **Rutas/controladores** (`src/routes/`): validan sesión, parsean input y delegan; no acceden a Supabase directamente.
- **Servicios** (`src/services/`): lógica de negocio y acceso a datos; lanzan `ServiceError(mensaje, status)`.
- **Lib** (`src/lib/`): helpers transversales (`tenant-access.js` para autorización tenant, `workspace-scope.js` para permisos/flags de workspace, `http.js` para respuestas).
- **Frontend**: los componentes de UI consumen servicios de API centralizados (`apps/web/src/lib/*-api.js`, `adminJson`); el cliente Supabase directo queda confinado a `apps/web/src/lib/` (sync offline y realtime) hasta completar la migración.

## Migración incremental (estado)

1. **Migrado a REST + capas**: prospectos, ventas, metas, actividades, herramientas, workspaces, workflow, admin plataforma, admin tenant, red/mensajes/notificaciones.
2. **Migrado en esta fase**: lectura de configuración de Survey (`GET /survey/questions-config`); eliminado el código muerto heredado de Next.js en `apps/web/src/lib/` (data layer server-side, guards y validadores sin uso).
3. **Uso legítimo restante del cliente Supabase en el frontend** (confinado a `apps/web/src/lib/`): autenticación/sesión (`session-api`, `session-cross-device`) y canales realtime (chat, notificaciones, presencia), que por naturaleza usan el socket de Supabase protegido por RLS.

Mantener este documento actualizado al añadir o cambiar endpoints.
