# Pendiente: bloqueo de campos (collab broadcast)

**Estado:** CLIENTE MÍNIMO + SEED LISTOS; canario 0098 **NO aplicar** sin OK explícito en el mismo mensaje.  
**Rama:** `arquitectura/bloqueo-campos-collab-diseno`.  
**Regla:** ningún cambio en BD/config de producción sin OK, backup y rollback preparados.  
**Decisión de prueba:** no Postgres nativo / no Docker. El **canario en producción** es el mecanismo de prueba real (solo tras OK).

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

## Riesgos

1. Canario = único entorno de prueba acordado — requiere OK, snapshot, rollback.  
2. INSERT denegado no observable en cliente.  
3. Multi-pestaña no sincroniza foco (pendiente).
