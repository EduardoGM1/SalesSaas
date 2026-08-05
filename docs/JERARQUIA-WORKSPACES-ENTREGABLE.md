# Jerarquía 8 niveles + roadmap workspaces — estado real y entregable

**Fecha:** 2026-08-05  
**Plan:** Jerarquía y workspaces

## 1. Reporte pre-implementación (auditoría código)

| # | Punto | Estado | Acción en este entregable |
|---|---|---|---|
| A1 | Asistentes + permisos delegados | ❌ No existía | Implementado (migración 0068 + API + UI) |
| A2 | Visibilidad cruzada salas | ❌ No existía | Implementado (`gerente_acceso_cruzado` + RPC + UI) |
| A3 | Superadmin/Admin sin CRM fila a fila | ✅ Ya cumplía | Verificado con script + doc |
| B4 | UI Duplicar/Transferir + frontera | ✅ Ya cumplía | Solo documentado |
| B5 | Switch sin reload + stores/realtime | ✅ Ya cumplía | Solo documentado |
| B6 | Abandonar sala + Admin miembros | ✅ Ya cumplía | Solo documentado |
| B7 | White-label visual completo | ⚠️ Parcial | Completado CSS vars shell |

## 2. Evidencia B4–B6 (no reescritos)

- **B4:** `client-detail.jsx`, `move-prospect-modal.jsx`, `share-prospect-modal.jsx`, `POST /prospects/:id/duplicate|transfer`, `CROSS_BOUNDARY_MSG`.
- **B5:** `use-workspace.js` `switchWorkspace` sin `location.reload`; wipe `db-store`; evento `workspace:changed`; realtime `force`.
- **B6:** `POST /workspace/leave`, Admin salas/miembros/gerente, índice único 1 gerente.

## 3. Matriz privacidad A3 (contraste)

Ver `docs/VERIFICACION-PRIVACIDAD-ADMIN.md` (generado por `scripts/verify-admin-privacy.mjs`).

Resultado real (prod, actor Superadmin):

| Capacidad | Resultado |
|---|---|
| Ventas fila a fila cross-empresa | PASS |
| Expedientes fila a fila cross-empresa | PASS |
| Overview admin agregados | PASS |

## 4. Migraciones a aplicar en Supabase

1. `0067_modulos_custom_por_tenant.sql` (si aún no)
2. `0068_asistentes_y_acceso_cruzado.sql` **requerida** para Asistentes + acceso cruzado

Tras aplicar 0068, re-ejecutar seed de roles de empresa (`ensureEmpresaOperationalRoles`) al abrir/gestionar cada empresa (ya se dispara en flujos existentes de creación/acceso).
