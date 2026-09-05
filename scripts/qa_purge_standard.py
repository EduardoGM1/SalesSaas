"""Estándar de purga QA: borrar también el workspace personal, no solo profiles/auth/miembros.

Usar en TODA prueba que cree cuentas desechables:

1. Capturar IDs de workspaces personales de esos emails ANTES de borrar miembros
   (ensure_personal_workspace nombra el WS con full_name; borrar solo por nombre falla).
2. Anular profiles.workspace_activo_id que apunte a esos WS.
3. Borrar miembros / flags / datos de negocio de esas cuentas.
4. DELETE FROM workspaces WHERE id IN (capturados) AND tipo = 'personal'.
5. leftover MUST incluir ws_personal = 0 (y ws_sala/empresa si la prueba los creó).

Nunca borrar un personal que todavía tenga un miembro cuyo email NO esté en la lista QA.
"""

from __future__ import annotations


def _sql_list(values: list[str]) -> str:
    return ", ".join("'" + str(v).replace("'", "''") + "'" for v in values)


def sql_capture_qa_personal_workspaces(emails: list[str], extra_nombres: list[str] | None = None) -> str:
    """Crear temp table _qa_personal_ws. Ejecutar ANTES de borrar workspace_miembros."""
    emails_sql = _sql_list(emails)
    nombres = extra_nombres or []
    nombre_pred = f"OR w.nombre IN ({_sql_list(nombres)})" if nombres else ""
    return f"""
DROP TABLE IF EXISTS _qa_personal_ws;
CREATE TEMP TABLE _qa_personal_ws AS
SELECT DISTINCT w.id
FROM workspaces w
WHERE w.tipo = 'personal'
  AND (
    EXISTS (
      SELECT 1 FROM workspace_miembros wm
      JOIN profiles p ON p.id = wm.usuario_id
      WHERE wm.workspace_id = w.id AND p.email IN ({emails_sql})
    )
    {nombre_pred}
  )
  AND NOT EXISTS (
    SELECT 1 FROM workspace_miembros wm
    JOIN profiles p ON p.id = wm.usuario_id
    WHERE wm.workspace_id = w.id AND p.email NOT IN ({emails_sql})
  );
UPDATE profiles SET workspace_activo_id = NULL
WHERE workspace_activo_id IN (SELECT id FROM _qa_personal_ws)
   OR email IN ({emails_sql});
"""


def sql_delete_captured_qa_personal_workspaces() -> str:
    """Borrar los personales capturados. Ejecutar DESPUÉS de borrar miembros."""
    return """
DELETE FROM workspace_miembros WHERE workspace_id IN (SELECT id FROM _qa_personal_ws);
DELETE FROM workspaces WHERE tipo = 'personal' AND id IN (SELECT id FROM _qa_personal_ws);
"""


def sql_leftover_qa_personal_workspaces(emails: list[str], extra_nombres: list[str] | None = None) -> str:
    emails_sql = _sql_list(emails)
    nombres = extra_nombres or []
    nombre_pred = f"OR w.nombre IN ({_sql_list(nombres)})" if nombres else ""
    return f"""
SELECT 'ws_personal', COUNT(*) FROM workspaces w
WHERE w.tipo = 'personal'
  AND (
    EXISTS (
      SELECT 1 FROM workspace_miembros wm
      JOIN profiles p ON p.id = wm.usuario_id
      WHERE wm.workspace_id = w.id AND p.email IN ({emails_sql})
    )
    {nombre_pred}
  );
"""
