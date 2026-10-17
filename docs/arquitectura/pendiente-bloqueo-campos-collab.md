# Pendiente: bloqueo de campos (collab broadcast)

**Estado:** DISEÑO LISTO (rama `arquitectura/bloqueo-campos-collab-diseno` @ `2b7f108`+). **NO aplicar** en producción sin OK explícito en el mismo mensaje, snapshot y rollback.  
**Regla:** ningún cambio en BD/config de producción sin OK, backup y rollback preparados.  
**Decisión de prueba:** no Postgres nativo / no Docker. El **canario en producción** es el mecanismo de prueba real (solo tras OK).

## Problema

Los locks de campo (`field_lock` / `field_unlock`) se envían por **Broadcast** en el canal privado Realtime `expediente:{uuid}` ([`expediente-realtime.js`](../../apps/web/src/lib/expediente-realtime.js)).

La migración `0031_fix_expediente_presence_rls` autoriza:

- **SELECT** en `realtime.messages` para join/listen (`presence_listen_expediente`)
- **INSERT** solo con `extension = 'presence'` (`presence_track_expediente`)

No hay política de **INSERT** para `extension = 'broadcast'`. Resultado: el peer no recibe el badge/bloqueo de campo, aunque la presencia y el sync de datos funcionen.

**Observabilidad:** un `channel.send({ type: "broadcast" })` **sin** policy INSERT se **descarta en silencio** (no hay error HTTP usable en el cliente). Por tanto **“send denegado” no es criterio de prueba**. Criterios observables:

| Tipo | Criterio |
|------|----------|
| Positivo | El par **con acceso** (SUBSCRIBED) **RECIBE** el evento `field_lock` |
| Negativo | El usuario **sin acceso** **NO** logra `SUBSCRIBED` (política SELECT `presence_listen_expediente`) y no recibe nada |
| Cobertura INSERT | Tras apply: consulta RO a `pg_policies` confirma `broadcast_expediente` con `cmd=INSERT` y el `WITH CHECK` esperado. Las denegaciones de INSERT a quien ya está SUBSCRIBED (p. ej. topic mal formado) **no son separables** del descarte silencioso; se cubren con la policy en catálogo + caso negativo de subscribe |

## Catálogo real de producción (SOLO LECTURA, 2026-10-17)

| Fuente | `broadcast_expediente` | Políticas |
|--------|------------------------|-----------|
| Snapshot LATEST (post-rollback) | **No** | 4 presence_* |
| Prod live | **No** | Las mismas 4 |

## Política mínima propuesta

Archivo: [`supabase/migrations/0098_realtime_broadcast_expediente.sql`](../../supabase/migrations/0098_realtime_broadcast_expediente.sql)  
Rollback: [`rollback-0098-broadcast-expediente.sql`](./rollback-0098-broadcast-expediente.sql)

## Plan canario en producción (REVISIÓN — no ejecutar sin OK)

### Seed (prerrequisito)

Usar helper **share-only nuevo** (comando previsto `seed-collab-share-only` en `qa-geo-fx-ephemeral.py`): B con `user_connections` + `prospect_shares`, **sin** insertar a B en `workspace_miembros` del dueño. **No** usar `seed-collab-share` (añade guest al WS y sesga `user_can_access_prospect`).  
Hoy el helper share-only **aún no está en el repo**; hay que añadirlo (y un smoke que lo invoque) **antes** del canario, sin apply de 0098.

### Orden

1. **Snapshot previo**  
   `python scripts/architecture/snapshot-realtime-messages-policies.py`  
   Confirmar 4 policies, sin `broadcast_expediente`.

2. **Reproducir el bug (antes)** — QA-A + QA-B con share-only en P1, ambos SUBSCRIBED (presence OK):  
   A envía `field_lock` → **B NO recibe** el evento.  
   Anotar evidencia (log/console del smoke). Esto ancla el antes/después.

3. **Apply 0098** (una policy INSERT). No tocar presence_* ni grants.

4. **Post-apply RO**  
   - `pg_policies` / `check-broadcast-policy`: existe `broadcast_expediente` (INSERT).  
   - Las **4 políticas previas** siguen intactas (nombres + cmds).  
   - Presence A↔B sigue: peers visibles / track OK.

5. **Pruebas (después)** — criterios de la tabla abajo.

6. **Falla → rollback inmediato**  
   ```sql
   DROP POLICY IF EXISTS "broadcast_expediente" ON realtime.messages;
   ```  
   Re-snapshot; confirmar 4 policies sin broadcast.

7. **Purga a 0** de todas las QA (profiles, prospects, shares, invites, connections, ws_personal, workspace_miembros, tool_calculations, empresa_miembros, survey_preguntas_usuario).

### Tabla de casos (esperado declarado)

Precondiciones: QA-A crea P1 (y opcional P2) en WS personal. B share-only de P1. C (o B en canal ajeno) sin acceso.

| # | Caso | Actor | Acción | Esperado | Observable |
|---|------|-------|--------|----------|------------|
| 0 | Bug pre-apply | A→B en P1 (ambos SUBSCRIBED) | A `field_lock` | B **no** recibe | Antes |
| 1 | Positivo post-apply | A→B en P1 | A `field_lock` | B **recibe** `field_lock` | Evento en B |
| 2 | Presence intacta | A↔B en P1 | presence sync | Peers OK | Lista peers |
| 3 | Sin acceso | C (o B) | subscribe `expediente:{P1}` sin share/membresía | **No SUBSCRIBED** | CHANNEL_ERROR |
| 4 | Share solo P1 | B | subscribe `expediente:{P2}` sin share | **No SUBSCRIBED** | CHANNEL_ERROR |
| 5 | Miembro WS sala | Liner/gerente con acceso | subscribe + lock en expediente de su sala | SUBSCRIBED + peer recibe lock | Evento |
| 6 | Canal no expediente | Cualquiera con sesión | broadcast/subscribe `contactos` / `user:{uid}` / topic mal formado / sin uuid | **Rechazado** (no SUBSCRIBED a canal expediente; INSERT broadcast de 0098 no aplica) | No join / no evento; policy solo `expediente:{uuid}` |
| 7 | Cross-expediente | Acceso a P1, no a P2 (otra sala / sin share) | emitir en `expediente:{P2}` | **No SUBSCRIBED** (o no recepción) | SELECT falla |

## Revisión cliente (SOLO LECTURA — no implementar aquí)

Código: `expediente-realtime.js`, `use-expediente-realtime.js`, `collab-field.jsx`.

| Pregunta | Hallazgo |
|----------|----------|
| Cierre de pestaña / pérdida de red sin `field_unlock` | `pagehide` → `stopExpedienteRealtime` → teardown **sin** enviar `field_unlock`. Peers limpian por **presence leave** (`clearLocksForUser`) y por **TTL 60s** (`FIELD_LOCK_TTL_MS`) en `locksSnapshot` + tick UI cada 10s. **No** queda bloqueado para siempre. |
| Dos pestañas del mismo usuario | Singleton por pestaña (heaps separados). Presence usa la misma `key`/user_id. `applyRemoteLock` **ignora** locks del propio `user_id`. Riesgo: las dos pestañas pueden editar el mismo campo sin verse el badge mutuo; no es UI “trabada” permanente. |
| UI trabada | Campos remotos usan `readOnly`/`disabled` mientras el lock esté vivo; caduca a ≤60s sin heartbeat. Heartbeat cada 20s refresca `ts`. |

### Mínimo de cambios de cliente **antes** de aplicar 0098 (propuesta — no implementar aún)

1. **Best-effort `field_unlock` en teardown/pagehide** (antes de `untrack`/removeChannel), fire-and-forget — reduce ventana hasta presence leave/TTL.  
2. **Throttle** de `console.warn` en send fallido (evitar ruido cuando se ejercite la ruta).  
3. Opcional (no bloqueante): sincronizar foco entre pestañas (`BroadcastChannel`) o documentar limitación multi-tab.

Con TTL + presence leave, el riesgo de UI trabada permanente es bajo; (1) es el único cambio que vale la pena antes del canario.

## Riesgos

1. Seed guest (`seed-collab-share`) sesga acceso — usar share-only.  
2. Canario es el único entorno de prueba acordado — requiere OK, snapshot, rollback.  
3. INSERT denegado no es observable en cliente — no usarlo como assert.

## Relación con el gate Survey

`smoke-survey-collab-e2e-qa.mjs` valida presencia + sync. Bloqueo de campo = KNOWN GAP hasta apply de 0098.
