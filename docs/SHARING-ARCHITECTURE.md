# Compartir expedientes y red social (MVP)

## Estado actual (implementado)

### Base de datos (`0011` + `0012`)
- `prospect_shares` — compartir expedientes (`view` | `edit`)
- `user_connections` — solicitudes y contactos (`pending` | `accepted` | `blocked`)
- `direct_messages` — mensajes entre contactos aceptados
- RPC `search_profiles(q)` — búsqueda de usuarios activos
- RLS: perfiles visibles para contactos/pendientes; mensajes solo entre aceptados; shares solo con contactos aceptados

### API (`/api/v1/...`)
| Área | Endpoints |
|------|-----------|
| Red | `GET /network/users/search`, `GET/POST/PATCH/DELETE /network/connections` |
| Mensajes | `GET /messages/conversations`, `GET /messages?with=`, `POST /messages`, `PATCH /messages/read`, `GET /messages/unread-count` |
| Compartir | `GET /shares/received`, `GET/POST /prospects/:id/shares`, `PATCH/DELETE /shares/:id`, `GET /shared-prospects/:id` |

### UI
- `/network` — buscar, solicitudes, contactos, expedientes compartidos
- `/messages` — conversaciones y chat
- Expediente → botón **Compartir** (requiere Supabase + sync)
- Sidebar: Red, Mensajes (solo con nube), badge de no leídos

## Requisitos
1. Supabase configurado + usuario autenticado
2. Expediente sincronizado (UUID en nube) para compartir
3. Contacto **aceptado** antes de mensajes o shares

## Próximas fases (no MVP)
- Realtime (Supabase subscriptions) para mensajes
- Sync de expedientes compartidos al store local
- Organizaciones/equipos (`organizations`, `organization_members`)
- Compartir herramientas (survey/worksheet) con RLS en `tool_calculations`
- Notificaciones push

## Respuestas de diseño original

1. **¿BD permite relaciones sin refactor?** Sí — tablas puente sobre `profiles`/`prospects`.
2. **¿Qué tablas?** `user_connections`, `direct_messages`, `prospect_shares` (+ opcional org/invites).
3. **¿Permisos?** Contactos aceptados; shares `view`/`edit`; dueño revoca.
4. **¿Base lista?** Sí — migraciones 0011–0012; UI/API MVP activos.
