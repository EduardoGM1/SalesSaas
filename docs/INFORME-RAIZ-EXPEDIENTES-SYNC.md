# Informe raíz: expedientes no sincronizan PWA ↔ Desktop

**Fecha:** 2026-08-05  
**Estado:** causa raíz identificada, correcciones en `main` (pendiente deploy Vercel)

---

## 1. Causa raíz (evidencia)

El fallo **no es uno solo**; son **cuatro causas encadenadas**:

### A) Producción desactualizada (bloqueante inmediato)

| Entorno | build-id / commit |
|---|---|
| **Producción** (`saletse.vercel.app`) | `7157409` — *fix(auth): recovery sin PKCE* |
| **Repositorio** (`main`) | `9ed1bcb` + fixes posteriores |

Producción está **≥2 commits atrás** de los fixes de sync (`d026356` SYNC_SELECT) y online-first (`9ed1bcb`).  
Mientras no despliegue, `/api/v1/sync` sigue respondiendo **504** en prod.

### B) `/api/v1/sync` roto → fallback bulk muerto

Prueba autenticada en prod (2026-08-05):

| Endpoint | Status | Tiempo |
|---|---|---|
| `GET /api/v1/sync` | **504** | ~30 s |
| `PUT /api/v1/sync` | **504** | ~30 s |
| `GET /api/v1/prospects` | **200** | ~2 s |
| `POST /api/v1/prospects` | **504** (respuesta) | ~30 s |

Localmente `pullAll` con el fix tarda **~563 ms** y funciona (`scripts/verify-sync-pull.mjs`).

**Conclusión:** el bulk sync está roto en prod por código viejo; el cliente encola `PUT /sync` como fallback y **también falla**.

### C) POST `/prospects` bloqueado por side-effects de sala (504)

Usuario activo en workspace **`salesroom1` (sala_de_venta)**.

`createProspect` insertaba en PostgreSQL y **después** ejecutaba de forma síncrona:

- `prospect_workflows` upsert  
- RPC `sync_prospect_chat_members`

Eso superaba **30 s** (`maxDuration` Vercel). El cliente recibía **504**, pero la fila **sí existía** en BD (evidencia: `GET /prospects/:id` → 200 tras POST 504).

**Efecto:** la PWA cree que falló → solo localStorage → no refresca lista desde API.

**Fix:** side-effects de sala en **background**; respuesta HTTP inmediata tras INSERT.

### D) Workspace activo distinto entre dispositivos / caché local

| Workspace | Tipo | Expedientes en PostgreSQL |
|---|---|---|
| `3da4e830…` (Eduardo personal) | personal | **10** |
| `cdb9c9d3…` (salesroom1) | sala_de_venta | **1** (+ nuevos) |

`profiles.workspace_activo_id` = **`cdb9c9d3…` (salesroom1)**.

- API lista expedientes **solo del workspace activo** → `GET /prospects` devuelve **1** en sala.
- Desktop puede seguir mostrando **10** del blob local (`sts4_v1`) del workspace personal anterior.
- PWA con local vacío en sala → **0** en UI aunque BD tenga datos en otro workspace.

**No es fallo de PostgreSQL:** es **desalineación workspace + UI lee localStorage**.

---

## 2. Flujo roto (diagrama)

```
[Crear expediente PWA]
    → saveClient (localStorage) ✓
    → cloud-persist POST (504 en prod) ✗ UI cree fallo
    → queueFallback PUT /sync (504) ✗
    → Usuario ve expediente local
    → Desktop (otro workspace / otro blob) no lo ve

[Init sync PWA]
    → GET /sync (504) ✗
    → No hidrata desde nube
    → Lista vacía si local vacío
```

**Punto de ruptura principal:** respuesta HTTP 504 en prod (sync + create sala) + lectura UI desde local sin confirmación API.

---

## 3. Refactorizaciones realizadas

| Cambio | Justificación |
|---|---|
| **`prospects-persist.js`** (nuevo) | Fuente única POST/PATCH/GET expedientes; elimina 3 duplicados |
| **`createProspectFromName` online-first** | `await persistProspectOnlineFirst` antes de confirmar éxito |
| **`saveClient({ skipCloud })`** | Evita eco al hidratar desde API |
| **`createProspect` side-effects async** | Evita 504 en salas |
| **`hydrateProspectsFromApi`** | Fallback cuando `/sync` falla; usa GET `/prospects` |
| **`sync-service` logging** | Trazabilidad pull/reconcile |
| **Consolidación mirror/recover** | Usan `prospects-persist.js` |

### Archivos modificados

- `apps/web/src/lib/prospects-persist.js` (nuevo)
- `apps/web/src/actions/clients.js`
- `apps/web/src/stores/db-store.ts`
- `apps/web/src/lib/cloud-persist.js`
- `apps/web/src/lib/cloud-persist-bridge.js`
- `apps/web/src/lib/clients-mirror.js`
- `apps/web/src/lib/recover-local-prospects.js`
- `apps/web/src/components/providers/sync-provider.jsx`
- `apps/web/src/components/clients/clients-page.jsx`
- `apps/api/src/services/prospects-service.js`
- `apps/api/src/services/sync-service.js`
- `scripts/diag-prospect-e2e.mjs`

---

## 4. Endpoints probados (prod, JWT real)

| Endpoint | Resultado |
|---|---|
| `GET /api/v1/auth/session` | 200 — permisos `expedientes:crear` OK |
| `GET /api/v1/sync` | **504** |
| `PUT /api/v1/sync` | **504** |
| `GET /api/v1/prospects` | 200 — count acorde a workspace activo |
| `POST /api/v1/prospects` | **504** (pero fila creada en BD) |
| `GET /api/v1/prospects/:id` | 200 |
| `PATCH /api/v1/prospects/:id` | 200 |
| `DELETE /api/v1/prospects/:id` | 200 (cleanup prueba) |

Local (Supabase directo + fix SYNC_SELECT):

| Prueba | Resultado |
|---|---|
| `pullAll` + reconcile | OK ~563 ms |
| Round-trip create/delete | OK |

---

## 5. Evidencia PostgreSQL

Expedientes existen en BD (service role):

- `knuyygy` → `P-013599`, workspace personal
- `ggyd` → `P-403894`, workspace sala
- Probes E2E `diag-root-*` creados y verificados por id

**La base de datos persiste.** El problema es **cliente ↔ API ↔ workspace ↔ caché local**.

---

## 6. Casos de prueba (post-deploy)

| Caso | Criterio de éxito |
|---|---|
| 1. Crear Desktop | POST 201, fila en BD, visible PWA tras refresh |
| 2. Crear PWA | POST 201 (<5 s), fila en BD, visible Desktop |
| 3. Offline → online | Outbox sube vía POST/recover |
| 4–5. Editar cross-device | PATCH 200 + Realtime o GET prospects |
| 6. Tools | PUT `/tool-calculations` |

**Precondición:** mismo `workspace_activo_id` en ambos dispositivos (hint en UI Clientes).

---

## 7. Riesgos

1. **Deploy pendiente** — sin Vercel actualizado, prod sigue roto.
2. **PWA con SW viejo** — forzar update tras deploy.
3. **Workspace split** — 10 expedientes en personal vs 1 en sala; alinear workspace antes de probar sync.
4. **PUT /sync sigue siendo lento** con muchos datos en sala (gerente teamScope); REST por entidad es el camino principal.

---

## 8. Recomendaciones

1. **Desplegar `main` a Vercel** y verificar `build-id.txt` = commit actual.
2. **Confirmar mismo workspace** en Desktop y PWA (Configuración / hint Clientes).
3. **Abrir Clientes** en ambos tras deploy (mirror + hydrate fallback).
4. **CI smoke:** `GET /api/v1/sync` autenticado debe ser 200 < 5 s.
5. **No depender solo de `/sync`** para expedientes; REST `/prospects` es fuente de verdad del listado.

---

## 9. Conclusión

La implementación será correcta cuando:

- [x] Código en repo: online-first + sync fix + POST no bloqueante  
- [ ] **Deploy prod** con commits recientes  
- [ ] POST/GET prospects 200 en prod  
- [ ] Mismo workspace activo en ambos dispositivos  
- [ ] Expediente visible en UI **y** recuperable vía API **y** presente en PostgreSQL
