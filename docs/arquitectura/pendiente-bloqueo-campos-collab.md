# Pendiente: bloqueo de campos (collab broadcast)

**Estado:** DISEÑO LISTO (rama `arquitectura/bloqueo-campos-collab-diseno`). **NO aplicar** en producción sin OK explícito en el mismo mensaje, snapshot y rollback.  
**Regla:** ningún cambio en BD/config de producción sin OK, backup y rollback preparados.

## Problema

Los locks de campo (`field_lock` / `field_unlock`) se envían por **Broadcast** en el canal privado Realtime `expediente:{uuid}` ([`expediente-realtime.js`](../../apps/web/src/lib/expediente-realtime.js)).

La migración `0031_fix_expediente_presence_rls` autoriza:

- **SELECT** en `realtime.messages` para join/listen (`presence_listen_expediente`)
- **INSERT** solo con `extension = 'presence'` (`presence_track_expediente`)

No hay política de **INSERT** para `extension = 'broadcast'`. Resultado: el peer no recibe el badge/bloqueo de campo, aunque la presencia y el sync de datos funcionen.

## Catálogo real de producción (SOLO LECTURA, 2026-10-17)

Consulta vía VPS/`psql` (sin mutar) y cruce con snapshots en `%USERPROFILE%\.saletse-ops\`:

| Fuente | `broadcast_expediente` | Políticas |
|--------|------------------------|-----------|
| Snapshot LATEST (`20261015T010705Z`, post-rollback 0090) | **No** | 4: `presence_listen_contacts`, `presence_listen_expediente`, `presence_track_expediente`, `presence_track_own` |
| Prod live (`check-broadcast-policy` + dump RO) | **No** (`count=0`) | Las mismas 4; quals/with_check coinciden con el snapshot |

**Confirmado:** producción actual = snapshot post-rollback. Presence intacta. Sin policy de broadcast.

## Política mínima propuesta

Archivo: [`supabase/migrations/0098_realtime_broadcast_expediente.sql`](../../supabase/migrations/0098_realtime_broadcast_expediente.sql)

- **INSERT** en `realtime.messages` con `extension = 'broadcast'`
- Topic parseable como `expediente:{uuid}` (`presence_prospect_from_topic`)
- `user_can_access_prospect(auth.uid(), prospect_id)` — **misma función** que presence
- **No** toca SELECT/presence, ni `presence_listen_contacts`, ni grants de tabla

### Qué cambia vs prod actual

| Antes | Después |
|-------|---------|
| Broadcast INSERT → denegado (sin policy) | Broadcast INSERT → permitido si `user_can_access_prospect` |
| Presence SELECT/INSERT | Igual |
| Contactos presence | Igual |

### Modelo de acceso vigente (`user_can_access_prospect`, post-0052)

Concede acceso si el usuario es **miembro del workspace** del expediente **o** tiene **share** (y también está en el workspace del prospect según la definición actual).  
Implicación: un *guest* sembrado en el WS personal del dueño verá *todos* los expedientes de ese WS (hallazgo del incidente 0090). La prueba FIEL debe evitar ese sesgo.

### Rollback exacto

[`docs/arquitectura/rollback-0098-broadcast-expediente.sql`](./rollback-0098-broadcast-expediente.sql):

```sql
DROP POLICY IF EXISTS "broadcast_expediente" ON realtime.messages;
```

### Comando de backup/snapshot previo

```bash
python scripts/architecture/snapshot-realtime-messages-policies.py
# → %USERPROFILE%\.saletse-ops\realtime-messages-policies-snapshot-<UTC>.json
#   y LATEST
```

## Entorno de prueba (sin tocar producción)

**Hoy no hay stack no productivo usable en esta máquina** (sin `supabase` CLI, sin Docker local, sin `config.toml` de proyecto local; el dev apunta al Auth/Postgres de prod vía VPS — ver [`entornos.md`](./entornos.md)).

**Opción más segura (recomendada antes de cualquier apply):**

1. **Levantar Supabase local** (`supabase start` + aplicar migraciones del repo hasta 0097, luego 0098) y ejecutar la batería negativa allí.
2. Solo tras verde en local + OK explícito: snapshot prod → apply 0098 en prod → re-smoke → rollback listo.

**No improvisar** apply en prod “para ver”. QA efímera contra prod **después** del apply solo con OK.

## Resultados esperados de la prueba FIEL (declarados ANTES de ejecutar)

Precondiciones: tres QA efímeras A/B/C. A crea P1 y P2 en su WS **personal**.  
**B obtiene share de P1 por flujo real de producto** (invite/redeem o share a contacto aceptado) — **sin** insertar a B en `workspace_miembros` del dueño.  
**C** sin share y sin membresía en el WS de A.

| Caso | Actor | Canal | Esperado | Por qué |
|------|-------|-------|----------|---------|
| Sin acceso | C | subscribe `expediente:{P1}` | **Rechazado** (CHANNEL_ERROR / no SUBSCRIBED) | `user_can_access_prospect` falso → SELECT `presence_listen_expediente` falla |
| Sin acceso | C | broadcast lock en P1 | **Rechazado** | INSERT `broadcast_expediente` exige el mismo predicado |
| Solo share P1 | B | subscribe/broadcast `expediente:{P2}` | **Rechazado** | Sin share de P2 y sin membresía WS → sin acceso |
| Solo share P1 | B | subscribe `expediente:{P1}` | **Aceptado** | Share de P1 → SELECT OK (ya hoy, sin 0098) |
| Solo share P1 | B | broadcast lock en P1 | **Aceptado solo si 0098 aplicada** | INSERT broadcast; sin 0098 → denegado (estado actual) |
| Miembro legítimo WS | Liner/gerente de sala con `user_in_workspace` sobre el WS del expediente | subscribe + broadcast en expediente de la sala | **Aceptado** (con 0098) | Modelo vigente: miembro WS = acceso (no es agujero cross-tenant) |

Script a adaptar (hoy sesgado con guest): `scripts/architecture/smoke-realtime-broadcast-negative-qa.mjs` — reemplazar `seed-collab-share` por helper **share-only** (sin `workspace_miembros`).

## Cambio de cliente (revisión — NO implementar en esta etapa)

Archivos: `apps/web/src/lib/expediente-realtime.js`, `hooks/use-expediente-realtime.js`, `components/clients/collab-field.jsx`.

| Hoy | Tras 0098 (coherencia deseable) |
|-----|----------------------------------|
| `broadcastLock` / `broadcastUnlock` hacen `channel.send({ type: "broadcast", ... })` y solo `console.warn` si falla | Con policy, peers con acceso reciben el evento; sin acceso el send sigue fallando (correcto) |
| No hay feedback UI si el lock no se propagó | Opcional: exponer estado `lockBroadcastOk` / toast suave si `send` falla tras SUBSCRIBED |
| Heartbeat 20s reintenta lock en silencio | Sin cambio obligatorio; evitar spam de warns en consola (throttle) |
| `collab-field` muestra badge si llega `field_lock` remoto | Sin cambio de contrato de eventos (`field_lock` / `field_unlock` / payload) |

**No hace falta** cambiar nombres de eventos ni el topic. El cliente ya está listo para recibir; el bloqueo es de BD.

## Riesgos

1. **Amplificar acceso de guest WS** si se prueba/siembra con `seed-collab-share` (B ve P2). Mitigar con prueba FIEL.
2. **Apply en prod sin local** — no hay entorno no-prod hoy; alto riesgo de repetir incidente 0090.
3. **Realtime privado** depende de JWT/RLS; un drift de `user_can_access_prospect` afecta presence y broadcast a la vez (ya es así).
4. **No** ampliar a otros topics (`user:…`, contactos).

## Plan de apply (solo tras OK explícito)

1. Snapshot: `python scripts/architecture/snapshot-realtime-messages-policies.py`
2. Verificar local / staging verde (opción B).
3. Apply `0098` en prod (método habitual del repo; no desde chat sin OK).
4. Smoke negativo FIEL + smoke collab Survey (lock deja de ser KNOWN GAP).
5. Si falla: ejecutar `rollback-0098-broadcast-expediente.sql` y re-snapshot.

## Incidente 2026-10-14 (resumen)

1. Policy `broadcast_expediente` aplicada en prod **sin OK** (script temporal; no era la 0090 de capa admin del repo).
2. Snapshots fuera del repo (`%USERPROFILE%\.saletse-ops\`).
3. Prueba sesgada: B guest del WS → acceso a P2 vía `user_in_workspace`.
4. Rollback: `DROP POLICY broadcast_expediente`. Prod sin broadcast; presence intacta.
5. Retomar con este diseño + OK + backup + prueba FIEL.

## Relación con el gate Survey

`smoke-survey-collab-e2e-qa.mjs` valida presencia + sync. El paso de bloqueo de campo sigue **KNOWN GAP** hasta apply de 0098.
