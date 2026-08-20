# Diagnóstico de egress (Saletse)

**Fecha:** 2026-08-20  
**Alcance:** auditoría estática + harness de pruebas. **Ningún fix aplicado.**  
**Contexto:** el proyecto Supabase quedó restringido por cuota de egress (ancho de banda saliente). El egress relevante es el tráfico **Supabase → VPS** (queries del API) y **Supabase → navegadores** (Realtime + Storage signed URLs). El peso de `/api/v1/*` hacia el cliente es un síntoma; la factura de Supabase la dispara sobre todo el backend y Realtime.

**Producción VPS (último deploy conocido):** commit `b359436` (`ui(rh): Equipo usa participantes…`). `SYNC_SELECT` existe en `packages/shared` desde `d026356` y viaja en ese árbol → **sí está desplegado**.

---

## Resumen ejecutivo

| Impacto | Hallazgo | Por qué mueve egress |
|---|---|---|
| **Alto** | `GET/PUT /api/v1/sync` descarga **todos** los `tool_calculations.data` (JSON completo de worksheet/survey/vacaciones) de todos los expedientes del workspace | Un pull = N snapshots. Cada refresh de Realtime lo vuelve a pedir. |
| **Alto** | Dashboard Realtime (6 tablas, filtro `workspace_id`) dispara `requestSyncRefresh` → **pull completo de /sync** | Un cambio de un compañero de sala = egress de sync para cada cliente conectado. |
| **Alto** | Canales Realtime **sin filtro** (`prospects` UPDATE global, `chat_messages` INSERT global, `support_request_replies` INSERT global) | Supabase replica el row completo a todos los suscriptores. |
| **Alto** | Init de sync + `recoverLocalBlobToCloud` hacen **un segundo GET /sync** aunque el primero haya sido 200 | Duplica el payload más pesado en cada arranque de dispositivo vacío. |
| **Medio** | Listados REST de `sales`, `activities`, `calendar_entries` usan `select('*')` (sí hay `.range()`, default 50 / max 200) | Más columnas de las necesarias por página. |
| **Medio** | `GET /prospects/active` (inbox workflow) **sin paginación** + hasta 400 eventos | Crece con la sala. |
| **Bajo** | `select('*')` en get-by-id, catálogos RH, inserts `.select()` | Una fila o tablas chicas. |
| **Bajo** | Reintentos infinitos **sin backoff en `/sync`**: no hay loop ciego en `sync-api.js` | El 504 histórico se mitigó con `SYNC_SELECT`; el riesgo actual es **fan-out**, no retry storm. |

Fixes **no aplicados**. Lista priorizada al final.

---

## 1. Auditoría estática

### 1.1 `select('*')` o columnas no explícitas

Solo `apps/api/src/services/` y `apps/api/src/routes/` (+ `lib/admin` usado por admin).  
`.select()` sin columnas en **insert/update** devuelve la fila escrita (impacto bajo; se lista aparte).

#### Lecturas `select('*')` — tablas que pueden crecer

| Archivo | Línea | Tabla | Notas |
|---|---|---|---|
| `apps/api/src/services/sales-service.js` | 15 | `sales` | **Listado** paginado + join `prospects(...)`. `*` en sales. |
| `apps/api/src/services/sales-service.js` | 41 | `sales` | Get by id. |
| `apps/api/src/services/activities-service.js` | 16 | `activities` | **Listado** paginado. |
| `apps/api/src/services/activities-service.js` | 41 | `activities` | Get by id. |
| `apps/api/src/services/calendar-service.js` | 10 | `calendar_entries` | **Listado** paginado. |
| `apps/api/src/services/calendar-service.js` | 35 | `calendar_entries` | Get by id. |
| `apps/api/src/services/prospects-service.js` | 106 | `prospects` | Detalle by id. Lista usa `PROSPECT_LIST_COLUMNS`. |
| `apps/api/src/services/tools-service.js` | 26 | `tool_calculations` | Un snapshot (`maybeSingle`) **incluye `data` JSON**. |
| `apps/api/src/services/goals-service.js` | 7 | `goals` | Por `user_id` (+ year). Sin range; crecimiento mensual acotado. |
| `apps/api/src/lib/admin/data.js` | 263 | `goals` | Admin: **todas** las metas, sin range. |
| `apps/api/src/services/sharing-service.js` | 670, 765 | `prospects` | Duplicar/transferir: necesita fila completa. |
| `apps/api/src/services/prospect-participants-service.js` | 80, 111 | `prospect_workflows` | Una fila de workflow. |
| `apps/api/src/services/survey-questions-service.js` | 77 | `survey_preguntas` | Banco global (`es_global=true`). Catálogo. |
| `apps/api/src/services/network-service.js` | 109 | `user_connections` | Una conexión. |
| `apps/api/src/services/sharing-service.js` | 374, 429, 459, 539 | `share_permission_requests` / `prospect_share_invites` | Filas sueltas. |

#### Royal Holiday (`select('*')`)

| Archivo | Línea | Tabla |
|---|---|---|
| `royal-holiday-service.js` | 35–41 | `catalogo_configuracion`, `rh_bottom_line`, `rh_financiamiento`, `rh_comisiones`, `rh_regalos`, `rh_costo_administrativo`, `rh_parametros_generales` |
| | 59 | `catalogo_configuracion` |
| | 260 | `rh_ventas` + nested `rh_extra_pagos(*)`, `rh_comision_movimientos(*)` |
| | 271, 304 | `rh_extra_pagos` + `rh_ventas(*)` (jobs, con `.limit`) |
| | 334, 406 | `rh_comision_movimientos` |
| | 399 | `rh_ventas` by `sale_id` |
| | 526 | `rh_dias_descanso` — listado **sin range** |
| | 577 | `rh_ops_config` |
| | 598 | `listByFecha(table)` — `rh_premanifiesto` / `rh_linea_*` **sin range** |
| | 706 | `rh_propinas` — **sin range** |
| | 746 | `rh_okr` — **sin range** |

Catálogos RH son acotados por `catalogo_configuracion_id`. Listados ops (`dias_descanso`, `propinas`, `okr`, premanifiesto) **sí pueden crecer** con la operación.

#### `.select()` sin columnas (insert/update returning)

Impacto bajo (1 fila). Ejemplos: `prospects-service.js` 51/156, `sales-service.js` 32/57, `tools-service.js` 49, `calendar-service.js` 27/52, `activities-service.js` 31, `workspace-service.js` (create/update empresa/workspace), `royal-holiday-service.js` inserts ops.

`GET /sync` **no** usa `*`: usa `SYNC_SELECT` en `packages/shared/src/data/sync.js`.

---

### 1.2 Endpoints de arrays sin paginación (tablas grandes)

`parseLimitOffset` default **50**, máximo **200** (`apps/api/src/lib/http.js`).

| Recurso | ¿Paginado? | Evidencia |
|---|---|---|
| `GET /api/v1/prospects` | Sí | `listProspects` → `.range(offset, offset+limit-1)` + `PROSPECT_LIST_COLUMNS` |
| `GET /api/v1/sales` | Sí | `.range` pero `select('*')` |
| `GET /api/v1/activities` | Sí | `.range` + `select('*')` |
| `GET /api/v1/calendar-entries` | Sí | `.range` + `select('*')` |
| `GET /api/v1/tool-calculations` | N/A | Un registro (`tool` + `prospect_id`), no lista |
| `GET /api/v1/sync` | Pull interno por páginas de **200** hasta agotar | **Sin techo de filas.** Devuelve el blob completo. |
| `GET /api/v1/prospects/active` | **No** | `listActiveProspects`: todos los `prospect_workflows` no cancelados de la sala |
| `GET .../workflow/timeline` | **No** (por expediente) | `prospect_workflow_events` todos los eventos del prospecto |
| `GET /api/v1/goals` | **No** (acotado por user/año) | `goals.select('*')` |

`listActiveProspects` además pide `prospect_workflow_events` con `.limit(min(n*8, 400))` — acota eventos, **no** acota workflows.

Frontend `fetchAllProspectsFromApi` pagina de 100 (`prospects-persist.js`) y puede recorrer **todas** las páginas: bounded per request, unbounded total.

---

### 1.3 `tool_calculations` — JSON completo vs subconjunto

Confirmado: el snapshot `data` (jsonb) **viaja entero** en los caminos calientes.

| Camino | ¿Devuelve `data` completo? | ¿El UI necesita todo? |
|---|---|---|
| `GET /api/v1/sync` | Sí. `SYNC_SELECT.tool_calculations` = `id,user_id,workspace_id,prospect_id,tool,data,updated_at` | Lista de clientes / dashboard **no**. Worksheet/survey al abrir **sí**. |
| `GET /api/v1/tool-calculations?tool=&prospect_id=` | Sí, `select('*')` de **una** fila | Apropiado para la herramienta abierta. |
| `PUT /tool-calculations` | Devuelve la fila upserted con `data` | OK. |
| Duplicar expediente (`sharing-service.js` ~698) | `select("tool, data")` | Necesario para copiar. |
| Realtime expediente (`expediente-realtime.js`) | El payload `postgres_changes` incluye `new.data` | El colaborador en esa herramienta sí; el canal lo manda igual. |

**Conclusión:** el problema no es el GET puntual de una tool, es **embeber todos los snapshots en `/sync`**. Un worksheet RH con incentivos/regalos puede ser decenas de KB; × expedientes × tools (survey, vacaciones, worksheet, money-box…) explica picos de egress en hidratación y en cada refresh.

---

### 1.4 Canales Realtime (`apps/web/src`)

| Canal | Archivo | Tablas | Filtro | ¿Tabla completa? |
|---|---|---|---|---|
| `dashboard-data:{user}:{workspace}` | `lib/dashboard-data-realtime.js` | `prospects`, `sales`, `goals`, `calendar_entries`, `tool_calculations`, `activities` | `workspace_id=eq.{id}` o `user_id=eq.{id}` | Workspace entero (no un usuario). **Además** cada evento hace pull de `/sync`. |
| `prospect-detail:{id}` | `lib/prospect-realtime.js` | `prospects` + hijos | `id` / `prospect_id` | Filtrado. |
| `expediente:{id}` | `lib/expediente-realtime.js` | Presence + broadcast | Topic por expediente | No es postgres_changes. Heartbeat de lock cada 20 s (broadcast, no Postgres). |
| `expediente-data:{id}` | `lib/expediente-realtime.js` | `tool_calculations`, `prospects` | `prospect_id` / `id` | Filtrado. Payload incluye `data`. |
| `in-app-notifications:{user}` | `lib/in-app-notifications-realtime.js` | `direct_messages` | `recipient_id=eq.{user}` | OK. |
| | | **`chat_messages` INSERT** | **Ninguno** | **Toda la tabla.** Filtro en cliente (`sender_id`, `conversation_id`). |
| | | `user_connections` | `addressee_id` / `requester_id` | OK. |
| | | `prospect_shares` | `shared_with_id` | OK. |
| | | **`support_request_replies` INSERT** | **Ninguno** | **Toda la tabla**; luego consulta `support_requests`. |
| `group-chat:{conversationId}` | `lib/group-chat-realtime.js` | `chat_messages` | `conversation_id=eq.{id}` | OK. |
| `clients-pinned-prospects:{user}` | `components/clients/clients-page.jsx` | **`prospects` UPDATE** | **Ninguno** | **Toda la tabla.** Cliente descarta si `id` no está pinneado. |
| `admin-session-perms:{user}:{role}` | `hooks/use-admin-session.js` | `profiles`, `usuario_permisos_override`, `rol_permisos` | `id` / `usuario_id` / `rol_id` | OK. |
| `user-session:{user}` | `lib/session-cross-device.js` | broadcast + `profiles` UPDATE | `id=eq.{user}` | OK. Presence/sesión no es tabla grande. |

`useDbStore.subscribe` en `sync-provider.jsx` es Zustand, **no** Supabase.

**Idle:** si nadie escribe en Postgres, los canales filtrados deben callar. Los **sin filtro** emiten en cuanto *cualquier* usuario del proyecto inserta un chat, una reply de soporte o actualiza un prospecto → egress Realtime incluso con el usuario “quieto”.

---

### 1.5 `/api/v1/sync` (GET y PUT) y reintentos

**Backend**

- GET → `obtenerBaseDatosUsuario` → `pullAll` con `SYNC_SELECT` + páginas de 200.
- PUT → `reconcile` (solo filas propias en teamScope) + **otro** `pullAll` de respuesta.
- Columnas inexistentes: `SYNC_SELECT` en `packages/shared/src/data/sync-columns.js` **alineado al esquema**. Documentado como deployado desde `d026356`; VPS en `b359436` lo incluye.

**Frontend (`sync-api.js`)**

- Un `fetch` por llamada. **Sin retry, sin backoff, sin loop.**
- `cache: "no-store"`.

**Orquestación (`sync-provider.jsx`)**

- Debounce outbound 400 ms.
- Cooldown inbound 5 s (`RESUME_PULL_COOLDOWN_MS`).
- Si un refresh está in-flight, encola **uno** más (`pendingRefreshOptsRef`).
- Si GET /sync falla: fallback `GET /prospects` paginado + recovery (PUT posible). No reintenta /sync en bucle.
- Tras GET 200 en init, **siempre** llama `runLocalRecovery({ force: true })`.
  - Recovery vacío: si el store ya tiene clientes del pull, **vuelve a hacer GET /sync** (`recover-local-prospects.js` ~79).
  - Contrato “un solo intento” **no se cumple hoy** (2 GET en arranque limpio). No es retry de error; es trabajo duplicado.

**Otros reintentos (no /sync)**

- `session-api.js`: poll sesión cada **3–4 s** + 1 retry 900 ms. Pega `/api/v1/auth/session` (Postgres profiles), no el blob de sync.
- `lazy-retry.js`: chunks de Vite, irrelevante para egress DB.
- Presence: backoff exponencial, tope 5 min.
- Realtime dashboard: cada `postgres_changes` → `/sync` (amplificador, no retry).

**Veredicto reintentos:** no hay storm clásico “while 504 retry”. El egress duplicado más plausible es **(a)** segundo GET de recovery, **(b)** fan-out Realtime → /sync, **(c)** PUT /sync que re-pulla todo el blob.

---

### 1.6 Imágenes de soporte (Storage)

| Pieza | Estado |
|---|---|
| Bucket | `soporte-adjuntos` (privado); legacy `support-screenshots`. Migración `0035_support_attachments_retention.sql`. |
| Upload | `support-service.js` ~140: `upload(path, buffer, { contentType, upsert: false })`. **Sin `cacheControl`.** |
| Signed URL email | `EMAIL_SIGNED_TTL_SEC` = **7 días**. |
| Signed URL admin | `ADMIN_SIGNED_TTL_SEC` = **30 minutos**. |
| Bucket `cache-control` / `file_size_limit` | `file_size_limit` 5 MB. **No hay `cache_control` en el insert del bucket.** |

TTL corto del panel admin (30 min) obliga a **regenerar signed URL** al recargar el ticket; cada `createSignedUrl` es RPC a Storage (egress menor que bajar el PNG). La descarga del objeto sí cuenta egress; sin `Cache-Control` el navegador/CDN no reutiliza bien. El email con URL de 7 días evita regenerar durante esa ventana.

No se usa `getPublicUrl` para soporte (correcto: bucket privado). Branding usa público (`workspace-branding`) — otro presupuesto de egress, fuera de tickets.

---

## 2. Pruebas automatizadas

Creadas (no modifican producción). **Skip** si faltan `E2E_EMAIL` y `E2E_PASSWORD`.

| Archivo | Qué mide | Criterio de fallo |
|---|---|---|
| `e2e/egress-payload.spec.js` | Bytes de GET `/prospects`, `/sales`, `/calendar-entries`, `/sync`, un `/tool-calculations` | Bytes/fila > umbral (4–8 KB listas; 80 KB/expediente en sync; 250 KB un snapshot) |
| `e2e/egress-realtime-idle.spec.js` | Frames WebSocket en 60 s de idle | >2 frames “gordos” (>80 B) |
| `e2e/egress-sync-empty-local.spec.js` | Dispositivo sin `sts4_v1` | GET /sync ≠ 1 o status ≠ 200 o timeout ≥25 s |
| `e2e/egress-payload.spec.js` (estático) | Fuente `SYNC_SELECT` | Regresión a `*` |
| `scripts/audit-egress.js` | Tabla consola: bytes, filas, bytes/fila | Manual |

Umbrales (`e2e/helpers/egress.js`):

- prospects lista: **4096 B/fila**
- sales lista: **8192 B/fila** (`select('*')` + join; más holgado)
- calendar: **4096 B/fila**
- tool snapshot: **250_000 B**
- sync: **80_000 B/expediente**

Correr:

```bash
# Solo el assert estático de SYNC_SELECT (no necesita login)
npx playwright test e2e/egress-payload.spec.js -g "SYNC_SELECT"

# Medición real (dev con Supabase, o PLAYWRIGHT_SKIP_SERVERS=1 + servers ya arriba)
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e:egress

# Pico futuro (contra VPS o local)
EGRESS_BASE_URL=http://187.77.14.148 E2E_EMAIL=... E2E_PASSWORD=... npm run audit:egress
```

Playwright por defecto **vacía** las keys de Supabase en `webServer` (`playwright.config.js`). Los tests de red reales requieren `PLAYWRIGHT_SKIP_SERVERS=1` y `npm run dev` / `dev:api` con `.env.local`, o `EGRESS_BASE_URL` hacia un entorno ya autenticable.

**Resultados de esta corrida:** el test estático de `SYNC_SELECT` se puede ejecutar sin credenciales. Los de payload/Realtime/sync vacío quedan **pendientes de credenciales** (no se inventan números). El test de local vacío **se espera que falle hoy** si corre: recovery hace un segundo GET (hallazgo 1.5). Eso es señal, no flaky.

Dataset “100 prospects”: no se siembran filas (evitar basura en prod). Con `EGRESS_EXPECT_MIN_ROWS=100` el test de payload exige al menos 100 filas en la página pedida.

---

## 3. Fixes recomendados (prioridad, no aplicados)

1. **No meter `tool_calculations.data` en `/sync`.** Pull de metadatos (`id, prospect_id, tool, updated_at`) + GET puntual al abrir la tool. Mayor ahorro probable de egress API.
2. **Dashboard Realtime: invalidar store local o refetch de la tabla tocada**, no `GET /sync` completo. Debounce ya existe (400 ms); el costo es el payload.
3. **Filtros Realtime faltantes:**  
   - `chat_messages`: `recipient` no existe; usar canal por conversación o filtro que RLS permita (`conversation_id` in membership — si Realtime no soporta `in`, un canal por conversación abierta).  
   - `clients-page`: `filter: id=eq.{pinnedId}` (N canales) o un canal `prospect_shares` del usuario.  
   - `support_request_replies`: filtro por `ticket_id` de tickets del usuario, o tabla `user_id`.
4. **Quitar el segundo GET /sync de `recoverLocalBlobToCloud` cuando el init acaba de pullar 200.** Un intento por arranque.
5. **Listados `sales` / `activities` / `calendar_entries`:** columnas tipo `SALE_LIST_COLUMNS` / `ACTIVITY_LIST_COLUMNS` (ya definidas en `sync-columns.js` y **no usadas** en esos listados).
6. **Paginación** en `GET /prospects/active` y listados RH ops (`dias_descanso`, `propinas`, `okr`).
7. **Storage soporte:** `cacheControl: 'max-age=86400'` en upload; valorar TTL admin > 30 min o URL relativa + proxy con cache.
8. **PUT /sync:** no devolver `pullAll` entero si el cliente solo necesita ack; o devolver delta.
9. **Goals admin** `select('*')` sin range: columnas mínimas + límite.

Esperar confirmación antes de tocar queries, canales o retries.

---

## 4. Fixes aplicados (2026-08-20)

Los 5 puntos priorizados se implementaron **uno a uno**, con e2e estáticos tras cada cambio y **un commit por paso** (rollback individual). No se tocó esquema ni migraciones.

| Paso | Commit | Qué cambió |
|---|---|---|
| 1 | `6e3a81a` | `/sync` omite `tool_calculations.data`. Metadata en pull; JSON en `GET /api/v1/tool-calculations/:id` (y query `?tool=&prospect_id=`) al abrir la herramienta. |
| 2 | `5996781` | Dashboard Realtime ya no llama `requestSyncRefresh` / `/sync`. Invalida solo la tabla del evento (`applyDashboardTableChange`). |
| 3 | `15ae2e1` | Filtros Realtime: pins `id=eq.{id}` (conserva expedientes compartidos de otra sala); `chat_messages` `conversation_id=in.(membresías)`; `support_request_replies` `ticket_id=in.(tickets del usuario)`. Soporte sigue siendo de **plataforma** (no `workspace_id`: esa columna no existe en replies). |
| 4 | `eabb027` | Init con blob local vacío **no** dispara recovery ni un segundo GET `/sync`. Si hay blob local, recovery reusa el `cloudDb` del primer pull. |
| 5 | `a851adf` | Listados y get-by-id de `sales` / `activities` / `calendar_entries` usan `SALE_LIST_COLUMNS` / `ACTIVITY_LIST_COLUMNS` / `CALENDAR_LIST_COLUMNS` en lugar de `select('*')`. |

### Antes / después (estático)

Las pruebas de red (`e2e/egress-*.spec.js` con login y `npm run audit:egress`) **no midieron bytes reales**: no hay `E2E_EMAIL` / `E2E_PASSWORD` en el entorno de esta corrida. Lo que sí se puede afirmar sin credenciales:

| Recurso | Antes (diagnóstico) | Después |
|---|---|---|
| `SYNC_SELECT.tool_calculations` | `…,tool,data,updated_at` | `…,tool,updated_at` (sin JSON) |
| Payload `/sync` por expediente | Incluía worksheets/survey/vacaciones completos | Stubs `{ _id, _updatedAt }`; JSON bajo demanda |
| Dashboard `postgres_changes` | Fan-out → `GET /sync` completo | Refresh solo de la tabla tocada; idle ~0 frames (contrato del spec; red skip sin credenciales) |
| `prospects` UPDATE (Clientes) | Sin filtro (tabla entera) | Un `.on` por pin `id=eq.{id}` |
| `chat_messages` INSERT | Sin filtro | `conversation_id=in.(…)` de `chat_members` activos; dummy uuid si no hay conversaciones |
| `support_request_replies` INSERT | Sin filtro (global de plataforma) | `ticket_id=in.(…)` de `support_requests` del usuario. **No** se filtró por workspace: rompería avisos al reportero. Admin de plataforma no usa este canal para tickets ajenos (el handler ya exigía `ticket.user_id === userId`). |
| Init local vacío | GET `/sync` + recovery → segundo GET | Un GET; recovery omitido si no había blob/outbox |
| `GET /sales` | `select('*')` + join prospects | `SALE_LIST_COLUMNS` + join de nombre/código |
| `GET /activities` | `select('*')` | `ACTIVITY_LIST_COLUMNS` |
| `GET /calendar-entries` | `select('*')` | `CALENDAR_LIST_COLUMNS` (= `SYNC_SELECT.calendar_entries`) |

### `npm run audit:egress` (después)

```
Fecha: 2026-08-20
Comando: npm run audit:egress
Resultado: Falta E2E_EMAIL y E2E_PASSWORD (o EGRESS_EMAIL / EGRESS_PASSWORD).
Bytes REST: no medidos (sin login).
```

Correr de nuevo contra local o VPS cuando existan credenciales:

```bash
E2E_EMAIL=... E2E_PASSWORD=... npm run audit:egress
E2E_EMAIL=... E2E_PASSWORD=... npm run test:e2e:egress
```

Comparar sobre todo `GET /api/v1/sync` (bytes totales y bytes/expediente) frente a un pull anterior a `6e3a81a`. El ahorro dominante es omitir `tool_calculations.data` y dejar de re-pullar `/sync` en cada evento Realtime.
