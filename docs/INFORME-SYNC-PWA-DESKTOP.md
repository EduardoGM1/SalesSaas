# Informe: datos PWA móvil no visibles en Web Desktop

**Fecha:** 2026-08-04  
**Estado:** Causa raíz identificada + corrección implementada (sync seguro multi-dispositivo)  
**Alcance:** Misma SPA Vite (PWA instalada vs navegador desktop), mismo backend y misma BD Supabase

---

## 1. Aclaración de arquitectura (importante)

Salètse **no** tiene dos apps distintas (no es Next.js desktop + React Native).  
Es **una sola SPA** (`apps/web`) servida como:

- **PWA standalone** en móvil (`display-mode: standalone` / instalada), y  
- **navegador desktop** en la misma URL/origin.

Ambas usan el mismo código, el mismo `/api/v1` y el mismo proyecto Supabase.  
Lo que **no** comparten es el **`localStorage` del dispositivo** (cada navegador/dispositivo tiene el suyo).

Por tanto el problema **no** es “dos backends” ni “dos tenants distintos por build”, sino el diseño **offline-first + sync snapshot**.

---

## 2. Respuestas directas

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Dónde se rompe el flujo? | Entre **BD → store local del Desktop** (refresh inbound / UI), y en carreras graves también en **reconcile con `deleteMissing`**. |
| 2 | ¿Guardar, consultar o UI? | Guardado en móvil suele OK (local + PUT sync). Fallo principal: **Desktop no refresca a tiempo** su copia local; la UI lee Zustand/`localStorage`, no la BD en vivo. |
| 3 | ¿Todos los módulos? | Afecta a casi todos los que viven en el sync blob; **peor en tools** (`tool_calculations`: sin Realtime en dashboard). Clientes/agenda/ventas/metas mejoran si Realtime dispara pull. |
| 4 | ¿BD, permisos, sync, caché o frontend? | **Sync + caché local (frontend)**. No es RLS “bloqueando Desktop” de forma habitual (misma sesión/usuario). |
| 5 | ¿Causa raíz? | Modelo offline-first: UI = `localStorage` (`sts4_v1`). Multi-dispositivo depende de pull/Realtime; Desktop tiene cooldown 45s, sin polling, y Realtime incompleto. Además, reconcile hace **deleteMissing** del snapshot local → un Desktop stale puede **borrar** lo que el móvil acaba de subir. |

---

## 3. Flujo real de sincronización

```
┌─────────────────────┐
│  PWA móvil          │
│  1) Mutación UI     │
│  2) Zustand +       │
│     localStorage    │  ← UI lee AQUÍ
│     (sts4_v1)       │
│  3) Debounce 1.2s   │
│  4) PUT /api/v1/sync│
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  API sync-service   │
│  reconcile(upsert + │
│  deleteMissing)     │
│  → PostgreSQL       │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│  Desktop            │
│  ¿Cómo se entera?   │
│  A) Realtime → pull │  (solo prospects/sales/goals/calendar)
│  B) focus/visibility│  (cooldown 45s; force solo en PWA)
│  C) carga inicial   │
│  → replaceDb local  │
│  → UI lee local     │
└─────────────────────┘
```

### Componentes clave

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Store local | `apps/web/src/stores/db-store.ts` | Fuente de verdad de la UI |
| Persistencia | `lib/storage/local-storage-adapter.ts` → key `sts4_v1` | Por dispositivo/origen |
| Sync orchestration | `components/providers/sync-provider.jsx` | Pull inicial, debounce outbound, resume inbound |
| API | `GET/PUT /api/v1/sync` → `sync-service.js` | Pull / reconcile |
| Reconcile | `packages/shared/src/data/sync.js` | upsert + **`deleteMissing`** |
| Realtime dashboard | `lib/dashboard-data-realtime.js` | Tablas: prospects, sales, goals, calendar_entries → fuerza pull |

---

## 4. Evidencia técnica de la causa raíz

### 4.1 La UI no consulta la BD directamente

La mayoría de listados (clientes tras merge inicial, agenda, metas, tools) leen **`useDbStore`**.  
Si Desktop no hace `replaceDb` con datos frescos, **no hay nada que mostrar**, aunque Supabase ya tenga las filas.

### 4.2 Desktop refresca peor que la PWA

En `sync-provider.jsx`:

- Cooldown resume Desktop: **45_000 ms**
- Cooldown PWA: **5_000 ms**
- Al volver a primer plano: `force: true` **solo si** `isStandaloneApp()` (PWA)

Consecuencia: un Desktop con pestaña abierta puede **no tirar pull** al focus durante 45s, y si Realtime falló/no cubre la tabla, la UI queda stale.

### 4.3 Realtime incompleto

`dashboard-data-realtime.js` suscribe solo:

`prospects`, `sales`, `goals`, `calendar_entries`

**No** incluye:

- `tool_calculations` (Survey / Vacaciones / Worksheet) a nivel dashboard  
- `activities`

Cambios de tools hechos en móvil **no invalidan** el Desktop salvo pull completo (login, force refresh, o estar dentro del expediente con canal de collab).

### 4.4 Riesgo destructivo: `deleteMissing`

Tras upsert, el reconcile borra en remoto todo lo del usuario/workspace que **no** esté en el snapshot local enviado:

```text
deleteMissing(prospects | sales | calendar | activities | tools…)
```

Escenario típico:

1. Móvil crea expediente → PUT sync → fila en BD.  
2. Desktop sigue con `localStorage` viejo (sin esa fila).  
3. Usuario toca algo en Desktop → debounce → **PUT** con snapshot incompleto.  
4. `deleteMissing` **elimina** el expediente recién creado.  
5. Desktop “nunca lo ve”; a veces ni el móvil tras el siguiente pull.

Esto encaja con “hace falta recargar o nunca aparece”.

### 4.5 Lo que NO parece ser el problema habitual

| Hipótesis | Evaluación |
|-----------|------------|
| Distinto proyecto Supabase PWA vs Desktop | Misma app / mismos env de build |
| RLS bloquea solo Desktop | Misma sesión JWT / mismo `user_id`; pull usa el mismo contexto |
| React Query / SWR / caché Next.js | **No se usan** (Vite + Zustand + localStorage) |
| Tenant distinto por build | `workspace_activo_id` está en `profiles` (servidor), no por dispositivo |
| Datos nunca se guardan | Si en móvil se ve tras cerrar/reabrir PWA con sync OK, está en BD o al menos se empujó; verificar Network `PUT /api/v1/sync` 200 |

### 4.6 Matiz workspace

`workspace_activo_id` es **uno por usuario en servidor**. Si el usuario cambió de sala en un dispositivo, el sync del otro usa ese contexto. Puede parecer “no sync”, pero es filtro de workspace. Menos frecuente que el stale local + deleteMissing.

---

## 5. ¿Guardar / consultar / UI?

| Etapa | ¿Falla? | Notas |
|-------|---------|-------|
| Guardar (móvil → local) | No | Inmediato |
| Guardar (móvil → API/BD) | Raro | Debounce 1.2s; sin cola offline robusta si falla el PUT |
| Consultar BD (Desktop) | Indirecto | Desktop consulta vía sync pull, no cada pantalla |
| Actualizar UI Desktop | **Sí — principal** | Store local no actualizado |
| Reconcile Desktop stale | **Sí — grave** | Puede borrar datos remotos nuevos |

---

## 6. Módulos afectados

| Módulo | Severidad | Por qué |
|--------|-----------|---------|
| Survey / Vacaciones / Worksheet | Alta | Sin Realtime dashboard de `tool_calculations` |
| Clientes / Expedientes | Alta–Media | Depende Realtime + pull; lista no refetch al focus |
| Agenda / Ventas / Metas | Media | Cubiertos por Realtime si el canal está vivo |
| Settings | Especial | `applyRemote` preserva settings locales sobre remotas |

---

## 7. Riesgos encontrados

1. **Pérdida de datos cross-device** por `deleteMissing` + snapshot incompleto.  
2. **Falsa sensación de “BD desincronizada”** cuando en realidad el Desktop muestra caché local.  
3. **Realtime frágil en background** (documentado en código para PWA); Desktop confía demasiado en WS sin pull periódico.  
4. **Sin cola offline durable**: PUT fallido no se reintenta hasta el próximo cambio.  
5. Posible **caché NetworkFirst del SW** en `/api/` (PWA) si la red tarda (>10s) — riesgo secundario en GET sync.

---

## 8. Propuesta de solución (sin implementar aún)

Debe atacar la causa raíz: **multi-dispositivo + sync snapshot no es seguro con deleteMissing ciego**.

### 8.1 Corto plazo (seguridad de datos)

1. **Eliminar o acotar `deleteMissing`** en reconcile (solo borrar ids marcados localmente como deleted, o soft-delete con tombstones).  
2. En `refreshInbound`: **nunca** convertir un pull de resume en `doReconcile` si el local puede estar stale; preferir **pull-only merge**.  
3. Desktop: al `visibilitychange`/`focus`, **force pull** (igual que PWA) o bajar cooldown drásticamente.  
4. Ampliar Realtime a `tool_calculations` (y opcionalmente `activities`) o invalidar sync al cambiar tools.

### 8.2 Medio plazo (arquitectura)

5. Merge inbound **por `updated_at` / versión** (LWW por fila), no replace total ciego del blob.  
6. Tombstones: `{ id, deleted_at }` en sync para borrados intencionales.  
7. Tras pull, pantallas de listado (Clientes) deben **refetch página remota** al volver visibles, no solo pinned.  
8. Indicador UI de “sincronizando / desfasado” cuando el último pull > N segundos.

### 8.3 Qué NO hacer como “parche único”

- Auto-`location.reload()` periódico.  
- Polling agresivo sin arreglar `deleteMissing` (seguiría habiendo wipe).  
- Duplicar backends o desactivar offline-first sin plan.

---

## 9. Impacto de la corrección

| Cambio | Impacto positivo | Riesgo |
|--------|------------------|--------|
| Quitar/acotar `deleteMissing` | Deja de borrar datos del otro device | Borrados locales pueden “reaparecer” hasta haber tombstones |
| Force pull en Desktop focus | UI se actualiza al volver a la pestaña | Más tráfico sync |
| Realtime tools | Survey/Worksheet visibles cross-device | Más canales WS |
| Merge por updated_at | Sync multi-dispositivo fiable | Migración de contratos sync |

Compatible con MultiTenant: el sync ya filtra por `workspace_id` / `user_id` vía `getRequestWorkspaceContext`; la corrección no cambia el modelo de tenant, solo la **semántica del reconcile**.

---

## 10. Plan de implementación (cuando se autorice)

| Fase | Trabajo | Criterio de hecho |
|------|---------|-------------------|
| 0 | Reproducir con Network: PUT móvil 200 → GET desktop incluye id → si Desktop PUT sin id, confirmar wipe | Capturas / logs |
| 1 | Hotfix: pull-only en resume; no reconcile automático en refreshInbound si hay timer | Desktop ve altas de móvil sin reload |
| 2 | Tombstones o desactivar deleteMissing destructivo | Ningún borrado cruzado en pruebas |
| 3 | Realtime `tool_calculations` + refetch Clientes onVisible | Tools y listados al día |
| 4 | Merge LWW por fila + tests e2e multi-contexto (2 browsers) | Suite verde |

### Prueba de aceptación

1. Desktop abierto en Clientes (pestaña en foco o en background).  
2. En PWA: crear expediente + editar Survey.  
3. Sin F5 en Desktop: en ≤ pocos segundos (o al volver a la pestaña) aparecen ambos cambios.  
4. Desktop edita otro campo: **no** desaparece lo creado en móvil.

---

## 11. Cómo verificar la causa en un caso real (ops)

En DevTools:

1. **Móvil (o emulación PWA):** Network → tras crear, `PUT /api/v1/sync` status 200 y body de respuesta con el nuevo id.  
2. **Supabase:** fila en `prospects` / `tool_calculations` con ese id y `workspace_id` esperado.  
3. **Desktop:** ¿llega `GET /api/v1/sync` o evento Realtime → refresh? ¿El JSON trae el id?  
4. Si Desktop hace `PUT /api/v1/sync` **sin** ese id justo después → causa raíz confirmada (`deleteMissing`).  
5. Si nunca hay GET/refresh → causa raíz confirmada (UI stale / cooldown / Realtime).

---

## 12. Conclusión

**Causa raíz:** arquitectura offline-first donde cada dispositivo tiene su propia BD en `localStorage`, y la sincronización multi-dispositivo depende de pull/Realtime incompletos en Desktop, agravada por un reconcile que **borra remotes ausentes en el snapshot local**.

No es un fallo típico de “otra base de datos” ni de RLS MultiTenant entre PWA y Desktop.  
La solución debe hacer el sync **seguro ante snapshots incompletos** y garantizar **refresh inbound fiable** en Desktop — no maquillar con reloads.

---

## 13. Corrección aplicada (2026-08-04)

| Cambio | Archivos |
|--------|----------|
| Eliminado `deleteMissing` ciego; solo `pendingDeletes` explícitos | `packages/shared/src/data/sync.js` |
| Cola de borrados + LWW merge inbound | `sync-pending-deletes.js`, `sync-merge.js`, `db-store.ts` |
| Desktop = PWA en pull forzado al focus (5s cooldown) | `sync-provider.jsx` |
| Inbound: pull+merge → luego push si hay cambios locales | `sync-provider.jsx` |
| Realtime: `tool_calculations` + `activities` | `dashboard-data-realtime.js` |
| Clientes teamScope refetch al visible | `clients-page.jsx` |
| `updatedAt` en mappers / mutaciones | `mappers.js`, `mappers.ts`, types |

**Qué se quitó (innecesario / peligroso):** reconcile que borraba todo lo ausente del snapshot local; cooldown Desktop 45s; force-pull solo en PWA; Realtime incompleto para tools.

**Qué se mantiene (necesario):** offline-first local + PUT upsert; MultiTenant por `workspace_id`; debounce outbound; Realtime como invalidación → push/pull.

### Follow-up (persistía “solo en móvil”)

Causa residual: crear expediente era **solo local**; el debounce PUT a menudo no corría en PWA (background) y `refreshInbound` no detectaba filas solo-locales para subirlas.

Corrección adicional:
- `POST /api/v1/prospects` al crear (persistencia inmediata).
- Flag `dirtyOutbound` + `localNeedsOutboundPush` → PUT tras merge/resume/init.
- `requestSyncPush` inmediato; Clientes fuerza refresh al montar.
