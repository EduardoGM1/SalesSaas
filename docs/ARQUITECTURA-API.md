# Arquitectura de `apps/api`

La API REST vive en `apps/api` y **no se mezcla con** `apps/web`. Este documento fija las cuatro capas internas **antes** de mover código. El contrato HTTP (rutas, status, `{ data }` / `{ error }`, rate limits, fail-closed de workspace) no cambia con el refactor.

## Capas

```
HTTP  →  Rutas  →  Controladores  →  Servicios  →  Repositorios  →  Postgres/Supabase
                      ↑ middleware (auth, rate limit)
```

### 1. Rutas (`src/routes/`)

**Solo** definición de endpoint + middleware + delegación.

- Qué va aquí: `router.get/post/...`, `rateLimit`, `requireAuth` / `rutaAutenticada`, `authorizeCron`, montaje de sub-routers.
- Qué **no** va aquí: queries, fórmulas, resolución de permisos, `guardRhRequest`, ensamblado de payloads de negocio.
- Un archivo por recurso/dominio. `v1.js` es el agregador (catálogo `GET /api/v1` + `router.use`).
- `/auth` (cookies de sesión) sigue en `routes/auth.js` montado desde `app.js`, no bajo `/api/v1`.

El envelope `{ data }` / `{ error }` lo aplica `runService` (`routes/route-utils.js`). Los controladores **no** escriben `res.json` salvo excepciones documentadas (cookies Auth, cron 401, geo síncrono, session GET que re-lanza errores no-`ServiceError`).

### 2. Controladores (`src/controllers/`)

Reciben el contexto ya autenticado (`auth` = `{ supabase, userId, … }`), extraen query/params/body, invocan **un** servicio (o una orquestación corta de guards + servicio) y **devuelven** el resultado. Cero acceso a tablas.

- Validación de forma HTTP: UUID en params, `parseLimitOffset`, body JSON, `assertEmpresaIdMatch` (el id de path y el del body deben coincidir).
- Autorización de módulo que hoy vive en la ruta (p. ej. `guardRhRequest`) se **reubica** aquí, no se duplica en el service.
- `requireWorkspacePermission` / `requireWorkspaceFlag` **siguen en el service** cuando ya estaban ahí (fail-closed junto a la query). No se copian al controller.

Términos técnicos (`request`, `middleware`, `controller`) en inglés. Nombres de acciones de dominio en español (`listarMetas`, `crearExpediente`).

### 3. Servicios (`src/services/`)

Lógica de negocio pura sobre datos ya extraídos: permisos de workspace, flags, fórmulas RH, merge de perfil, sync. Reciben `supabase` + `userId` + inputs. Lanzan `ServiceError`. No leen `req`/`res`.

**No se toca** en este refactor (solo se llama desde otro archivo):

- Fórmula de permisos rol ∪ overrides y fail-closed de `requireWorkspacePermission` / `requireWorkspaceFlag` (`lib/workspace-scope.js`).
- Cálculo de comisiones RH / Extra DP / `monto_contrato` vs `monto_venta`.
- Rate limiting (`middleware/rate-limit.js`, `lib/auth-rate-limits.js`).

### 4. Acceso a datos (`src/repositories/`)

CRUD y queries: `.from()`, `.rpc()` de persistencia, mapeo de error de PostgREST → `ServiceError`. Sin reglas de negocio.

- **Formalizado** en módulos CRUD (metas, actividades, ventas, agenda, perfil).
- **Embebido en el service** (sin mover queries) en módulos densos donde extraer el repo sería un rewrite de fórmulas: Royal Holiday, sync, flags RPC, survey overrides. El controller de esos módulos **igual** no toca Supabase.

`scopeByWorkspace` es un predicado de query fail-closed (403 si no hay workspace). Puede vivir en el repositorio como constricción SQL; la **autorización** (`requireWorkspacePermission`) permanece en el service.

## Qué no entra en el MVC de dominio

| Pieza | Dónde queda | Por qué |
|---|---|---|
| `middleware/auth.js`, `admin-auth.js`, `rate-limit.js` | middleware | No es un recurso |
| `lib/workspace-scope.js`, `workspace-permission-rpc.js` | lib (seguridad) | Fail-closed compartido; no “limpiar” |
| `lib/http.js`, `service-error.js` | lib | Envelope HTTP |
| Nginx CSP / headers | `deploy/` | Fuera de Node |
| Guardia anti-Cloud del SPA | `scripts/spa_selfhosted_guard.py` | Deploy web, no API |

## Orden de migración

De menor a mayor riesgo. Tras cada fase: `npm run test:security -w @salesapp/api`.

| Fase | Módulos | Repo formal | Notas de seguridad |
|---|---|---|---|
| 0 | Documento + `rutaAutenticada` + contrato 401/503 | — | Sin cambio de rutas |
| 1 | `goals`, `activities` | Sí | `metas:ver_editar_propias`, `expedientes:*` siguen en el service |
| 2 | `sales`, `calendar-entries`, `geo`, `profile`, `reminders`, `exchange-rates` | CRUD sí; geo/fx catálogo | Permisos de ventas/agenda intactos |
| 3 | `tool-calculations`, `survey/questions-config` | Embebido | `requireWorkspaceFlag` intacto |
| 4 | `session`, `workspace`, `custom-modules`, `network`, `messages`, `notifications`, `support`, `shares` | Embebido | Rate limits de search/invite en la **ruta** |
| 5 | `prospects`, `workflow`, `chat`, `sync` | Embebido | Sync al final de esta fase; controller ya existía |
| 6 | `auth` (login/register/forgot) | Service de sesión cookie | Rate limit **solo en la ruta** |
| 7 | `admin/*` partido por dominio | Embebido | `adminAuth` / Superadmin / `requireEmpresaAdmin` iguales |
| 8 | `royal-holiday/*` + crons RH | Embebido | `guardRhRequest` + `assertEmpresaIdMatch` en controller |

Producción: **no desplegar** este refactor sin pasar staging/local. El tamaño del cambio es de estructura, no de contrato.

## Estado de esta entrega

Rutas v1 partidas por recurso + controladores en todas las fases. `admin.js` sigue mezclando tenant y plataforma en un archivo; los guards viven en `admin-helpers.js` (mismas reglas).

| Suite | Resultado |
|---|---|
| `npm run test:security -w @salesapp/api` (43 tests, incluye fail-closed flags/permisos, rate limit, contrato 401/503) | **PASS** |
| Playwright `e2e/smoke.spec.js` — `GET /api/v1` y geo vía proxy | **PASS** |
| Playwright `e2e/smoke.spec.js` — UI login/register/redirect | **FAIL** (selectores UI: botón es «Iniciar sesión» no «Entrar»; `/settings` no redirige — no es contrato API) |
| Playwright egress estático (columnas REST, realtime) | **PASS** (el test de `select('*')` ahora lee `repositories/`) |

## Casos que no son solo reubicación (explícitos)

Ninguno cambia el contrato HTTP ni fórmulas.

1. **Alias en español** en services CRUD (`listarMetas` + `listGoals`, etc.). Misma función.
2. **`guardRhRequest` / `assertEmpresaIdMatch`** salieron de la ruta al controller RH. Mismas llamadas, mismo fail-closed.
3. Validación `with` en mensajes: de `apiError` en la ruta a `ServiceError` en el controller (mismo 400 y mensaje).
4. Test e2e estático de egress: apunta a `repositories/*` porque ahí quedó el `select` de columnas.

## Excepciones de envelope (comportamiento actual, no “arreglar”)

1. `GET /api/v1/auth/session` — `json(res, payload)` y re-throw si no es `ServiceError`.
2. `GET /api/v1/geo/countries` — respuesta síncrona `{ data }`.
3. `GET /api/v1/exchange-rates` — 502 si falla el proveedor FX.
4. `GET /api/v1/notifications/config` — 503 si falta OneSignal.
5. Crons — 401 `"Unauthorized"` si `CRON_SECRET` no coincide (inglés literal actual).
6. `POST /auth/signout` — siempre `{ ok: true }` aunque falle el backend.
7. `apiError(res, 400, "fecha y workspaceId requeridos.")` en premanifiesto día/cupos — firma histórica invertida; **no se “corrige”** en este refactor.

## Relación con el frontend

`apps/web` consume `/api/v1` y `/auth` vía mismo origen (Nginx). Ningún controller de API importa componentes React. El namespacing `sts4_v1` es solo cliente.
