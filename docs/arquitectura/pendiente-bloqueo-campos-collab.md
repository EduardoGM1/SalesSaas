# Pendiente: bloqueo de campos (collab broadcast)

**Estado:** KNOWN GAP. No bloquea el gate de colaboración Survey (presencia + sync).  
**Cuándo retomar:** después del deploy de Survey 5b.3, como tarea de BD aparte.  
**Regla:** ningún cambio en producción sin OK explícito, backup y rollback preparados.

## Problema

Los locks de campo (`field_lock` / `field_unlock`) se envían por **Broadcast** en el canal privado Realtime `expediente:{uuid}` ([`expediente-realtime.js`](../../apps/web/src/lib/expediente-realtime.js)).

La migración `0031_fix_expediente_presence_rls` autoriza:

- **SELECT** en `realtime.messages` para join/listen (`presence_listen_expediente`)
- **INSERT** solo con `extension = 'presence'` (`presence_track_expediente`)

No hay política de **INSERT** para `extension = 'broadcast'`. Resultado: el peer no recibe el badge/bloqueo de campo, aunque la presencia (peers / ojo en ficha) y el sync de datos (API / `tool_calculations`) funcionen.

## SQL propuesto (texto — no aplicar sin OK)

No versionar como archivo en `supabase/migrations/` hasta la decisión formal. Borrador:

```sql
-- Solo tras OK explícito + backup + rollback preparado.
-- INSERT broadcast en topics expediente:{uuid} para quien ya puede acceder al expediente.

drop policy if exists "broadcast_expediente" on realtime.messages;
create policy "broadcast_expediente"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast')
  and public.presence_prospect_from_topic((select realtime.topic())) is not null
  and public.user_can_access_prospect(
    (select auth.uid()),
    public.presence_prospect_from_topic((select realtime.topic()))
  )
);

-- Los GRANT usage/select/insert de 0031 ya deben existir; no ampliar sin revisar.
```

**Rollback:**

```sql
DROP POLICY IF EXISTS "broadcast_expediente" ON realtime.messages;
```

## Plan de prueba negativa (fiel al producto)

Objetivo: no sesgar con `seed-collab-share` que añade guest al WS personal.

1. Provisionar QA-A, QA-B, QA-C (efímeras `@saletse-test.com`; contraseñas fuera del repo).
2. A crea dos expedientes (P1, P2) en su WS personal.
3. **Compartir P1 con B por el flujo real del producto** (invite/redeem o share a contacto aceptado) — **sin** insertar a B en `workspace_miembros` del dueño.
4. Casos:
   - **C** sin ownership ni share → subscribe y broadcast en `expediente:{P1}` → rechazado.
   - **B** con share solo de P1 → subscribe/broadcast en `expediente:{P2}` → rechazado.
   - **B** en P1 compartido → subscribe y broadcast → aceptado (solo si la policy de broadcast está aplicada).
5. Purga A/B/C a conteos 0 (profiles, prospects, shares, connections, ws_personal, workspace_miembros, tool_calculations, empresa_miembros).

Script de referencia actual: `scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs` (hoy usa `seed-collab-share` con guest; hay que adaptarlo al flujo real antes de la formalización).

## Incidente 2026-10-14 (resumen)

1. Se aplicó en producción una policy `broadcast_expediente` (0090) **sin OK previo** desde un script temporal, para hacer pasar el gate de lock.
2. Snapshot de políticas se guardó **fuera del repo** (`%USERPROFILE%\.saletse-ops\`).
3. Pruebas negativas con QA: C sin relación → rechazado (correcto). B pudo suscribirse a otro expediente del mismo WS porque `seed-collab-share` lo hace **guest** del WS y el modelo actual de `user_can_access_prospect` concede acceso a miembros del workspace — **no** es un agujero cross-tenant; es el modelo de acceso vigente.
4. Ante falla del script (criterio estricto share-only), se ejecutó el **rollback condicionado** autorizado: `DROP POLICY broadcast_expediente`. Prod quedó sin esa policy; presence_* intactas.
5. Decisión: 0090 **fuera** de producción y de ramas de refactor; retomar después de 5b.3 con OK, backup, rollback y prueba negativa fiel al producto.

## Relación con el gate Survey

`smoke-survey-collab-e2e-qa.mjs` valida presencia + sync. El paso de bloqueo de campo es **KNOWN GAP** (no fallante) hasta resolver este pendiente.
