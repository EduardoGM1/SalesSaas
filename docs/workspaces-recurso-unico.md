# Workspaces, recurso único y 5 acciones

## Conceptos

| Término | Significado |
|---------|-------------|
| **Workspace (Espacio)** | Contenedor de trabajo. Tipos v1: `personal` \| `sala_de_ventas`. |
| **Organización** | Agrupa salas de ventas. Un usuario solo puede pertenecer a **una** org a la vez. |
| **Recurso (expediente)** | Fila en `prospects`. Ownership humano = `user_id`; ownership de espacio = `workspace_propietario_id`. |
| **Referencia** | Fila en `recurso_workspace_referencias`: el mismo `prospect_id` aparece en otro workspace (no es copia). |
| **Acceso compartido** | Fila en `prospect_shares` (`view` \| `edit`; `workspace` legacy = edit + derecho a pin). |

## Fórmulas de acceso

Un usuario **puede leer** un expediente si:

1. `prospects.user_id = uid` (owner), **o**
2. es miembro del `workspace_propietario_id`, **o**
3. existe `prospect_shares` con `shared_with_id = uid`, **o**
4. existe `recurso_workspace_referencias` hacia un workspace del que es miembro.

Helper RLS: `user_can_access_prospect(uid, prospect_id)` (SECURITY DEFINER).

Un usuario **puede editar** si es owner o tiene share con `share_can_edit(permission)` (`edit` o `workspace`).

Un usuario **puede transferir** solo si es owner (`user_id`).

## Las 5 acciones

| Acción | Comportamiento | API |
|--------|----------------|-----|
| **Ver** | Share `view`; sin referencia | `POST /prospects/:id/shares` |
| **Editar** | Share `edit`; mismo id + realtime | igual; audita `cambiar_permiso` |
| **Agregar a mi espacio** | Insert referencia + `added_to_workspace_at` (compat) | `POST /shares/:id/add-to-workspace` |
| **Duplicar** | Nuevo `prospects` (+ tools opc.); sin sync | `POST /prospects/:id/duplicate` |
| **Transferir** | Cambia `user_id` + `workspace_propietario_id` | `POST /prospects/:id/transfer` |

## Vinculación a salas

- RPC `workspace_add_member(workspace_id, usuario_id, rol)`
- Si el usuario ya está en salas de **otra** `organizacion_id` → error 403.
- Varias salas de la **misma** org: permitido.

## Sesión

`GET /api/v1/auth/session` incluye:

- `workspaces[]`
- `active_workspace_id` (personal por defecto; override en `profiles.settings`)
- `organizacion_id` (si aplica)

`PATCH /api/v1/workspaces/active` con `{ workspace_id }`.

## Auditoría

Tabla `historial_auditoria` (ambito `recurso`). Acciones v1:

`compartir`, `cambiar_permiso`, `agregar_a_espacio`, `revocar_acceso`, `duplicar`, `transferir_propiedad`.

RPC: `insert_resource_audit(...)`.

## Migración

Archivo: `supabase/migrations/0054_workspaces_recursos.sql`

```bash
npm run db:migrate:0054
# o pegar el SQL en Supabase → SQL Editor
```

## Casos de prueba

1. Usuario nuevo → workspace personal; nuevos expedientes con `workspace_propietario_id`.
2. Share `view`/`edit` sin pin → no aparece como referencia en “mi espacio”.
3. Pin → fila en `recurso_workspace_referencias` con el mismo `prospect_id`.
4. Duplicar → nuevo id; editar copia no cambia el original.
5. Transferir → cambia owner/workspace; entrada en `historial_auditoria`.
6. Vincular a sala de otra org → 403.
7. Receptor no-owner no puede transferir.
