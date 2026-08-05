# Diagnóstico: datos solo en LocalStorage / no visibles cross-device

**Fecha:** 2026-08-05  
**Alcance:** investigación E2E (PWA → API → Supabase → Desktop/PWA)  
**Estado:** causa raíz identificada y **corregida** (alineación `SYNC_SELECT` + `dbToRows` + `runService`). Requiere deploy a producción para que deje de devolver 504.

---

## Veredicto

La persistencia en PostgreSQL **no está totalmente rota**. Los endpoints REST de expedientes escriben y leen bien. El fallo central está en **`GET/PUT /api/v1/sync` en producción**, que responde **HTTP 504** de forma reproducible (~30 s) porque `pullAll` solicita columnas inexistentes en el esquema real (`SYNC_SELECT`), lanza un error no convertido a `ServiceError`, y Express 4 no responde la petición → Vercel corta por `maxDuration: 30`.

Eso deja la UI **dependiente del blob local** (`sts4_v1`) y hace que el otro dispositivo (lista vacía local) no pueda hidratarse por sync.

---

## 1. Evidencia de base de datos (no es “solo local”)

Proyecto Supabase (web = API): `ihuyisrplbmgxnvkpifm.supabase.co`.

| Comprobación | Resultado |
|---|---|
| Total `prospects` | 49 |
| Folio `P-813599` | **No existe** |
| Nombre `knuyygy` | **Sí existe** como `P-013599`, id `2cc5553c-…`, workspace personal `3da4e830-…` (Eduardo), user `eduardolalito99@hotmail.com` |
| Prospects en ese workspace | 9 (incl. `P-013599`, `P-551549`, …) |
| RLS anon sin sesión | 0 filas (RLS activo) |
| RLS con JWT del usuario | 9 filas, incluye `knuyygy` |

**Conclusión parcial:** el expediente del screenshot **sí llegó a PostgreSQL** (folio real `P-013599`, no `P-813599`). El síntoma “solo LocalStorage” describe el **estado de la UI del otro dispositivo**, no la ausencia absoluta en BD.

Verificación post-fix: `scripts/verify-sync-pull.mjs` (pullAll + reconcile round-trip).

---

## 2. Pruebas de endpoints (producción `https://saletse.vercel.app`)

Autenticación: JWT de usuario real vía `admin.generateLink` + `verifyOtp` (Bearer).

| Endpoint | Resultado | Evidencia |
|---|---|---|
| `GET /api/v1/sync` | **504** ×3 (~30179–30657 ms) | Cuerpo Vercel: `{"error":{"code":"504","message":"An error occurred with your deployment"}}` |
| `PUT /api/v1/sync` | **504** | Mismo patrón; **no** devolvió snapshot; ephemeral de prueba **no** quedó confirmado por respuesta (reconcile puede haber corrido o no antes del hang) |
| `GET /api/v1/prospects` | **200**, 9 filas, incluye `knuyygy` | ~611 ms |
| `POST /api/v1/prospects` | **201** | Fila visible con service role + RLS; cleanup `DELETE` 200 |
| `DELETE /api/v1/prospects/:id` | **200** | Confirmado borrado en BD |
| `GET /api/v1/sales\|activities\|calendar-entries\|goals` | **200** | OK |
| `GET /api/v1/tool-calculations` (sin `tool`) | **400** `tool requerido` | Validación esperada |
| `GET /api/v1/survey/questions-config` | **200** | OK |
| `GET /api/v1/auth/session` | **200** | Workspace activo presente |
| Sin auth en sync/prospects | **401** `No autenticado.` | Auth gate OK |

`vercel.json` fija `"maxDuration": 30` en la función `/api` — coincide con el corte a ~30 s.

---

## 3. Causa raíz (cadena causal)

### 3.1 Fallo primario — desajuste esquema ↔ `SYNC_SELECT`

Archivo: `packages/shared/src/data/sync-columns.js`  
Usado por: `packages/shared/src/data/sync.js` → `pullTable` / `pullAll`  
Introducido/ampliado en commit `2cb8fc9` (*perf(web,api): reducir consumo de datos móviles…*, 2026-07-29).

Columnas pedidas por sync que **no existen** en producción:

| Tabla | Columna(s) faltante(s) |
|---|---|
| `sales` | `updated_at` |
| `calendar_entries` | `updated_at` |
| `activities` | `updated_at` |
| `tool_calculations` | `created_at` |

Medición local de `pullAll` con el mismo JWT:

```text
pullAll_user_jwt: FAIL in ~338ms
error: pull calendar_entries: column calendar_entries.updated_at does not exist
```

(El orden en `Promise.all` puede hacer fallar primero `sales`, `calendar_entries`, `activities` o `tool_calculations`; cualquiera tumba todo el pull.)

El esquema inicial (`0001_initial_schema.sql`) nunca definió `updated_at` en `sales` / `calendar_entries` / `activities`, ni `created_at` en `tool_calculations`. El select tipado asumió columnas que no se migraron.

### 3.2 Fallo secundario — error no respondido (504 en lugar de 500)

`apps/api/src/routes/route-utils.js` → `runService`:

- Convierte solo `ServiceError` a JSON de error.
- Cualquier otro `Error` se **re-lanza**.

Rutas `async` de Express 4 **no** pasan ese throw al middleware `app.use((err,…))` automáticamente → la respuesta HTTP nunca se escribe → Vercel espera hasta `maxDuration` → **504**.

Por eso en prod se ve timeout de 30 s aunque el fallo de PostgREST ocurre en <1 s.

### 3.3 Efecto en el cliente (PWA / Desktop)

Orquestación: `apps/web/src/components/providers/sync-provider.jsx` + `apps/web/src/lib/sync-api.js`.

1. UI lee `sts4_v1` (Zustand/local), no PostgreSQL en vivo.
2. Inbound: `pullViaApi()` → `GET /api/v1/sync` → **504** → catch → status `error`; store local **no** se hidrata desde la nube.
3. Outbound: `reconcileViaApi()` → `PUT /api/v1/sync` → **504** → outbox dirty; el cliente cree que no sincronizó.
4. Crear expediente: `POST /api/v1/prospects` **sí funciona** (probado). Si el POST ok, la fila queda en BD aunque el sync blob falle. Si el POST falla/offline, el fallback es precisamente `PUT /sync`, que hoy está roto → **queda atrapado en local**.
5. Dispositivo con local vacío (móvil fresco / otro navegador) + sync 504 = **0 expedientes** en UI, aunque BD tenga 9.
6. Dispositivo que ya tenía el blob local (Desktop) sigue mostrando sus clientes locales → aparente “solo Desktop”.

---

## 4. Arquitectura Desktop vs PWA

| Aspecto | Hallazgo |
|---|---|
| App | Misma SPA Vite (`apps/web`); PWA = mismo build + Service Worker |
| API | Misma: `saletse.vercel.app/api/v1/*` |
| Supabase | Mismo proyecto (`VITE_SUPABASE_URL` = `SUPABASE_URL`) |
| Auth | Misma (cookies / Bearer Supabase) |
| Workspace | Un `profiles.workspace_activo_id` por usuario (no por dispositivo) |
| Storage | **No compartido** entre dispositivos (`localStorage`/`IndexedDB` por origen+dispositivo) |

No hay bifurcación Desktop/PWA de backend. La divergencia es **estado local + fallo del canal sync**.

---

## 5. Offline / cola

- Outbox durable: `sts4_outbound_v1` + debounce 1.2 s + `flushOutbound`.
- Con `/sync` en 504, los reintentos **no pueden completar** el ciclo pull/push del blob.
- `clients-mirror.js` (GET `/prospects` + POST solo-locales) **sí** usa un camino sano; mitiga solo si el build desplegado lo ejecuta al abrir Clientes y la sesión es válida. **No sustituye** el sync completo (tools, survey, agenda, metas, etc.).

---

## 6. Impacto por dominio

| Dominio | ¿Afectado por `/sync` 504? | ¿REST alternativo OK? |
|---|---|---|
| Expedientes (list/create) | Lectura blob rota; create vía POST OK | Sí (`/prospects`) |
| Survey / tools / worksheet | Payload en `tool_calculations` vía sync | Parcial (`/tool-calculations`, survey config) |
| Ventas / actividades / agenda / metas | Pull/push blob roto | List/CRUD REST mayormente OK (`select *`) |
| Workspace / session | No depende de sync blob | OK |

---

## 7. Solución propuesta (no implementada aquí)

Orden recomendado (arreglar causa, no parches cosméticos):

1. **Alinear `SYNC_SELECT` (y `SALE_LIST_COLUMNS` / `ACTIVITY_LIST_COLUMNS` si aplica) con el esquema real**, **o** migrar columnas faltantes en Supabase. Mínimo para desbloquear sync: quitar del select las columnas inexistentes (`sales.updated_at`, `calendar_entries.updated_at`, `activities.updated_at`, `tool_calculations.created_at`) o añadirlas con migración.
2. **En `runService`**: mapear errores genéricos a `500` JSON (no re-lanzar sin responder), para que un fallo de schema sea inmediato y observable, no un 504 de 30 s.
3. **Prueba de humo CI/prod**: `GET /api/v1/sync` autenticado debe ser 200 < 5 s con al menos las tablas vacías.
4. Tras el fix: forzar pull en ambos dispositivos (abrir Clientes / refresh sync) y validar paridad Desktop ↔ PWA.
5. Revisar despliegue PWA (SW) para no servir JS viejo que ignore mirror/outbox.

---

## 8. Impacto arquitectónico

- El modelo offline-first + snapshot único (`/sync`) es un **single point of failure**: un select incorrecto tumba **todo** el canal multi-dispositivo.
- Los CRUD REST por recurso son más resilientes (evidencia: prospects/sales/goals vivos mientras sync está muerto).
- Cualquier optimización de “columnas mínimas” debe validarse contra el esquema **aplicado en prod**, no solo contra migraciones teóricas.

---

## 9. Qué no es la causa raíz (descartado con evidencia)

- ❌ “Desktop y PWA usan distinta API/BD” — mismo host y mismo proyecto Supabase.
- ❌ “RLS bloquea todos los inserts de prospects” — POST 201 + lectura RLS OK.
- ❌ “`knuyygy` nunca se persistió” — fila en BD `P-013599`.
- ❌ “Timeout por volumen de datos” — `pullAll` falla en <400 ms por columna; el 30 s es hang de respuesta HTTP, no query lenta.
- ❌ Fallo exclusivo del frontend — el backend de sync está roto en prod de forma demostrable sin UI.

---

## 10. Fix aplicado (código)

1. `packages/shared/src/data/sync-columns.js` — eliminadas columnas inexistentes del select.
2. `packages/shared/src/data/mappers.js` y `apps/web/src/lib/data/mappers.ts` — upsert ya no envía `updated_at` en sales/calendar.
3. `apps/api/src/routes/route-utils.js` — errores genéricos → HTTP 500 JSON (evita hang → 504).

**Pendiente operativo:** deploy a Vercel; tras deploy, `GET/PUT /api/v1/sync` debe responder 200.
