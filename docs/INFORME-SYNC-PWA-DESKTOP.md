# Informe: Sync PWA ↔ Desktop (Salètse)

**Fecha:** 2026-08-04  
**Estado:** Causa raíz documentada + mitigaciones estructurales implementadas (Outbox durable, NetworkOnly sync, recovery blob, realineación workspace)  
**Alcance:** Misma SPA Vite (PWA vs navegador desktop), mismo backend y misma BD Supabase

---

## Causa raíz

Modelo **Offline-First por dispositivo**: la UI lee `localStorage` (`sts4_v1`), no PostgreSQL en vivo. La nube es proyección eventual vía `GET/PUT /api/v1/sync`, scoped por `profiles.workspace_activo_id` (un valor global por usuario).

No son dos apps ni dos proyectos Supabase. Se rompe la convergencia cuando:

1. El origen no flushea el blob (debounce/background), o  
2. El destino no hace pull fresco / SW cacheaba `/api/`, o  
3. Los dispositivos usan distinto workspace activo en el perfil.

---

## Flujo actual (post-fix)

```
Mutación → db-store + sts4_v1 + Outbox (sts4_outbound_v1)
         → debounce 1.2s / flush → PUT /api/v1/sync
         → upsert + pendingDeletes → PostgreSQL
         → Realtime (6 tablas) → requestSyncRefresh(force)
         → pull + merge LWW → UI otro dispositivo

Create expediente → además POST /api/v1/prospects (inmediato)

Init / online / foreground → alignWorkspace → recoverLocalBlob → pull/merge/push
```

### Piezas clave

| Pieza | Archivo |
|-------|---------|
| Orquestación | `apps/web/src/components/providers/sync-provider.jsx` |
| Outbox durable | `apps/web/src/lib/sync-outbox.js` → key `sts4_outbound_v1` |
| Merge LWW | `apps/web/src/lib/sync-merge.js` |
| Borrados explícitos | `sync-pending-deletes.js` + `packages/shared/src/data/sync.js` |
| Recovery blob | `recover-local-prospects.js` |
| Workspace multi-device | `workspace-align.js` |
| Realtime | `dashboard-data-realtime.js` (prospects, sales, goals, calendar, tools, activities) |
| SW | `vite.config.js` — NetworkOnly para `/api/v1/sync` y `/api/v1/prospects` |

---

## Mitigaciones implementadas

| Problema | Fix |
|----------|-----|
| `deleteMissing` destruía filas del otro device | Eliminado; solo `pendingDeletes` |
| Desktop no pull / cooldown 45s | Pull forzado al focus (5s); mismo para PWA |
| Create solo local | `POST /prospects` + Outbox |
| `dirtyOutbound` solo en RAM | Outbox durable `sts4_outbound_v1` |
| SW NetworkFirst stale en `/api/` | NetworkOnly en sync/prospects |
| Recovery incompleta | POST faltantes + PUT si Outbox/local-ahead (cal/goals incluidos) |
| Workspace global confuso | `alignWorkspaceWithServer` al foreground/online |
| UX sin feedback | Chip topbar Pendiente / Sync / Offline |

---

## Limitaciones conscientes

- Tools: LWW por **bucket** (no campo a campo) en edición concurrente.
- Realtime en background PWA sigue dependiendo del resume.
- `workspace_activo_id` sigue siendo uno por usuario en servidor (no por dispositivo); se realinea la UI al detectar cambio.

---

## Pruebas

Ver checklist: [`docs/TEST-SYNC-PWA-DESKTOP.md`](./TEST-SYNC-PWA-DESKTOP.md)
