# Compartir expedientes (diseño futuro)

Concepto: buscar usuarios en la red Sales Timeshare y compartir un expediente con permisos tipo Google Drive.

## 1. ¿La BD actual permite relaciones entre usuarios sin refactorizar?

**Sí, con extensión mínima.** Hoy cada `prospect` pertenece a un `user_id` (`profiles` ↔ `auth.users`). No hay relaciones entre usuarios, pero el modelo per-vendedor no impide añadir tablas puente. La migración `0011_prospect_sharing_foundation.sql` reserva `prospect_shares` sin cambiar tablas existentes.

## 2. Tablas / modelos necesarios

| Modelo | Propósito |
|--------|-----------|
| `profiles` (existente) | Búsqueda por nombre/email dentro de la org |
| `prospect_shares` (0011) | `prospect_id`, `owner_id`, `shared_with_id`, `permission` |
| Opcional: `organizations` + `organization_members` | Si la red crece más allá de usuarios sueltos |
| Opcional: `share_invites` | Invitaciones pendientes por email |

En cliente (IndexedDB) haría falta un índice de expedientes compartidos conmigo, sincronizado vía API.

## 3. Permisos

Enum propuesto: `view` (solo lectura) y `edit` (modificar datos y herramientas). El dueño (`owner_id` / `prospects.user_id`) conserva control total y puede revocar.

RLS en Supabase:

- Dueño: CRUD completo sobre su prospect.
- `shared_with` + `view`: SELECT sobre prospect y tools.
- `shared_with` + `edit`: SELECT + UPDATE (sin DELETE del expediente).

Ventas archivadas y agenda seguirían scoped al dueño salvo que se comparta también el historial comercial.

## 4. ¿Dejar la base lista ahora?

**Recomendado:** migración stub (`0011`) + tipos en código cuando se implemente UI. **No** activar sync ni RLS de producto hasta definir org/equipos. Evita rehacer esquema; el costo actual es bajo (tabla vacía, sin UI).
