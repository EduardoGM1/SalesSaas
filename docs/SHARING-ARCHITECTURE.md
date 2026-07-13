# Compartir expedientes y red social

## Modelo de permisos

Fuente de verdad: tabla `prospect_shares` + enum `share_permission` (`view` | `edit` | `comment`).

| Nivel | Significado |
|-------|------------|
| Propietario | `prospects.user_id` (no es un share) |
| `view` | Solo lectura |
| `comment` | Lectura + comentarios locales (según UI) |
| `edit` | Puede editar expediente y tools compartidas |

Un expediente puede tener **varios receptores con distintos niveles** a la vez (`unique (prospect_id, shared_with_id)`).

RLS: `prospects_select_shared`, `prospects_update_shared_edit`, políticas de `tool_calculations` y de `prospect_shares` (solo contactos aceptados para insert interno).

## Chat como capa de negociación

WhatsApp/email son solo puente. La interacción de permisos ocurre en el chat de Saletse.

### Mensajes tipados (`direct_messages`)

| `message_type` | Uso |
|----------------|-----|
| `text` | Chat libre (default) |
| `access_granted` | Notificación de acceso otorgado |
| `permission_request` | Solicitud de escalar a `edit` (Aprobar/Rechazar) |
| `permission_response` | Resultado aprobado/rechazado |

Metadata JSON: `prospect_id`, `prospect_name`, `share_id`, `permission`, `request_id`, `decision`, etc.

### Solicitudes

Tabla `share_permission_requests`: un único `pending` por `share_id`. El dueño decide vía `POST /share-permission-requests/:id/decide`.

### Invites externos

Tabla `prospect_share_invites` (`token`, `permission`, `expires_at`).

- Link: `/e/i/:token`
- Canje autenticado: asegura conexión `accepted`, upsert share, mensaje `access_granted`
- Sin sesión: gate login/register con `?next=`

## API relevante

| Método | Ruta |
|--------|------|
| POST | `/prospects/:id/shares` → share + mensaje `access_granted` + push |
| POST | `/prospects/:id/share-invites` |
| POST | `/share-invites/:token/redeem` |
| POST | `/shares/:id/permission-requests` |
| POST | `/share-permission-requests/:id/decide` |
| GET/POST | mensajes (`message_type` / `metadata` en respuesta) |

## Extensibilidad

No acoplado a roles de negocio (liner/cerrador/empresa). Futuras relaciones = nuevas filas en `prospect_shares` + mismos tipos de mensaje.

## Migraciones

- `0011`–`0013`: foundation shares + comment
- `0012`: red, mensajes, RLS
- `0027`: chat tipado, `share_permission_requests`, `prospect_share_invites`
