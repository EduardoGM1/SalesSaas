# Parte 0 — Sync en producción: verificación y causa del dominio stale

**Fecha:** 2026-08-05  
**Estado:** COMPLETADA — `GET/PUT /api/v1/sync` → **200** en `https://saletse.vercel.app`

---

## 1. Confirmación de código (diagnóstico)

| Cambio | Archivo | Estado en repo |
|---|---|---|
| `SYNC_SELECT` sin columnas inexistentes | `packages/shared/src/data/sync-columns.js` | ✅ desde `d026356` |
| mappers sin `updated_at` en sales/calendar upsert | `packages/shared/src/data/mappers.js`, `apps/web/src/lib/data/mappers.ts` | ✅ |
| `runService` → 500 JSON (no re-lanzar) | `apps/api/src/routes/route-utils.js` | ✅ |

---

## 2. Causa real del 504 “tras deploy”

El commit `3bd9f09` **sí** estaba en Production en el proyecto Vercel `saletse`, pero el dominio público **`saletse.vercel.app` seguía aliasado a un deployment de hace ~6 días** (`saletse-otj68ccni…`, build `7157409`).

| URL | build-id | GET /sync |
|---|---|---|
| Deployment directo `…7066353u6…` | `3bd9f09` | **200** ~1.1 s |
| `saletse.vercel.app` (antes) | `7157409` | **504** ~30 s |
| `saletse.vercel.app` (después de re-alias) | `3bd9f09` | **200** ~0.7 s |

Acción aplicada:

```bash
npx vercel alias set saletse-7066353u6-eduardolalito99-2908s-projects.vercel.app saletse.vercel.app
```

**Riesgo operativo:** `saletse.vercel.app` es un alias sticky; no se actualiza solo con cada Production deploy. Tras cada deploy a `main`, hay que reasignar el alias (o automatizarlo). Los redirects de `vercel.json` envían `sales-app-nine-gamma` → `saletse.vercel.app`, por lo que un alias stale oculta el código nuevo.

---

## 3. Verificación post-fix (prod)

```json
{
  "base": "https://saletse.vercel.app",
  "buildId": "3bd9f098be200b74648ae8153d19973c722b794b",
  "GET_sync": { "status": 200, "ms": 683, "clients": 13 },
  "PUT_sync": { "status": 200, "ms": 605, "clients": 14 }
}
```

`scripts/verify-sync-pull.mjs`: OK (`pullMs` ~421, `reconcileMs` ~337, `hasKnuyygy: true`).

Hidratación dispositivo limpio: un cliente sin blob local que llame `GET /api/v1/sync` recibe los 13–14 expedientes del workspace activo (verificado vía API autenticada = equivalente a PWA limpia).

---

## 4. ¿El sync roto explicaba otros síntomas?

### “Calificación de un expediente compartido no se refleja en Clientes”

**Veredicto: NO es el mismo bug.** No aplicar una segunda corrección de “referencia vs copia” solo por este síntoma sin más evidencia.

- La columna Calificación = `prospects.tipo_tour` vía `formatQualification`.
- Expedientes compartidos pinneados usan `GET /api/v1/shares/workspace` (referencia viva a `prospects`), **no** el blob de `/sync`.
- El 504 de sync afectaba hidratación de **propios** en dispositivos con local vacío; no el path de pins compartidos.

Si el síntoma persiste tras sync sano: investigar refresh/realtime de pins o overwrite por merge del dueño — ticket aparte.

### Sí se explica por sync 504 (de rebote, ya mitigado)

- PWA/Desktop limpio sin expedientes pese a filas en PostgreSQL.
- Tools/agenda/metas “no sincronizan” entre dispositivos.
- Outbox que nunca vaciaba vía `PUT /sync`.
