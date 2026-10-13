# Auditoría de arquitectura — Fase 0

**Fecha:** 2026-10-13  
**Commit base:** `7933cbf` (`main`)  
**Alcance:** solo lectura. Sin cambios de código, sin deploy, sin tocar producción.  
**Objetivo:** informar la decisión de una estructura profesional uniforme (propuesta: por módulo, con MVC dentro de cada uno; identificadores propios en español).

---

## 1. Mapa actual

### 1.1 Monorepo

| Paquete | Rol |
|---------|-----|
| `apps/api` | Express API (`/api/v1/*`, `/auth`, `/health`) |
| `apps/web` | SPA Vite + React + PWA |
| `packages/shared` | Código compartido (cálculos RH, sync columns, permisos, push paths) |
| `supabase/migrations` | ~97 migraciones SQL (contrato de BD) |
| `scripts/` | Smokes, verifies, deploys, seeds |
| `e2e/` | Playwright |
| `deploy/` | Nginx (`nginx-saletse.conf` y variants) |
| `public/presentacion/` | Activos estáticos Presentación (iframe) |

### 1.2 `apps/api/src` — capas y conteos

| Capa | Archivos (aprox.) | Notas |
|------|-------------------|--------|
| `routes/` | 27 | Montaje HTTP; `admin.js` es excepcionalmente grande (~1096 LOC) |
| `controllers/` | 24 | Orquestación request/response |
| `services/` | 38 | Lógica de negocio principal |
| `repositories/` | 5 | Solo: activities, calendar, goals, profile, sales |
| `lib/` | 31 | Auth helpers, scope, patch whitelist, logger, tests |
| `middleware/` | 4 | Auth, rate-limit (+ tests) |
| Entrada | `app.js`, `index.js` | |

**Patrón declarado:** routes → controllers → services → (repositories o Supabase directo).  
**Realidad:** la mayoría de servicios hablan a Supabase sin repository; solo 5 tablas/áreas tienen repository explícito. Existe `mvc-contract.test.mjs` que valida el catálogo `/api/v1` y gates de auth.

**Módulos de negocio en el API (por rutas/servicios):**

| Dominio | Rutas / servicios representativos |
|---------|-----------------------------------|
| Auth / sesión | `auth`, `session` |
| Perfil / settings | `profile` |
| Sync CRM | `sync` |
| Prospectos / expediente | `prospects`, workflow, participants, sharing |
| Ventas | `sales` |
| Agenda / calendario | `calendar`, `activities`, `reminders` |
| Metas | `goals` |
| Tools (survey, worksheet, vacaciones, money-box) | `tools` |
| Royal Holiday | `royal-holiday` (+ catalog, ops, premanifiesto, bottom line) |
| Workspace / tenant / RBAC | `workspace`, tenant-*, roles, membership |
| Red / mensajería | `network`, `messages`, `chat`, `shares` |
| Notificaciones / push | `notifications`, push-notifications-service |
| Admin plataforma | `admin` (+ overview, logs, support) |
| Módulos custom | `custom-modules` |
| Geo / FX | `geo`, `exchange-rates` |
| Cron | `cron` |
| Soporte | `support` |
| Delegación | `delegacion-*` |

### 1.3 `apps/web/src` — capas y conteos

| Carpeta | Archivos (aprox.) | Rol |
|---------|-------------------|-----|
| `components/` | 113 | UI por dominio (admin, calculators, clients, …) |
| `lib/` | 148 | API clients, cálculos, storage, i18n, sync, OneSignal |
| `pages/` | 30 | Páginas de ruta (admin, rh, auth, social) |
| `hooks/` | 27 | Hooks de dominio |
| `actions/` | 4 | `clients`, `sales`, `calendar`, `settings` |
| `stores/` | 3 | Zustand (`db-store`, `sync-store`, app) |
| `routes/` | 3 | Router + lazy pages |
| `layouts/` | 3 | Shells de layout |

**Componentes por subcarpeta:** admin 21, calculators 21, clients 14, layout 10, auth 8, ui 7, providers 5, goals 4, settings 4, network 3, notifications 3, calendar 2, currency 2, custom-modules 2, rh 2, premium 2, messages 1, sales 1, pwa 1.

**Módulos de negocio en la web:**

| Dominio | Ubicación típica |
|---------|------------------|
| Expediente / clientes | `components/clients/*`, `actions/clients.js` |
| Survey | `calculators/survey-*`, `lib/calculations/survey`, `lib/survey/*` |
| Vacaciones | `vacaciones-page`, `lib/calculations/vacaciones` |
| Worksheet genérico | `worksheet-page` |
| Worksheet Royal Holiday | `worksheet-royal-holiday-*`, `lib/calculations/worksheet-rh-*`, `lib/royal-holiday-api.js` |
| Money Box | `money-box-*`, `lib/calculations/money-box.ts` |
| Presentación | `presentacion-viewer`, `public/presentacion/*` |
| Agenda | `calendar/*`, `actions/calendar.js` |
| Ventas / historial | `pages/SalesHistoryPage`, `actions/sales.js`, `components/sales` |
| Metas | `goals/*`, `metas-page` |
| Settings / moneda | `settings/*`, `lib/currency/*`, `actions/settings.js` |
| Admin tenant | `pages/admin/*`, `components/admin/*` |
| RH ops / premanifiesto | `pages/rh/*` |
| Red / mensajes / team | `NetworkPage`, `MessagesPage`, `TeamPage` |
| Sync offline | `sync-provider`, `lib/sync-*`, `lib/storage/*` |
| Push / PWA | `lib/onesignal.js`, providers |

### 1.4 `packages/shared/src`

| Carpeta | Archivos | Contenido |
|---------|----------|-----------|
| `auth/` | 4 | permissions, catalog, resolve, user-features |
| `calculations/` | 3 | royal-holiday (+ bottom-line, regalos catalog) |
| `data/` | 3 | sync, sync-columns, mappers |
| `api/` | 1 | validators |
| `push/` | 1 | notification-targets (deep links) |
| `storage/` | 1 | types |
| `supabase/` | 2 | config, public-url |
| `format/` | 1 | dates |
| raíz | constants, ids | |

**Nota:** existe `npm run sync:shared` que **porta** archivos desde `apps/web/src/lib/*` hacia `packages/shared` (mappers, sync, validators, types, ids, constants, dates, permissions). Eso acopla rutas de archivo del web al paquete shared.

---

## 2. Inconsistencias de capas

### 2.1 Lógica de negocio dentro de componentes

Archivos UI >400 LOC con cálculos / reglas embebidas o paneles densos:

| Archivo | LOC (aprox.) | Problema |
|---------|--------------|----------|
| `tenant-company-administration.jsx` | 1481 | Admin + reglas tenant en un solo componente |
| `worksheet-rh-financing-panel.jsx` | 918 | UI + reglas de financiamiento RH |
| `client-detail.jsx` | 803 | Orquestación expediente + lazy tools |
| `worksheet-rh-venta-panel.jsx` | 690 | Totales regalos / venta en panel |
| `settings-page.tsx` | 626 | Persistencia + FX + secciones |
| `AdminUsersPage.jsx` | 624 | UI + flujos admin |
| `clients-page.jsx` | 619 | Lista + fetch + sync |
| `money-box-calculator.jsx` | 607 | Cálculo + UI + settings patch |
| `survey-page.jsx` | 554 | Cálculo + collab + tabs |
| `worksheet-royal-holiday-page.jsx` | 504 | Orquestación RH completa |

Hay lógica ya extraída (`lib/calculations/*`, `packages/shared/.../royal-holiday.js`), pero los paneles RH y admin aún concentran demasiada responsabilidad.

### 2.2 Componentes que llaman al API directamente

Además de `lib/*-api.js` y `actions/*`, hay `fetch('/api/v1/...')` en componentes:

| Archivo | Endpoint |
|---------|----------|
| `clients-page.jsx` | `GET /api/v1/prospects?...` |
| `workspace-rail.jsx` | `POST /api/v1/workspace/leave` |
| `calendar-page.jsx` | `GET /api/v1/workspace/peers` |
| `buscador-usuario.jsx` | `GET /api/v1/{searchPath}?q=` |

El resto de la UI suele pasar por `session-api`, `royal-holiday-api`, `sync-api`, `participants-api`, etc. — patrón mixto.

### 2.3 Imports cruzados / acoplamiento

- **Web → Shared:** correcto en cálculos RH, permisos, push paths.
- **Shared ← Web (build):** `sync:shared` copia desde web hacia shared (dirección invertida respecto a un monorepo limpio).
- **Stores ↔ lib:** `db-store` importa dinámicamente `tool-calculations-api`; `cloud-persist` / `prospects-persist` importan el store.
- **Calculators → lib de dominio:** esperado; pero también tocan flags, collab, currency y APIs en el mismo árbol JSX.
- **API:** services grandes llaman Supabase sin repository; controllers a veces delgados, a veces routes (`admin.js`) concentran lógica.

### 2.4 Archivos grandes (>400 LOC) con varias responsabilidades

Top (además de i18n catalogs que son datos, no lógica):

1. `i18n-catalog.js` (1485) — catálogo (aceptable como datos).
2. `tenant-company-administration.jsx` (1481).
3. `workspace-service.js` (1222).
4. `onesignal.js` (1144).
5. `routes/admin.js` (1096).
6. `royal-holiday-service.js` (1085).
7. `sharing-service.js` (968).
8. Paneles RH / survey / money-box / settings / admin pages (600–900).

---

## 3. Inventario de nombres (español / inglés / mixto)

Muestreo por **nombre de archivo** en `apps/api/src` + `apps/web/src` (~450 archivos JS/TS):

| Categoría | Conteo aprox. | Ejemplos |
|-----------|---------------|----------|
| Inglés (prefijos comunes: settings, client, sales, sync, workspace, admin, survey, worksheet…) | ~157+ | `clients-page.jsx`, `sync-service.js`, `settings-page.tsx` |
| Español o hispanismos en el path | ~27 | `vacaciones-page.jsx`, `moneda-service.ts`, `buscador-usuario.jsx`, `campo-moneda-captura.jsx`, `metas-page.jsx`, `opc-expediente-page.jsx`, `selector-moneda.jsx` |
| Mixto (acrónimo RH + español / inglés) | frecuente en RH | `RhPremanifiestoPage.jsx`, `RhDiasDescansoPage.jsx`, `RhCalendarioComisionesPage.jsx`, `worksheet-rh-hoja-panel.jsx`, `royal-holiday-regalos-catalog.js` |

**Por carpeta (tendencia):**

| Carpeta | Predominio |
|---------|------------|
| `apps/api` routes/controllers/services | Inglés (`prospects`, `sales`, `calendar`) con excepciones (`delegacion`, `modulos-custom`, `empresa-roles-seed`) |
| `apps/web/components/calculators` | Mixto (survey/worksheet EN + vacaciones/hoja/regalos ES) |
| `apps/web/pages/rh` | Mixto fuerte (Rh + español) |
| `apps/web/lib/currency` | Español (`moneda-service`) |
| `packages/shared` | Inglés de API + español de dominio RH (`regalos`) |
| BD / sync columns | Inglés snake_case con columnas españolas (`tipo_tour`, `tour_cuantificable`, `ventas`, `dias`) |

**Identificadores en código:** no hay un linter de idioma; el catálogo i18n usa claves EN (`settings.money.title`) con strings ES/EN. Funciones propias aparecen en ambos idiomas (`resolveUsdToMxnRate` vs `convertir`, `totalesRegalosAplicados`, `ensure_personal_workspace`).

---

## 4. Contratos que NO se pueden renombrar sin migración

### 4.1 Tablas / columnas (BD + sync)

Fuente principal: `packages/shared/src/data/sync-columns.js` y migraciones en `supabase/migrations/`.

| Tabla | Columnas críticas (muestra) | Uso |
|-------|----------------------------|-----|
| `prospects` | `id`, `user_id`, `workspace_id`, `prospect_code`, `name`/`name1`/`name2`, `tipo_tour`, `tour_cuantificable`, `quick_expedient`, … | Sync pull, listados, expediente |
| `sales` | `vol`, `tours`, `contract`, `status`, `processing`, … | Sync, historial |
| `calendar_entries` | `type`, `entry_date`, `kind`, `client_name`, … | Agenda |
| `goals` | `vol`, `tours`, `ventas`, `dias`, `descansos` | Metas (nombres ES en columna) |
| `activities` | `type`, `activity_date`, … | Actividad |
| `tool_calculations` | `tool`, `data` (JSONB payload de tools) | Survey/worksheet/RH/money-box |
| `profiles` | `settings` JSONB, `workspace_activo_id`, `role_id`, … | Auth/settings |
| Tenant | `empresas`, `empresa_miembros`, `workspaces`, `workspace_miembros`, `roles`, flags | RBAC |
| RH | tablas/catálogo `royal_holiday_*`, premanifiesto, ops | RH |
| Social | chat, shares, notifications, support_requests | Red / soporte |

Renombrar columnas o tablas implica migración SQL + actualizar `SYNC_SELECT`, mappers y API.

### 4.2 Payloads API HTTP

| Contrato | Ubicación / notas |
|----------|-------------------|
| Prefijo `/api/v1/*` | Nginx + SPA + smokes + `mvc-contract.test.mjs` |
| `/auth`, `/auth/callback`, `/health` | Nginx proxy |
| Body profile `settings` + `fullName`/`phone`/`avatarUrl` | `profile-service`, `actions/settings.js` |
| Tool `data` JSON por `tool` slug | `tools-service`, web tool session |
| Push payload `type` (`PushType.*`) | `notification-targets.js`, OneSignal |
| Feature flags / permission keys | shared auth + seed scripts |

### 4.3 Claves `localStorage` (`sts4_*`)

Definidas en `apps/web/src/lib/storage/keys.ts`:

| Clave | Uso |
|-------|-----|
| `sts4_v1` | Legado; solo migración |
| `sts4_v1:{workspaceId}` | Blob CRM por sala |
| `sts4_user_v1` | Preferencias globales usuario |
| `sts4_active_workspace` | Workspace activo en dispositivo |
| `sts4_schema` | Versión layout storage |
| `sts4_v1:legacy_pending` | Migración pendiente |
| `sts4_outbound_v1` / `:{workspaceId}` | Outbox sync |
| `sts4_account` | user_id dueño del blob |
| `sts4_auth_sync` | Sync login/logout entre pestañas (sobrevive logout) |

Cualquier rename rompe clientes ya desplegados hasta limpiar storage o migrar en código.

### 4.4 Claves dentro de `profiles.settings` / `sts4_user_v1`

`USER_GLOBAL_SETTING_KEYS` / `WORKSPACE_SETTING_KEYS` (`settings-scope.js`):

**Globales:** `language`, `userName`, `userInitials`, `notifications`, `onesignal_subscription_ids`, `currency`, `exchangeRate`, `exchangeMode`, `usdToMxnRate`, `exchangeRateUpdatedAt`, `activeCaptureCurrency` (+ anidadas observadas en prod: `workspaces`, `moneyBoxConfig` a veces en raíz histórica, `active_workspace_id`).

**Por workspace:** `worksheetConfig`, `moneyBoxConfig`, `tourTypes`.

### 4.5 OneSignal / Service Worker / PWA

| Nombre / ruta | Uso |
|---------------|-----|
| `/onesignal/OneSignalSDK.page.js` (+ `.es6.js`) | SDK page local |
| `onesignal/OneSignalSDKWorker.js`, `OneSignalSDK.sw.js` | Service worker path/scope `/onesignal/` |
| Nginx `location /onesignal/`, `= /OneSignalSDKWorker.js` | Deploy |
| `sw.js`, `workbox-*`, `manifest.webmanifest` | PWA Vite |
| `PushType` enum + deep links (`/messages`, `/network`, `/red/contacto/...`, `/sales`, `/`) | Payload push |
| `onesignal_subscription_ids` en settings | Persistencia suscripciones |
| `SUPPORT_REPLY: "respuesta_soporte"` | Valor de tipo ya en español en contrato |

### 4.6 Eventos / tools / flags (muestra)

- Slugs de tool en `tool_calculations.tool` (survey, worksheet, vacaciones, money_box, etc.) — confirmar en código al migrar.
- Flags RH (`worksheet.royal_holiday`, `rh.tool.*`, money-box flag) — seeds y verifies.
- Collaboration field ids / collab events en expediente realtime.

---

## 5. Riesgos al mover archivos

### 5.1 Imports dinámicos / lazy routes

- `routes/lazy-pages.js` y `client-detail.jsx`: `import("@/components/...")` con paths absolutos de alias `@/`.
- Prefetch en `sidebar.jsx` de páginas admin.
- Imports dinámicos store ↔ API (`cloud-persist`, `prospects-persist`, `session-api` ↔ `session-cross-device`).
- Mover sin actualizar **todos** los string paths de `import()` rompe chunks en runtime (a menudo silencioso hasta abrir la ruta).

### 5.2 Rutas hardcodeadas (URL de app, no de archivo)

Deep links push y React Router (`/clients/:id`, `/messages`, `/red/contacto/...`, `/rh/*`, `/admin/*`). Cambiar paths de **archivo** no las afecta; cambiar paths de **URL** sí (OneSignal + bookmarks).

### 5.3 Tests y scripts

- Unit: `*.test.mjs` bajo `apps/api` y `apps/web` (paths relativos / imports `@/`).
- Scripts que importan o asumen paths: `scripts/port-shared.mjs`, `sync:shared` (lista fija de archivos web → shared), smokes Playwright, deploys Python.
- E2E Playwright: selectores `data-testid` y rutas URL (más estables que paths de archivo).

### 5.4 Build

- Vite `alias @` → `apps/web/src`.
- `publicDir` / `public/presentacion/**` + `.gitattributes` LF.
- `VITE_BUILD_ID`, `build-id.txt`, PWA precache de hashes de assets.
- Stub Nginx de entry retirado `index-DS5s4Hkv.js` (hash hardcodeado en deploy).

### 5.5 Nginx / VPS

`deploy/nginx-saletse.conf`:

- `root /var/www/Saletse/apps/web/dist;`
- Proxy `/api`, `/auth`, `/health` → `:4000`
- Proxy Supabase `/auth/v1`, `/rest/v1`, `/realtime/v1`, `/storage/v1` → Kong
- Estáticos: `/onesignal/`, `/presentacion/img/`, `/assets/`, `/sw.js`, `/build-id.txt`

Mover el **output** de build o el path en VPS requiere cambiar Nginx + scripts `build-web-vps-prod.py` / `deploy-web-dist-prod.py`.

### 5.6 Duplicación shared

Renombrar `apps/web/src/lib/data/mappers.ts` sin actualizar `package.json` → `sync:shared` rompe el pipeline de shared.

---

## 6. Propuesta de estructura objetivo

### 6.1 Reglas de dependencia (comunes a ambas alternativas)

```
UI / routes  →  application (use-cases / actions)
             →  domain (puro, sin I/O)
             →  infrastructure (HTTP, Supabase, localStorage)

Prohibido: domain → UI
Prohibido: infrastructure → UI
Preferido: un módulo no importa internals de otro (solo facade pública)
```

### 6.2 Alternativa A — Módulos verticales con MVC interno (recomendada)

**API** (`apps/api/src/modulos/<nombre>/`):

```
modulos/
  prospectos/
    rutas.js
    controlador.js
    servicio.js
    repositorio.js
  ventas/
  agenda/
  royal-holiday/
  ...
infra/
  supabase/
  middleware/
compartido/   # auth, logger, errores
```

**Web** (`apps/web/src/modulos/<nombre>/`):

```
modulos/
  expediente/
    ui/
    hooks/
    acciones.js
    api.js
  survey/
  royal-holiday/
  moneda/
  ...
nucleo/       # router, stores shell, auth session
infra/        # storage sts4, http client
```

| Pros | Contras |
|------|---------|
| Un dominio = una carpeta; onboarding claro | Migración larga; muchos moves |
| Encaja con “MVC por módulo” | Requiere facades para no romper lazy imports |
| Facilita ownership y tests por módulo | Shared RH hoy vive en `packages/shared` — hay que decidir si se queda o se reexporta |

### 6.3 Alternativa B — Capas horizontales reforzadas (evolución del status quo)

Mantener `routes/ controllers/ services/` y `components/ lib/ actions/`, pero:

- Obligar repository por aggregate.
- Prohibir `fetch` en `components/` (solo `actions` / `lib/*-api`).
- Extraer paneles >400 LOC a `lib`/`domain`.

| Pros | Contras |
|------|---------|
| Menos movimiento de archivos | Naming y módulos siguen dispersos |
| Menor riesgo inmediato | No resuelve “dónde vive RH vs survey” |
| Encaja con `mvc-contract` actual | La deuda de carpetas mixtas ES/EN permanece |

**Recomendación Fase 0:** adoptar **A** como norte; ejecutar **B** como pasos intermedios dentro de cada módulo al migrarlo (extraer antes de mover).

---

## 7. Glosario español y reglas de naming

### 7.1 Qué SÍ se traduce (código propio nuevo / al migrar un módulo)

| Inglés actual (ejemplo) | Español propuesto |
|-------------------------|-------------------|
| prospect / client (UI) | expediente / prospecto (unificar término en glosario de producto) |
| sale | venta |
| calendar / agenda | agenda |
| workspace (sala) | sala (UI); `workspace` solo en contrato API/BD |
| settings | configuración |
| survey | encuesta (o mantener “survey” si es marca interna — decidir) |
| worksheet | hoja / hoja de trabajo |
| goals | metas |
| sharing | compartido / compartir |
| membership | membresía |

Funciones/variables nuevas en módulos migrados: **español** (`calcularTotalesRegalos`, `guardarPerfil`), clases/componentes: PascalCase español o mixto estable (`PanelVentaRh`).

### 7.2 Qué NO se traduce (contratos)

- Nombres de tablas/columnas SQL y JSON ya persistidos.
- Paths HTTP `/api/v1/...`, deep links, `PushType` values ya emitidos.
- Claves `sts4_*` y keys de `settings` JSONB.
- Flags/slugs ya en BD (`liner`, `worksheet.royal_holiday`, tool names).
- Identificadores de terceros: `OneSignal`, Supabase, Vite, Workbox.
- Paquetes npm y paths de build (`dist`, `assets`).

### 7.3 Reglas

1. **Contrato externo en inglés técnico estable**; **código de dominio interno en español** al tocar el módulo.
2. Un módulo migrado no introduce **nuevos** identificadores en inglés salvo que sean el contrato.
3. Adapters en el borde: `mapearProspectoDesdeApi(dto)` / `toApiSalePayload(venta)`.
4. Tests del módulo: nombres en español; smokes de contrato pueden seguir nombrando endpoints en inglés.
5. Documentar excepciones RH de marca (`Royal Holiday`, `Move In`) como literales de negocio, no como “inglés de código”.

---

## 8. Orden sugerido de migración (menos → más riesgo)

Estimaciones = archivos tocados de forma directa (UI + lib + api del dominio), no conteo transitivo de i18n.

| # | Módulo | Riesgo | Archivos (orden) | Por qué |
|---|--------|--------|------------------|---------|
| 1 | **Geo / exchange-rates** | Bajo | ~8–15 | Poco estado, sin offline blob |
| 2 | **Moneda / settings FX** | Bajo-medio | ~15–25 | Ya normalizado; tocar storage con cuidado |
| 3 | **Reminders / notifications UI** | Medio | ~20–30 | Push contracts sensibles |
| 4 | **Goals / metas** | Medio | ~15–25 | Columnas ES ya en BD |
| 5 | **Vacaciones** | Medio | ~15–25 | Tool aislada |
| 6 | **Survey** | Medio-alto | ~40–60 | Collab + discovery + tool data |
| 7 | **Money Box** | Medio-alto | ~25–40 | Flags + settings moneyBoxConfig |
| 8 | **Agenda / calendar** | Alto | ~30–50 | Sync + realtime |
| 9 | **Ventas** | Alto | ~25–40 | Sync core |
| 10 | **Expediente / prospects / sharing** | Muy alto | ~80–120 | Centro del producto |
| 11 | **Royal Holiday (worksheet + ops + PM)** | Muy alto | ~100–150 | shared + API grande + flags |
| 12 | **Sync / storage sts4 / outbox** | Crítico | ~40–70 | Último; rompe offline |
| 13 | **Admin / tenant RBAC** | Crítico | ~80–120 | `admin.js` monolítico + seguridad |
| 14 | **Auth / session / OneSignal / PWA** | Crítico | ~40–60 | Al final; Nginx + SW |

Empezar siempre por **extraer dominio puro + tests** (alternativa B local) y luego **mover a carpeta de módulo** (alternativa A).

---

## 9. Inventario de pruebas y huecos (red de seguridad Fase 1)

### 9.1 Existente

**API unit / contract (`apps/api`):**  
`mvc-contract`, `app.security`, `prospect-edit-access`, `collaboration-id`, `patch-whitelist`, `workspace-scope`, `rate-limit`, `security-lib`, `roles-permission-keys`, caches RH, bottom-line 2027.

**Web unit:**  
`settings-scope`, `opc-expediente`, `rh-opc-home`, `paquete-template-kind`, `tool-perm-flags`.

**Scripts `test-*` / `verify-*`:**  
money-box, survey-calc, RH regalos/venta/extra-dp, settings FX, presentacion budget; verifies: smoke, flags, workspaces, tenant workflow, security, RH P0/premanifiesto/money-box, VPS mobile.

**Smokes prod/QA:**  
`smoke-settings-fx-warning`, `smoke-presentacion-*`, varios `verify-*-prod.py`.

**E2E Playwright (`e2e/`):**  
`smoke`, agenda, clients-agenda, money-box routing, RH (flyback, hoja firmas, PM layout, tables mobile), egress (payload/realtime/sync), responsive, video-corrections.

**npm scripts útiles:** `test:web`, `test:e2e`, `verify`, `verify:security-smoke`, `test:money-box`, `test:rh-regalos`.

### 9.2 Huecos a cubrir **antes** de mover módulos

| Hueco | Por qué bloquea migración |
|-------|---------------------------|
| No hay suite “import graph / boundary” (p. ej. dependency-cruiser) | Moves reintroducen imports cruzados sin fallar CI |
| Poca cobertura unit de `workspace-service` / `sharing-service` / `royal-holiday-service` (archivos >900 LOC) | Regresiones silenciosas al partir archivos |
| E2E incompleto de **settings save + sts4_user_v1** en CI (hay smoke manual/prod) | Rename storage keys o hydrate |
| E2E incompleto de **sync outbox multi-workspace** | Mover `lib/sync-*` |
| Contract tests insuficientes de **payload tool_calculations.data** por tool | Migrar survey/RH/money-box |
| No hay test automático de **deep links PushType → rutas** | Mover pages/router |
| Admin: sin e2e de flujos críticos (roles/empresas) proporcional al tamaño | Partir `admin.js` / tenant UI |
| Shared sync: riesgo de desalineación web↔shared tras moves (`sync:shared`) | Script de parity en CI |
| Snapshot de rutas lazy (`lazy-pages.js`) | Detectar `import()` rotos |

### 9.3 Red mínima propuesta (Fase 1, antes de moves masivos)

1. CI verde: `test:web` + API tests + `verify` (local) + subset e2e smoke.  
2. Añadir: test de boundaries (components no importan services API del servidor; components no `fetch` directo — allowlist temporal).  
3. Smoke settings FX + presentacion (ya existen) como gate post-deploy.  
4. Por módulo: checklist “extraer → test unit → mover → e2e del módulo”.  
5. No migrar sync/storage/auth hasta que 1–4 estén estables.

---

## Apéndice — Conteos rápidos

| Área | Archivos JS/TS (aprox.) |
|------|-------------------------|
| API `src` | ~134 |
| Web `src` | ~333 |
| Shared `src` | ~19 |
| E2E specs | 13 |
| Scripts smoke/test/verify | ~26 |
| Migraciones SQL | ~97 |
| Archivos >400 LOC (apps+packages) | ~40 |

---

## Cierre Fase 0

Este documento **no prescribe** ejecutar moves. Siguiente paso humano: elegir alternativa A/B (o híbrido), aprobar glosario, y autorizar Fase 1 (red de seguridad + primer módulo piloto, p. ej. geo/exchange o moneda).

**Rama:** `docs/arquitectura-fase0`  
**Documento:** `docs/arquitectura/auditoria-fase0.md`
