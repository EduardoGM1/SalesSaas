# Inventario — agenda / calendario (módulo 8)

**Tip inventario:** `d08e982` (docs). **Tramo B (dominio puro):** rama `arquitectura/agenda-tramo-b` → merge a `main` (ver §0b).  
**Contratos congelados:** ver §2. No renombrar. **shared/sync intocable** en toda Agenda (`check-agenda-shared-guard.mjs`).

**Hallazgo clave:** la UI de agenda es compacta (`calendar-page` + `entry-dialog` + `actions/calendar`), pero la **persistencia offline y el sync** viven repartidos en `db-store`, `cloud-persist`, `sts4_v1:{workspaceId}`, outbox y `packages/shared`. Máximo riesgo; el dominio puro de descansos ya está en `modulos/agenda`.

---

## 0b. Estado tras Tramo B (dominio puro)

| Pieza | Estado |
|-------|--------|
| `modulos/agenda/dominio/calendar-descansos.js` | `contarDiasDescanso` / `esDiaDescanso` (+ aliases EN) |
| Fachadas | `index.ts`, `fachada-node.js`; `servicios/` reservado (Tramo A) |
| Metas → agenda | `kpis-metas` / `semanas-tablero` importan `@/modulos/agenda` |
| Eliminado | `lib/calculations/calendar-descansos.js`, `lib/calculations/calendar.ts` (reexports huérfanos) |
| `isCalendarSaleCountable` | **Eliminado** (0 callers). Ventas usa `isSaleCountable` / `isActiveAgendaSale` sobre `SaleRecord` (regla distinta; no unificar aquí) |
| Guard CI | `check-agenda-shared-guard.mjs` (+ test): ramas `arquitectura/agenda-*` no tocan `packages/shared/src/data/*` ni `sync-shared-files.json` |
| Contención | Antes tip inventario: 399 en disco / baseline 396; tras B: **397 / 394** (−2 legacy eliminados; excepciones 3) |

**No movido (siguientes tramos):** UI, actions, API, sync/outbox, `db-store`.

---

## 0. Resumen de conteos (tip `acda4f7`)

| Grupo | Archivos propios / núcleo | ~Líneas | Nota |
|-------|--------------------------:|--------:|------|
| Dominio / cálculo | 2 (`calendar.ts`, `calendar-descansos.js`) | ~44 | + adaptadores muertos hacia metas |
| UI | 2 (`calendar-page`, `entry-dialog`) + `actions/calendar.js` | ~546 | Sin vista semana propia; panel de día |
| Persistencia / sync (compartido) | store + cloud-persist + outbox + shared sync/validators/mappers/columns + storage keys | ≫1500 (compartido) | **No mover con agenda** |
| Recordatorios (acoplamiento) | vía `modulos/notificaciones` | — | Ya migrado; no reabrir |
| Metas (acoplamiento) | `calendar-descansos` ← `kpis-metas` / `semanas-tablero` | — | Adaptadores en `calendar.ts` a eliminar |
| API agenda | 4 (ruta, controlador, servicio, repo) | ~144 | MVC ya separado; falta `modulos/` |
| Flags / permisos | catálogo + sync map | — | Ver §1.7 |
| i18n + tests | claves `entry.*` / `cal.*`; E2E; unit metas | — | Ver §1.8 |

**Núcleo movible sin tocar sync:** ~8 archivos / ~730 líneas (dominio + UI + actions + API MVC).  
**Compartido de alto riesgo:** `packages/shared/src/data/sync.js` y pares `sync:shared` — fuera de los tramos B/A de agenda.

---

## 1. Lista real de archivos

### 1.1 Dominio / cálculo

| Path | ~líneas | Rol | Importado por |
|------|--------:|-----|---------------|
| `apps/web/src/lib/calculations/calendar-descansos.js` | 12 | `countDescansoDays`, `isDescansoDay` (días con `t === "descanso"`) | `modulos/metas/dominio/kpis-metas.ts`, `semanas-tablero.ts`; reexport en `calendar.ts` |
| `apps/web/src/lib/calculations/calendar.ts` | 32 | Reexports legacy → `@/modulos/metas` + `calendar-descansos`; define `isCalendarSaleCountable` | **Sin consumidores de runtime** (solo fallback histórico en `metas-calculo.test.mjs`; baseline legacy) |

Exports de adaptador en `calendar.ts` (deuda metas → agenda):

| Export (EN / ES) | Destino real | Consumidores actuales |
|------------------|--------------|------------------------|
| `normalizeGoal` / `normalizarMeta` | `modulos/metas` | UI metas importa **directo** `@/modulos/metas` — el reexport en `calendar.ts` está **huérfano** |
| `computeMetasKpis` / `calcularKpisMetas` | idem | idem |
| `getDashboardWeeks` / `obtenerSemanasTablero` | idem | idem |
| `workingDaysRemaining` / `diasLaborablesRestantes` | idem | idem |
| `countDescansoDays`, `isDescansoDay` | `calendar-descansos.js` | Metas dominio (directo a `.js`); reexport huérfano |
| `isCalendarSaleCountable` | local en `calendar.ts` | **Cero consumidores** (candidato Tramo B + test golden) |

### 1.2 UI

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/web/src/components/calendar/calendar-page.jsx` | 245 | Ruta `/` (index): grid mensual, dots por tipo, **panel de día**, borrado, abre modal |
| `apps/web/src/components/calendar/entry-dialog.jsx` | 205 | Modal **«¿Qué te gustaría agregar?»** (`entry.prompt`): venta, follow, nota cliente, nota usuario, descanso, no-tour + recordatorio |
| `apps/web/src/actions/calendar.js` | 96 | `saveClientNote`, `saveAgendaUserNote`, `saveAgendaDayOff`, `saveAgendaNoTour` → store + `scheduleReminderPush` |
| `apps/web/src/routes/index.jsx` | (parcial) | `<Route index element={<CalendarPage />} />` |

**Vistas:** mes + detalle de día. No hay vista semana en agenda; el tablero semanal de metas usa `obtenerSemanasTablero` leyendo el mismo `db.cal`.

### 1.3 Persistencia y sincronización

| Path | Rol agenda |
|------|------------|
| `apps/web/src/stores/db-store.ts` | `db.cal`, `addCalEntry`, `addCalEntryByDate`, `deleteCalEntry`, ventas→entrada/follow con `processDate`, `pendingDeletes.calendar_entries` |
| `apps/web/src/lib/storage/keys.ts` | `sts4_v1`, `sts4_v1:{workspaceId}`, outbox keys |
| `apps/web/src/lib/storage/local-storage-adapter.ts` | Hidrata/persiste blob CRM (incluye `cal`) |
| `apps/web/src/lib/storage/types.ts` | Tipos `CalEntry` / mes (paridad shared) |
| `apps/web/src/lib/cloud-persist.js` | `persistCalendarUpsert` / `Delete` → REST `/calendar-entries` |
| `apps/web/src/lib/cloud-persist-bridge.js` | Outbox bridge hacia esos persist* |
| `apps/web/src/lib/sync-outbox.js` | Dirty flag outbox |
| `apps/web/src/lib/sync-merge.js` | Merge remoto↔local de `cal` / deletes |
| `apps/web/src/lib/data/mappers.ts` | Par web de mappers (incluye calendar) |
| `packages/shared/src/data/sync.js` | Pull/reconcile `calendar_entries`; permiso insert `expedientes:editar`; natural key; deletes |
| `packages/shared/src/data/sync-columns.js` | `SYNC_SELECT` / `CALENDAR_LIST_COLUMNS` |
| `packages/shared/src/api/validators.js` | `ENTRY_TYPES`, `bodyToCalInsert`, `sanitizeEntryType` |
| `packages/shared/src/data/mappers.js` | Filas ↔ blob `db.cal` |
| `packages/shared/src/storage/types.js` | Tipos storage compartidos |

Flujo: UI/actions → `db.cal` local → outbox/REST → `calendar_entries`; pull vía `PUT/GET` sync blob.

### 1.4 Recordatorios (ya en módulo 7)

| Pieza | Relación con agenda |
|-------|---------------------|
| `apps/web/.../schedule-reminder-push.js` | Llamado desde `actions/calendar.js` (y ventas) |
| `entry-dialog.jsx` | UI fecha/hora recordatorio |
| API `construir-recordatorios.js` | Lee blob `db.cal` (`follow` / `nota`) |
| `PushType` `follow_up_reminder`, `scheduled_note` | Deep link `calendarPath()` → `/` |

**No reabrir** notificaciones en tramos de agenda; solo conservar imports de fachada.

### 1.5 Metas

| Pieza | Relación |
|-------|----------|
| `calendar-descansos.js` | Única dependencia viva agenda→metas (descansos en KPIs / semanas) |
| `calendar.ts` adaptadores | Eliminar al migrar agenda (hoy huérfanos en runtime) |
| `goals-page` / `metas-page` | Leen `db.cal[monthKey]`; importan `@/modulos/metas` |

### 1.6 API

| Path | ~líneas | Rol |
|------|--------:|-----|
| `apps/api/src/routes/calendar.js` | 10 | `GET/POST /calendar-entries`, `GET/PATCH/DELETE /calendar-entries/:id` |
| `apps/api/src/controllers/calendar-controller.js` | 26 | HTTP → servicio |
| `apps/api/src/services/calendar-service.js` | 59 | `bodyToCalInsert`, workspace; edit/delete **solo dueño** |
| `apps/api/src/repositories/calendar-repository.js` | 49 | Supabase + `CALENDAR_LIST_COLUMNS`; `teamScope` solo lectura |
| `apps/api/src/routes/v1.js` | (montaje) | Paths congelados |
| `apps/api/src/lib/patch-whitelist.js` | (parcial) | `calendarEntryToPatch` |

### 1.7 Flags y permisos

| Clave | Uso |
|-------|-----|
| `agenda:usar` | Catálogo app (`permission-catalog.js`); **no** hay check en UI/API de calendar MVC hoy |
| `agenda:read` | Legacy map → `null` |
| Sync insert `calendar_entries` | `expedientes:editar` (`SYNC_INSERT_PERMISSIONS` en `sync.js`) |
| REST create/update/delete | Autenticado + workspace; update/delete filtran `user_id` dueño |
| Lectura team | `teamScope` / `ver_equipo` vía `getRequestWorkspaceContext` |

No hay feature-flag específico de agenda en settings.

### 1.8 i18n y tests

**Prefijos i18n (no renombrar):** `page.agenda.*`, `cal.*`, `entry.*` (prompt, tabs, routes, reminder, noTour, dayOff, userNote), `toast.agenda.*`, `toast.cal.*`, `toast.note.*`.

| Test | Path | Qué cubre |
|------|------|-----------|
| E2E modal | `e2e/agenda-entry-modal.spec.js` | Modal alta; descanso/no-tour; Guardar (saneado) |
| E2E clientes→agenda | `e2e/clients-agenda-intent.spec.js` | Intent desde clientes |
| E2E egress | `e2e/egress-realtime-idle.spec.js` | Probe `calendar_entries` sin sync masivo |
| Unit metas (descansos) | `apps/web/src/modulos/metas/dominio/metas-calculo.test.mjs` | KPIs con/sin descanso (vía dominio metas) |
| Unit agenda puro | — | **No existe** aún (`isCalendarSaleCountable`, descansos aislados) |
| Smoke UI agenda | — | **No hay** `smoke-agenda-*-qa.mjs`; patrón: QA efímera como `smoke-metas-ui-qa.mjs` / `smoke-notificaciones-ui-qa.mjs` |
| Smoke sync | `smoke-sync-roundtrip-qa.mjs` | Incluye tablas CRM (precedente sync) |

---

## 2. Contratos que NO se renombran

| Contrato | Detalle |
|----------|---------|
| Tabla / columnas | `calendar_entries` (+ FKs `prospect_id` / `sale_id` SET NULL) |
| Tipos `t` / `type` | `venta`, `nota`, `follow`, `descanso` (`ENTRY_TYPES`) |
| `kind` | `no-tour` (se guarda como `nota` + `kind`) |
| Claves storage | `sts4_v1`, `sts4_v1:{workspaceId}`, outbox / legacy pending |
| HTTP | `/api/v1/calendar-entries`, `/api/v1/calendar-entries/:id`; sync blob |
| Sync | `calendar_entries` en pull/reconcile; natural keys; `pendingDeletes.calendar_entries` |
| Settings / PushType | prefs notificaciones; `follow_up_reminder`, `scheduled_note`; `calendarPath()` → `/` |
| Permisos | `agenda:usar`, `expedientes:editar` (sync insert), legacy `agenda:read` |
| i18n | claves §1.8 |
| Ruta UI | `/` (index agenda) |

---

## 3. Acoplamientos y riesgos

| Dominio | Cómo | Riesgo |
|---------|------|--------|
| **Sync / shared** | `sync.js`, `validators.bodyToCalInsert`, `mappers`, `sync-columns`, tipos storage | **Máximo.** Precedente: regresión `PUT /sync` al tocar shared. Agenda escribe/lee las mismas filas. |
| **Outbox / local** | `db.cal` en blob `sts4_*`; bridge cloud-persist | **Máximo.** Offline-first: bug = pérdida o duplicados locales. |
| **Metas** | `calendar-descansos` + adaptadores `calendar.ts` | Medio-bajo si se mueve descansos con cuidado; adaptadores hoy huérfanos |
| **Notificaciones** | `scheduleReminderPush`; digest lee `cal` | Medio; contratos PushType ya congelados en mod. 7 |
| **Ventas / processDate** | `actions/sales.js` + `db-store` crean follow/venta en `cal` | Alto acoplamiento de datos; no mover ventas aquí |
| **Expediente** | notas cliente → `addCalEntry` + activity; `prospect_id` en filas | Medio |
| **Realtime dashboard** | `dashboard-data-realtime.js` escucha `calendar_entries` | Bajo-medio |

### Extraíble como lógica pura (bajo riesgo)

- `calendar-descansos.js` (ya puro)
- `isCalendarSaleCountable` (puro; sin callers → golden master fácil)
- (Futuro) normalización de entrada UI → shape `CalEntry` sin I/O

### No extraer / no mover todavía

- Cualquier edit de `packages/shared/src/data/sync.js` o regeneración `sync:shared` que toque mappers/validators/types usados por calendar
- Outbox / `local-storage-adapter` / merge sync
- Lógica de ventas→`processDate` en `db-store`

### Evitar repetir la regresión de sync

1. **Guard:** tramos de agenda **no** modifican archivos en `scripts/architecture/sync-shared-files.json` (`pairs` ni `sharedOnlyNoted`) salvo decisión explícita y review aparte.
2. Si un tramo necesita shared: PR separado, `check-shared-parity` + `test:security`, smoke `smoke-sync-roundtrip-qa.mjs`, backup lógico previo a deploy API.
3. Preferir mover solo `apps/web/.../calendar*` y `apps/api/.../calendar*` detrás de fachada; dejar validators/sync en shared hasta módulo sync.

---

## 4. Plan por tramos (propuesta)

Orden: **B puro → A UI/web → persistencia/API** (API MVC ya existe; el “C” es contención en `modulos/agenda` sin tocar sync).

### Tramo B — dominio puro — **HECHO**

- Dominio en `modulos/agenda`; metas consume fachada; sin shim `calendar.ts`.
- Golden master `calendar-descansos.test.mjs`; guard shared en CI.
- Ver §0b.

### Tramo A — UI / web

- `git mv` `components/calendar/*`, `actions/calendar.js` → `modulos/agenda/` + fachada `index.ts`.
- Ruta index y consumidores (clientes que llaman actions) importan fachada.
- Recordatorios: seguir importando `@/modulos/notificaciones` (no mover schedule).

**Verify sin dispositivo:**
- E2E `agenda-entry-modal` + `clients-agenda-intent`
- `build:web:ci`
- Smoke UI QA efímera (crear: alta descanso/no-tour/nota → recarga → fila en UI; purga 0) — patrón notificaciones/metas
- Comparar conteo `calendar_entries` del usuario QA vs tip `main` (antes/después del smoke)

**No mover:** `db-store` cal methods, cloud-persist, shared.

### Tramo persistencia / API (después de A; o en paralelo solo API)

- API: `routes/controllers/services/repositories` calendar → `apps/api/src/modulos/agenda/` + montaje v1 igual.
- **Persistencia cliente / sync / outbox: NO en este módulo** — quedan para módulo sync/storage.

**Verify sin dispositivo:**
- `mvc-contract` paths calendar-entries
- Smoke REST QA: POST/PATCH/DELETE + list
- Comparación filas `calendar_entries` (usuario QA) contra baseline `main`
- **Prohibido** tocar `sync.js` en el mismo PR

### Tramos que NO deben moverse todavía

| Pieza | Por qué |
|-------|---------|
| `packages/shared/**/sync.js`, validators calendar, mappers, sync-columns | Regresión sync |
| Outbox + `sts4_*` adapter | Offline; módulo sync |
| `db-store` ventas/`processDate` | Cruza ventas + agenda |
| OneSignal / construir-recordatorios | Ya en notificaciones |
| Semanas tablero UI metas | Ya en metas; solo depende de descansos |

---

## 5. Decisiones (cerradas)

1. `calendar-descansos` → `modulos/agenda/dominio`; metas → fachada agenda (nunca agenda → metas).
2. Reexports huérfanos en `calendar.ts` eliminados en B (0 consumidores; sin shim).
3. `isCalendarSaleCountable` eliminado; ventas mantiene `isSaleCountable` / `isActiveAgendaSale`.
4. Smoke UI QA efímera = gate **obligatorio del Tramo A** (no de B).
5. API = **Tramo C** aparte.
6. shared/sync intocable en toda Agenda (guard CI).

---

## 6. Aclaración operativa — `sync.reconcile.partial` (últimas 24 h)

Consulta RO sobre `saletse-api-error.log` + clasificación por `auth.users` (sin ids ni emails en el reporte). Ventana ~24 h respecto a la corrida del inventario.

| Clase | Usuarios distintos | Eventos | Notas |
|-------|-------------------:|--------:|-------|
| QA (patrones email test/qa/e2e/smoke) | 0 | 0 | — |
| Reales (cuenta vigente) | **1** | **107** | Protocolo sync `1` |
| Ghost (uid ausente en `auth.users` / profiles) | **6** | **13** | Sesiones huérfanas / cuentas borradas |

**Usuario real (107 eventos):** no es ruido de QA. Motivo dominante del *partial*:

| rejected reason | Tabla | Unidades |
|-----------------|-------|--------:|
| `tombstone` | `prospects` | 428 |
| `padre_rechazado` | `tool_calculations` | 87 |

Mientras tanto el mismo reconcile **sí escribió**: `calendar_entries` updated 530 / inserted 5; `goals` updated 321; `sales` updated 107; `skipped:tombstone` 107.

**Riesgo de pérdida de datos:** bajo para agenda. Los rechazos no son borrados remotos de `calendar_entries`; son intentos de subir prospects ya tombstoneados y tools hijos. El cliente puede seguir reintentando (outbox / protocol 1) — deuda del **Tramo 2 de sync**, no regresión de agenda. Los 13 eventos ghost incluyen 2 `sin_permiso` en `calendar_entries` de uids ya inexistentes: no afectan usuarios activos.

---

## 7. Checklist

- [x] Inventario (`d08e982`)
- [x] Tramo B dominio puro
- [ ] Tramo A UI/web (+ smoke QA gate)
- [ ] Tramo C API `modulos/agenda`
- [ ] Sync/outbox (módulo futuro)
