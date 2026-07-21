# Auditoría — Gerente / chats grupales / RBAC reciente (Parte 4)

Fecha: 2026-07-21. Alcance: roles/permisos, grupos, Money Box/notificaciones/Survey/chats (requerimientos recientes) y el trabajo de Partes 1–3.

## Crítico

| Hallazgo | Estado |
|----------|--------|
| Gerente sin UI de gestión pese a RLS `is_gerente_of` (solo hint en dashboard; sync offline filtraba `user_id` propio) | **Corregido** — `/team`, API dashboard/miembros/prospects, lectura remota en `ClientDetail` |
| Recursión RLS `grupos` ↔ `grupo_miembros` (migración 0050) | **Corregido** en `0051_fix_grupos_rls_recursion.sql` (previo) |
| Chats grupales inexistentes; solo 1:1 en `direct_messages` | **Corregido** — `0052_group_chats.sql` + `group-chat-service` |

## Medio

| Hallazgo | Estado |
|----------|--------|
| N+1 en `listGroupConversations` (última msg + count unread por conv) | **Mitigado** — batch de mensajes recientes; unread aproximado en ventana (aceptable para MVP; mejorar con RPC si crece) |
| Share a grupo omite miembros sin contacto aceptado (`prospect_shares` upsert falla → `continue`) | **Documentado** — fan-out best-effort; el Gerente ya lee por RLS sin share |
| `profiles.role` legacy no admite slug `gerente` (solo vendedor/admin); permisos reales vía `role_id` | **OK por diseño** — seed y UI admin usan `role_id` gerente |
| Contador unread grupal puede subestimar hilos muy activos | Abierto (bajo impacto) |
| TeamPage usa fetch ad-hoc en vez de `network-api` | Bajo; funciona |

## Bajo

| Hallazgo | Estado |
|----------|--------|
| Claves i18n faltantes (`team.*`, `messages.groupChat`, share grupo) | **Corregido** |
| `ProspectShareMessageCard` no resolvía `share_id` por usuario en metadata `shares[]` | **Corregido** |
| Chat mensajes: polling 8s (no canal Realtime dedicado) — sin fugas de canal | **OK** — cleanup de interval/listeners en unmount |
| Realtime Money Box / Dashboard / presencia / expediente | Revisado: usan `removeChannelSafe` / cleanup en hooks providers |
| `console.log` de debug en apps web/api recientes | Solo log de arranque API — OK |

## Base de datos (RLS / índices)

| Tabla / área | RLS | Notas |
|--------------|-----|--------|
| `organizaciones`, `grupos`, `grupo_miembros` | Sí (0050 + fix 0051) | SELECT related + write super |
| `modulos`, `modulo_activacion` | Sí | |
| `roles`, `permisos`, `rol_permisos`, overrides | Sí (0041+) | |
| `logs_administracion` | Sí (0042) | |
| `chat_conversations`, `chat_participants`, `chat_messages` | Sí (0052) | helper `is_chat_participant` |
| Índices | | `chat_participants(user_id)`, `chat_messages(conversation_id, created_at desc)`, `profiles(role_id)`, FKs grupo |

## Seguridad mutaciones

- Shares: ownership `user_id` del prospect + participación en conversación validados server-side.
- Team prospects: `team_member_ids` + 403 si member fuera del grupo.
- Group messages: `assertParticipant` antes de insert/list/read.
- Admin grupo: `admin_upsert_grupo` exige `is_super_admin`; chat sync vía `sync_grupo_chat` (SECURITY DEFINER).

## Correcciones aplicadas en esta pasada

1. UI Mi equipo + dashboard agregado (`TeamPage`, `team-service`).
2. Chats grupales + auto-sync al upsert de grupo.
3. Share a chat grupal con fan-out por miembro + tarjeta con `shares[]`.
4. Fix i18n / share card por usuario.
5. Mitigación N+1 listado conversaciones grupales.
6. Script `npm run seed:team` (Admin API).

## Pendiente no bloqueante

- Realtime nativo para hilos de chat (hoy polling).
- Exigir contacto aceptado o policy alternativa para share grupal a todos los miembros.
- Contador unread exacto vía función SQL.
