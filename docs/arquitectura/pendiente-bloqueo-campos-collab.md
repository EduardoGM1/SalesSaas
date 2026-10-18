# Pendiente: bloqueo de campos (collab broadcast)

**Estado:** CLIENTE MÍNIMO desplegado (`fe26b10` web). 0098 **no aplicada**: el canario variante (ii) la aplicó y se revirtió automáticamente por una falla del instrumento de medida de presence (ver § Canario ii). Bloqueo de campo sigue como **KNOWN GAP**.  
**Regla:** ningún cambio en BD/config de producción sin OK, backup y rollback preparados.  
**Decisión de prueba:** no Postgres nativo / no Docker. El **canario en producción** es el mecanismo de prueba real (solo tras OK).

## Intento 1 (2026-10-18) — variante share-only, abortado antes de apply

Con `seed-collab-share-only`, B obtiene **CHANNEL_ERROR**: `user_can_access_prospect` (0052) exige `user_in_workspace` también en la rama de shares. El usuario eligió la variante (ii) (B invitado del workspace, modelo real de `createShare`) y no modificar la función.

## Canario ii (2026-10-18) — aplicado y revertido automáticamente

Seed: A dueño de P1/P2; B = miembro del WS de A + share de P1 (`seed-collab-share`); C fuera del WS y sin share.

| # | Caso | Esperado | Observado |
|---|------|----------|-----------|
| 0 | Snapshot pre | 4 `presence_*`, sin broadcast | OK |
| 1 | Bug pre-apply: A→B `field_lock` en P1 | B no recibe | **Reproducido** (A y B SUBSCRIBED; `send=ok`; B no recibe) |
| 2 | Apply una sola `CREATE POLICY` | count=1 | OK |
| 3 | 4 `presence_*` intactas | idénticas (qual/with_check/roles) | OK |
| 4 | Positivo A→B | B recibe | **OK** |
| 5 | Positivo B→A | A recibe | **OK** |
| 6 | Presence A↔B | cada uno ve 2 keys | **FALLÓ (0/0)** → rollback automático |
| 7 | Negativo C en P1 | no SUBSCRIBED, nada recibido | no llegó a medirse |
| 8 | B en P2 no compartido (hallazgo) | SUBSCRIBED por modelo | no llegó a medirse en este run; ver backlog |
| 9 | Topic mal formado / no-expediente | sin cambio vs pre | pre: CHANNEL_ERROR en ambos; post no medido |
| R | `DROP POLICY IF EXISTS "broadcast_expediente"` | 4 policies | **OK** (re-snapshot: 4 `presence_*`) |

**Causa de la falla (sin cambios de BD, diagnóstico efímero):** el instrumento, no la política. realtime-js solo habilita presence si el canal registra un listener `presence` **antes** de `subscribe`. El script no lo hacía: el mismo contador ya daba 0 **antes** del apply. Repetición sin política: sin listener → 0/0 keys; con listener → 2/2. El gate UI de Paso 3 (barra `exp-presence-bar`) confirmó presence en prod con el cliente real.

El canario está corregido (listener `presence` agregado). **Re-ejecución pendiente de OK nuevo** (regla de corte: falla → rollback + stop).

Snapshots (fuera del repo, `~/.saletse-ops/`): `realtime-messages-policies-{pre,post,post-rollback}-mvd9baf3.json`, reporte `canary-0098-report-mvd9baf3.json`. Purga QA: 0 en todas las tablas (incl. `goals`, `scheduled_push_jobs`).

**Hallazgo de seguridad (no se cambia):** B, al ser miembro del workspace, accede también al canal de otros expedientes de ese workspace (propiedad de `user_can_access_prospect`). Con 0098 podría además emitir broadcast ahí. Dimensionamiento en [`backlog-seguridad.md`](./backlog-seguridad.md).

## Problema

Los locks de campo (`field_lock` / `field_unlock`) se envían por **Broadcast** en el canal privado Realtime `expediente:{uuid}` ([`expediente-realtime.js`](../../apps/web/src/lib/expediente-realtime.js)).

La migración `0031_fix_expediente_presence_rls` autoriza SELECT (listen) e INSERT solo `presence`. No hay INSERT para `broadcast` → el peer no recibe el badge.

**Observabilidad:** send sin policy INSERT se **descarta en silencio**. Criterios:

| Tipo | Criterio |
|------|----------|
| Positivo | Par con acceso (SUBSCRIBED) **RECIBE** `field_lock` |
| Negativo | Sin acceso **NO** logra SUBSCRIBED; no recibe nada |
| Cobertura INSERT | Post-apply: `pg_policies` / `check-broadcast-policy` confirma `broadcast_expediente`. Denegaciones INSERT no separables del descarte silencioso |

## Cliente (implementado en esta rama — deploy web-only antes de 0098)

| Ítem | Estado |
|------|--------|
| (a) Unlock best-effort en teardown/pagehide | Hecho |
| (b) Throttle de warns | Hecho (`expediente-field-lock-helpers.js`) |
| Multi-pestaña | **Pendiente** (heaps separados; propio `user_id` ignorado en locks remotos) |

Plan deploy web-only: [`deploy-cliente-locks-pre-0098.md`](./deploy-cliente-locks-pre-0098.md) — **sin ejecutar**.

TTL 60s + presence leave siguen como red de seguridad si el unlock no llega.

## Seed share-only (en repo)

```bash
python scripts/architecture/qa-geo-fx-ephemeral.py seed-collab-share-only <A> <B> <prospect_id> [edit]
python scripts/architecture/qa-geo-fx-ephemeral.py assert-collab-share-only <A> <B> <prospect_id>
# o smoke end-to-end + purga:
node scripts/architecture/smoke-seed-collab-share-only-qa.mjs
```

Aserciones RO: `share >= 1`, `guest_miembro = 0`, `conn accepted >= 1`, `owner_ws` presente.  
**No** usar `seed-collab-share` (añade guest al WS). Conteos/purga incluyen `share_invites`.

## Política 0098

Archivo: [`supabase/migrations/0098_realtime_broadcast_expediente.sql`](../../supabase/migrations/0098_realtime_broadcast_expediente.sql)  
Rollback: [`rollback-0098-broadcast-expediente.sql`](./rollback-0098-broadcast-expediente.sql)

## Plan canario FINAL (NO ejecutar sin OK explícito)

**Orden fijo:**

1. **Deploy web-only** del cliente mínimo (backup dist + plan arriba) — ya en prod antes del apply.
2. **Snapshot previo**  
   `python scripts/architecture/snapshot-realtime-messages-policies.py`  
   Confirmar 4 policies presence_*, sin `broadcast_expediente`.
3. **Reproducir bug (antes)** — QA-A + QA-B con `seed-collab-share-only` en P1, ambos SUBSCRIBED (presence OK):  
   A envía `field_lock` → **B NO recibe**. Anotar evidencia.
4. **Apply 0098** (una policy INSERT). No tocar presence_* ni grants.
5. **Post-apply RO**  
   - `check-broadcast-policy` / `pg_policies`: existe `broadcast_expediente` INSERT.  
   - Las **4 políticas previas** intactas.  
   - Presence A↔B sigue OK.
6. **Pruebas (después)** — tabla de casos.
7. **Falla → rollback inmediato**  
   `DROP POLICY IF EXISTS "broadcast_expediente" ON realtime.messages;`  
   Re-snapshot; 4 policies sin broadcast.
8. **Purga a 0** de todas las QA (profiles, prospects, shares, share_invites, connections, ws_personal, workspace_miembros, tool_calculations, empresa_miembros, survey_preguntas_usuario).

### Tabla de casos

| # | Caso | Esperado | Observable |
|---|------|----------|------------|
| 0 | Bug pre-apply A→B P1 | B no recibe lock | Antes |
| 1 | Positivo post-apply | B recibe `field_lock` | Evento en B |
| 2 | Presence intacta | Peers A↔B OK | Lista peers |
| 3 | Sin acceso | No SUBSCRIBED | CHANNEL_ERROR |
| 4 | Share solo P1 → canal P2 | No SUBSCRIBED | CHANNEL_ERROR |
| 5 | Miembro sala con acceso | SUBSCRIBED + peer recibe | Evento |
| 6 | Canal no expediente / mal formado | Rechazado | No join |
| 7 | Acceso P1, emitir en P2 sin acceso | Rechazado | SELECT falla |
| 8 | Miembro del WS (invitado) en P2 del mismo WS sin share | **SUBSCRIBED** (propiedad del modelo, hallazgo de seguridad) | Evento recibido; ver `backlog-seguridad.md` §1 |

## Riesgos

1. Canario = único entorno de prueba acordado — requiere OK, snapshot, rollback.  
2. INSERT denegado no observable en cliente.  
3. Multi-pestaña no sincroniza foco (pendiente).
