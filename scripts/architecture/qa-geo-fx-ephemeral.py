#!/usr/bin/env python3
"""Provision / counts / purge de QA efímera (arquitectura) vía VPS (saletse-prod-db).

Compartido por smokes geo-fx, moneda, metas, vacaciones, survey y gate collab.

Uso:
  python scripts/architecture/qa-geo-fx-ephemeral.py provision <email> <password> <full_name>
  python scripts/architecture/qa-geo-fx-ephemeral.py counts <email>
  python scripts/architecture/qa-geo-fx-ephemeral.py purge <email>
  python scripts/architecture/qa-geo-fx-ephemeral.py seed-prospect <email> <prospect_id> [name] [prospect_code]
  python scripts/architecture/qa-geo-fx-ephemeral.py seed-collab-share <owner_email> <recipient_email> <prospect_id> [permission]

Sin secretos en stdout salvo el uid (provision). Password solo entra por argv.

seed-prospect: inserta un expediente mínimo en prod para que tool_calculations
pueda guardar sin violar tool_calculations_prospect_id_fkey (QA personal crea
el cliente offline para evitar 403 en API).

counts/purge también cubren shares (prospect_shares), share_invites y
user_connections — necesarios para el gate collab de 2 QA.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

ENV_FILE = "/var/www/Saletse/.env"
DB = "saletse-prod-db"


def run(client, cmd: str, timeout: int = 180) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise SystemExit(f"cmd failed ({code}): {out}\n{err}")
    return out


def psql(client, sql: str) -> str:
    b64 = base64.b64encode(sql.encode()).decode()
    return run(
        client,
        f"echo {b64} | base64 -d | docker exec -i {DB} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A",
    )


def auth_create_or_update(client, email: str, password: str, full_name: str) -> str:
    py = f"""
python3 - <<'PY'
import json, urllib.request, urllib.error
env={{}}
for raw in open({ENV_FILE!r}, encoding="utf-8"):
    raw=raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw: continue
    k,v=raw.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
base=env.get("SUPABASE_URL","").rstrip("/")
anon=env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
service=env.get("SUPABASE_SERVICE_ROLE_KEY")
email={email!r}; full_name={full_name!r}; password={password!r}
def req(method, path, body=None):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(base+path, data=data, method=method,
      headers={{"Authorization":"Bearer "+service,"apikey":anon,"Content-Type":"application/json"}})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw=resp.read().decode(); return resp.status, json.loads(raw) if raw else {{}}
    except urllib.error.HTTPError as ex:
        raw=ex.read().decode()
        try: payload=json.loads(raw)
        except Exception: payload={{"raw":raw[:400]}}
        return ex.code, payload
st, listed = req("GET", "/auth/v1/admin/users?page=1&per_page=1000")
existing=next((u for u in (listed.get("users") or []) if (u.get("email") or "").lower()==email.lower()), None)
if existing:
    st,out=req("PUT", f"/auth/v1/admin/users/{{existing['id']}}", {{"email_confirm":True,"password":password,"user_metadata":{{"full_name":full_name}}}})
    if st not in (200,201): raise SystemExit(f"updateUser {{st}} {{out}}")
    print(existing["id"])
else:
    st,created=req("POST","/auth/v1/admin/users",{{"email":email,"password":password,"email_confirm":True,"user_metadata":{{"full_name":full_name}}}})
    if st not in (200,201): raise SystemExit(f"createUser {{st}} {{created}}")
    uid=created.get("id") or (created.get("user") or {{}}).get("id")
    if not uid: raise SystemExit(f"sin id {{created}}")
    print(uid)
PY
"""
    out = run(client, py, timeout=90)
    lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
    if not lines:
        raise SystemExit("sin uid de auth")
    return lines[-1]


def auth_delete(client, uid: str) -> None:
    py = f"""
python3 - <<'PY'
import urllib.request
env={{}}
for raw in open({ENV_FILE!r}, encoding="utf-8"):
    raw=raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw: continue
    k,v=raw.split("=",1); env[k.strip()]=v.strip().strip('"').strip("'")
uid={uid!r}
r=urllib.request.Request(env["SUPABASE_URL"].rstrip("/")+"/auth/v1/admin/users/"+uid, method="DELETE",
  headers={{"Authorization":"Bearer "+env["SUPABASE_SERVICE_ROLE_KEY"],"apikey":env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")}})
try:
    urllib.request.urlopen(r, timeout=60)
    print("auth_deleted")
except Exception as e:
    print("auth_delete_warn", e)
PY
"""
    run(client, py, timeout=60)


def counts(client, email: str) -> dict:
    email_sql = email.replace("'", "''")
    out = psql(
        client,
        f"""
SELECT 'profiles|' || COUNT(*)::text FROM profiles WHERE email = '{email_sql}';
SELECT 'prospects|' || COUNT(*)::text FROM prospects
 WHERE user_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'goals|' || COUNT(*)::text FROM goals
 WHERE user_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'tool_calculations|' || COUNT(*)::text FROM tool_calculations
 WHERE user_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'survey_preguntas_usuario|' || COUNT(*)::text FROM survey_preguntas_usuario
 WHERE usuario_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'empresa_miembros|' || COUNT(*)::text FROM empresa_miembros
 WHERE usuario_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'ws_personal|' || COUNT(*)::text FROM workspaces w
 WHERE w.tipo = 'personal'
   AND EXISTS (
     SELECT 1 FROM workspace_miembros wm
     JOIN profiles p ON p.id = wm.usuario_id
     WHERE wm.workspace_id = w.id AND p.email = '{email_sql}'
   );
SELECT 'shares|' || COUNT(*)::text FROM prospect_shares ps
 WHERE ps.owner_id = (SELECT id FROM profiles WHERE email = '{email_sql}')
    OR ps.shared_with_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'share_invites|' || COUNT(*)::text FROM prospect_share_invites i
 WHERE i.owner_id = (SELECT id FROM profiles WHERE email = '{email_sql}')
    OR i.prospect_id IN (
      SELECT p.id FROM prospects p
      WHERE p.user_id = (SELECT id FROM profiles WHERE email = '{email_sql}')
    );
SELECT 'connections|' || COUNT(*)::text FROM user_connections uc
 WHERE uc.requester_id = (SELECT id FROM profiles WHERE email = '{email_sql}')
    OR uc.addressee_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'workspace_miembros|' || COUNT(*)::text FROM workspace_miembros wm
 WHERE wm.usuario_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
SELECT 'scheduled_push_jobs|' || COUNT(*)::text FROM scheduled_push_jobs j
 WHERE j.user_id = (SELECT id FROM profiles WHERE email = '{email_sql}');
""",
    )
    result = {
        "profiles": 0,
        "prospects": 0,
        "goals": 0,
        "tool_calculations": 0,
        "survey_preguntas_usuario": 0,
        "empresa_miembros": 0,
        "ws_personal": 0,
        "shares": 0,
        "share_invites": 0,
        "connections": 0,
        "workspace_miembros": 0,
        "scheduled_push_jobs": 0,
    }
    for ln in out.splitlines():
        ln = ln.strip()
        if "|" not in ln:
            continue
        key, val = ln.split("|", 1)
        if key in result:
            result[key] = int(val)
    return result


def purge(client, email: str) -> dict:
    email_sql = email.replace("'", "''")
    uid_out = psql(client, f"SELECT id::text FROM profiles WHERE email = '{email_sql}';").strip()
    uid = uid_out.splitlines()[0].strip() if uid_out.strip() else ""
    if uid:
        psql(
            client,
            f"""
ALTER TABLE public.prospect_workflow_events DISABLE TRIGGER workflow_events_append_only;
DROP TABLE IF EXISTS _qa_personal_ws;
-- Solo WS personal donde este email es el único miembro (purgar guest B antes que owner A).
CREATE TEMP TABLE _qa_personal_ws AS
SELECT DISTINCT w.id
FROM workspaces w
WHERE w.tipo = 'personal'
  AND EXISTS (
    SELECT 1 FROM workspace_miembros wm
    JOIN profiles p ON p.id = wm.usuario_id
    WHERE wm.workspace_id = w.id AND p.email = '{email_sql}'
  )
  AND NOT EXISTS (
    SELECT 1 FROM workspace_miembros wm
    JOIN profiles p ON p.id = wm.usuario_id
    WHERE wm.workspace_id = w.id AND p.email <> '{email_sql}'
  );
UPDATE profiles SET workspace_activo_id = NULL
WHERE workspace_activo_id IN (SELECT id FROM _qa_personal_ws) OR email = '{email_sql}';
-- Collab / shares (antes de borrar prospects/profiles)
DELETE FROM share_permission_requests
 WHERE owner_id = '{uid}' OR requester_id = '{uid}';
DELETE FROM prospect_share_invites WHERE owner_id = '{uid}';
DELETE FROM prospect_shares
 WHERE owner_id = '{uid}' OR shared_with_id = '{uid}';
DELETE FROM direct_messages
 WHERE sender_id = '{uid}' OR recipient_id = '{uid}';
DELETE FROM user_connections
 WHERE requester_id = '{uid}' OR addressee_id = '{uid}';
DELETE FROM tool_calculations WHERE user_id = '{uid}';
DELETE FROM survey_preguntas_usuario WHERE usuario_id = '{uid}';
DELETE FROM usuario_permisos_override WHERE usuario_id = '{uid}';
DELETE FROM workspace_usuario_permisos_override WHERE usuario_id = '{uid}';
DELETE FROM sales WHERE prospect_id IN (SELECT id FROM prospects WHERE user_id = '{uid}');
DELETE FROM prospect_workflow_events WHERE prospect_id IN (SELECT id FROM prospects WHERE user_id = '{uid}');
DELETE FROM prospect_workflows WHERE prospect_id IN (SELECT id FROM prospects WHERE user_id = '{uid}');
DELETE FROM prospects WHERE user_id = '{uid}';
DELETE FROM goals WHERE user_id = '{uid}';
DELETE FROM scheduled_push_jobs WHERE user_id = '{uid}';
DELETE FROM empresa_miembros WHERE usuario_id = '{uid}';
DELETE FROM workspace_miembros WHERE usuario_id = '{uid}';
DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = '{uid}';
DELETE FROM workspace_miembros WHERE workspace_id IN (SELECT id FROM _qa_personal_ws);
DELETE FROM workspaces WHERE tipo = 'personal' AND id IN (SELECT id FROM _qa_personal_ws);
DELETE FROM profiles WHERE id = '{uid}';
ALTER TABLE public.prospect_workflow_events ENABLE TRIGGER workflow_events_append_only;
""",
        )
        auth_delete(client, uid)
    return counts(client, email)


def provision(client, email: str, password: str, full_name: str) -> dict:
    purge(client, email)
    uid = auth_create_or_update(client, email, password, full_name)
    full_sql = full_name.replace("'", "''")
    email_sql = email.replace("'", "''")
    psql(
        client,
        f"""
INSERT INTO profiles (id, email, full_name, is_active)
VALUES ('{uid}', '{email_sql}', '{full_sql}', true)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_active = true;
SELECT public.ensure_personal_workspace('{uid}');
UPDATE profiles p
SET is_active = true,
    full_name = '{full_sql}',
    workspace_activo_id = COALESCE(
      p.workspace_activo_id,
      (SELECT w.id FROM workspaces w
       JOIN workspace_miembros wm ON wm.workspace_id = w.id
       WHERE wm.usuario_id = '{uid}' AND w.tipo = 'personal'
       LIMIT 1)
    )
WHERE p.id = '{uid}';
""",
    )
    # Diagnóstico mínimo (sin PII sensible)
    diag = psql(
        client,
        f"""
SELECT 'ws|' || COALESCE(workspace_activo_id::text,'(null)') FROM profiles WHERE id = '{uid}';
SELECT 'emi|' || COUNT(*)::text FROM empresa_miembros WHERE usuario_id = '{uid}';
SELECT 'wsm|' || COUNT(*)::text FROM workspace_miembros WHERE usuario_id = '{uid}';
""",
    ).strip().replace("\n", " ")
    return {"uid": uid, "email": email, "diag": diag}


def seed_prospect(
    client,
    email: str,
    prospect_id: str,
    name: str = "VacQa",
    prospect_code: str | None = None,
) -> dict:
    """Inserta prospects fila mínima alineada al id local (FK tool_calculations)."""
    email_sql = email.replace("'", "''")
    pid = prospect_id.replace("'", "''")
    name_sql = (name or "VacQa").replace("'", "''")
    code = (prospect_code or f"QA-{prospect_id.replace('-', '')[:10]}").replace("'", "''")
    out = psql(
        client,
        f"""
WITH u AS (
  SELECT p.id AS user_id,
         COALESCE(
           p.workspace_activo_id,
           (SELECT w.id FROM workspaces w
            JOIN workspace_miembros wm ON wm.workspace_id = w.id
            WHERE wm.usuario_id = p.id AND w.tipo = 'personal'
            LIMIT 1)
         ) AS workspace_id
  FROM profiles p
  WHERE p.email = '{email_sql}'
)
INSERT INTO prospects (
  id, user_id, workspace_id, prospect_code, name, name1, completed, quick_expedient
)
SELECT '{pid}', u.user_id, u.workspace_id, '{code}', '{name_sql}', '{name_sql}', false, false
FROM u
WHERE u.workspace_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  name1 = EXCLUDED.name1,
  updated_at = now()
RETURNING id::text, user_id::text, workspace_id::text;
""",
    ).strip()
    if not out:
        raise SystemExit("seed-prospect: sin fila (¿perfil/workspace personal?)")
    parts = out.splitlines()[0].split("|")
    return {
        "prospect_id": parts[0] if parts else prospect_id,
        "user_id": parts[1] if len(parts) > 1 else "",
        "workspace_id": parts[2] if len(parts) > 2 else "",
    }


def seed_collab_share_only(
    client,
    owner_email: str,
    recipient_email: str,
    prospect_id: str,
    permission: str = "edit",
) -> dict:
    """Conexión accepted + prospect_shares; B fuera del WS del expediente (sin guest).

    Para canario broadcast/presence donde user_can_access_prospect debe basarse en
    el share, no en membresía. No inserta workspace_miembros.
    """
    owner_sql = owner_email.replace("'", "''")
    recip_sql = recipient_email.replace("'", "''")
    pid = prospect_id.replace("'", "''")
    perm = (permission or "edit").replace("'", "''")
    if perm not in ("view", "edit", "comment", "workspace"):
        raise SystemExit(f"permission inválido: {perm}")
    out = psql(
        client,
        f"""
WITH ids AS (
  SELECT
    (SELECT id FROM profiles WHERE email = '{owner_sql}') AS owner_id,
    (SELECT id FROM profiles WHERE email = '{recip_sql}') AS recipient_id,
    '{pid}'::uuid AS prospect_id,
    (
      SELECT p.workspace_id FROM prospects p
      WHERE p.id = '{pid}'::uuid
        AND p.user_id = (SELECT id FROM profiles WHERE email = '{owner_sql}')
    ) AS owner_ws_id
),
conn AS (
  INSERT INTO user_connections (requester_id, addressee_id, status)
  SELECT owner_id, recipient_id, 'accepted' FROM ids
  WHERE owner_id IS NOT NULL AND recipient_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_connections uc
      WHERE (uc.requester_id = ids.owner_id AND uc.addressee_id = ids.recipient_id)
         OR (uc.requester_id = ids.recipient_id AND uc.addressee_id = ids.owner_id)
    )
  RETURNING id
),
upd AS (
  UPDATE user_connections uc
  SET status = 'accepted'
  FROM ids
  WHERE ((uc.requester_id = ids.owner_id AND uc.addressee_id = ids.recipient_id)
      OR (uc.requester_id = ids.recipient_id AND uc.addressee_id = ids.owner_id))
    AND uc.status IS DISTINCT FROM 'accepted'
  RETURNING uc.id
),
share AS (
  INSERT INTO prospect_shares (prospect_id, owner_id, shared_with_id, permission)
  SELECT prospect_id, owner_id, recipient_id, '{perm}'::share_permission
  FROM ids
  WHERE owner_id IS NOT NULL AND recipient_id IS NOT NULL AND owner_ws_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM prospects p WHERE p.id = ids.prospect_id AND p.user_id = ids.owner_id)
  ON CONFLICT (prospect_id, shared_with_id) DO UPDATE
    SET permission = EXCLUDED.permission
  RETURNING id::text, prospect_id::text, owner_id::text, shared_with_id::text, permission::text
)
SELECT s.id || '|' || s.prospect_id || '|' || s.owner_id || '|' || s.shared_with_id || '|' || s.permission
  || '|' || COALESCE(ids.owner_ws_id::text, '')
  || '|guest=0'
  || '|conn=' || ((SELECT COUNT(*) FROM conn) + (SELECT COUNT(*) FROM upd))::text
FROM share s, ids;
""",
    ).strip()
    if not out:
        raise SystemExit("seed-collab-share-only: sin fila (¿emails/prospect/ws personal?)")
    parts = out.splitlines()[0].split("|")
    return {
        "share_id": parts[0] if parts else "",
        "prospect_id": parts[1] if len(parts) > 1 else prospect_id,
        "owner_id": parts[2] if len(parts) > 2 else "",
        "shared_with_id": parts[3] if len(parts) > 3 else "",
        "permission": parts[4] if len(parts) > 4 else perm,
        "owner_ws_id": parts[5] if len(parts) > 5 else "",
        "guest": False,
    }


def assert_collab_share_only(
    client,
    owner_email: str,
    recipient_email: str,
    prospect_id: str,
) -> dict:
    """SOLO LECTURA: B tiene share real y NO es miembro del WS del expediente."""
    owner_sql = owner_email.replace("'", "''")
    recip_sql = recipient_email.replace("'", "''")
    pid = prospect_id.replace("'", "''")
    # Un solo statement: CTE no sobrevive entre SELECT separados en psql -c.
    out = psql(
        client,
        f"""
WITH ids AS (
  SELECT
    (SELECT id FROM profiles WHERE email = '{owner_sql}') AS owner_id,
    (SELECT id FROM profiles WHERE email = '{recip_sql}') AS recipient_id,
    '{pid}'::uuid AS prospect_id,
    (
      SELECT p.workspace_id FROM prospects p
      WHERE p.id = '{pid}'::uuid
        AND p.user_id = (SELECT id FROM profiles WHERE email = '{owner_sql}')
    ) AS owner_ws_id
)
SELECT
  'share|' || (
    SELECT COUNT(*)::text FROM prospect_shares ps
    WHERE ps.prospect_id = ids.prospect_id
      AND ps.owner_id = ids.owner_id
      AND ps.shared_with_id = ids.recipient_id
  )
  || '|guest_miembro|' || (
    SELECT COUNT(*)::text FROM workspace_miembros wm
    WHERE wm.usuario_id = ids.recipient_id
      AND wm.workspace_id = ids.owner_ws_id
      AND ids.owner_ws_id IS NOT NULL
  )
  || '|conn|' || (
    SELECT COUNT(*)::text FROM user_connections uc
    WHERE ((uc.requester_id = ids.owner_id AND uc.addressee_id = ids.recipient_id)
        OR (uc.requester_id = ids.recipient_id AND uc.addressee_id = ids.owner_id))
      AND uc.status = 'accepted'
  )
  || '|owner_ws|' || COALESCE(ids.owner_ws_id::text, '')
FROM ids;
""",
    )
    parsed = {"share": 0, "guest_miembro": 0, "conn": 0, "owner_ws": ""}
    line = next((ln.strip() for ln in out.splitlines() if ln.strip().startswith("share|")), "")
    # share|N|guest_miembro|N|conn|N|owner_ws|<uuid>
    parts = line.split("|") if line else []
    try:
        parsed["share"] = int(parts[1]) if len(parts) > 1 else 0
        parsed["guest_miembro"] = int(parts[3]) if len(parts) > 3 else 0
        parsed["conn"] = int(parts[5]) if len(parts) > 5 else 0
        parsed["owner_ws"] = parts[7] if len(parts) > 7 else ""
    except (ValueError, IndexError):
        pass
    ok = (
        parsed["share"] >= 1
        and parsed["guest_miembro"] == 0
        and parsed["conn"] >= 1
        and bool(parsed["owner_ws"])
    )
    return {
        **parsed,
        "ok": ok,
        "assert": "share>=1 && guest_miembro=0 && conn>=1 && owner_ws",
    }


def seed_collab_share(
    client,
    owner_email: str,
    recipient_email: str,
    prospect_id: str,
    permission: str = "edit",
) -> dict:
    """Conexión accepted + prospect_shares + miembro guest en WS personal del dueño.

    Sin sala/empresa real. RLS de tool_calculations exige user_in_workspace(workspace_id)
    además del share; por eso el recipiente entra como vendedor temporal al WS
    personal del owner (solo QA efímera). La API de invite exige
    expedientes:compartir; sembramos por SQL admin para no tocar roles de prod.
    """
    owner_sql = owner_email.replace("'", "''")
    recip_sql = recipient_email.replace("'", "''")
    pid = prospect_id.replace("'", "''")
    perm = (permission or "edit").replace("'", "''")
    if perm not in ("view", "edit", "comment", "workspace"):
        raise SystemExit(f"permission inválido: {perm}")
    out = psql(
        client,
        f"""
WITH ids AS (
  SELECT
    (SELECT id FROM profiles WHERE email = '{owner_sql}') AS owner_id,
    (SELECT id FROM profiles WHERE email = '{recip_sql}') AS recipient_id,
    '{pid}'::uuid AS prospect_id,
    (
      SELECT p.workspace_id FROM prospects p
      WHERE p.id = '{pid}'::uuid
        AND p.user_id = (SELECT id FROM profiles WHERE email = '{owner_sql}')
    ) AS owner_ws_id
),
conn AS (
  INSERT INTO user_connections (requester_id, addressee_id, status)
  SELECT owner_id, recipient_id, 'accepted' FROM ids
  WHERE owner_id IS NOT NULL AND recipient_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_connections uc
      WHERE (uc.requester_id = ids.owner_id AND uc.addressee_id = ids.recipient_id)
         OR (uc.requester_id = ids.recipient_id AND uc.addressee_id = ids.owner_id)
    )
  RETURNING id
),
upd AS (
  UPDATE user_connections uc
  SET status = 'accepted'
  FROM ids
  WHERE ((uc.requester_id = ids.owner_id AND uc.addressee_id = ids.recipient_id)
      OR (uc.requester_id = ids.recipient_id AND uc.addressee_id = ids.owner_id))
    AND uc.status IS DISTINCT FROM 'accepted'
  RETURNING uc.id
),
guest AS (
  INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace)
  SELECT recipient_id, owner_ws_id, 'vendedor'
  FROM ids
  WHERE recipient_id IS NOT NULL AND owner_ws_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = ids.owner_ws_id AND w.tipo = 'personal')
  ON CONFLICT (usuario_id, workspace_id) DO NOTHING
  RETURNING id
),
share AS (
  INSERT INTO prospect_shares (prospect_id, owner_id, shared_with_id, permission)
  SELECT prospect_id, owner_id, recipient_id, '{perm}'::share_permission
  FROM ids
  WHERE owner_id IS NOT NULL AND recipient_id IS NOT NULL AND owner_ws_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM prospects p WHERE p.id = ids.prospect_id AND p.user_id = ids.owner_id)
  ON CONFLICT (prospect_id, shared_with_id) DO UPDATE
    SET permission = EXCLUDED.permission
  RETURNING id::text, prospect_id::text, owner_id::text, shared_with_id::text, permission::text
)
SELECT s.id || '|' || s.prospect_id || '|' || s.owner_id || '|' || s.shared_with_id || '|' || s.permission
  || '|' || COALESCE(ids.owner_ws_id::text, '')
  || '|guest=' || (SELECT COUNT(*)::text FROM guest)
  || '|conn=' || ((SELECT COUNT(*) FROM conn) + (SELECT COUNT(*) FROM upd))::text
FROM share s, ids;
""",
    ).strip()
    if not out:
        raise SystemExit("seed-collab-share: sin fila (¿emails/prospect/ws personal?)")
    parts = out.splitlines()[0].split("|")
    return {
        "share_id": parts[0] if parts else "",
        "prospect_id": parts[1] if len(parts) > 1 else prospect_id,
        "owner_id": parts[2] if len(parts) > 2 else "",
        "shared_with_id": parts[3] if len(parts) > 3 else "",
        "permission": parts[4] if len(parts) > 4 else perm,
        "owner_ws_id": parts[5] if len(parts) > 5 else "",
    }


def grant_survey_config(client, email: str) -> dict:
    """Otorga herramientas:survey_configurar_preguntas a QA (usuario_permisos_override)."""
    email_sql = email.replace("'", "''")
    out = psql(
        client,
        f"""
INSERT INTO public.usuario_permisos_override (usuario_id, permiso_id, otorgado)
SELECT p.id, perm.id, true
FROM profiles p
CROSS JOIN permisos perm
WHERE p.email = '{email_sql}'
  AND perm.clave = 'herramientas:survey_configurar_preguntas'
ON CONFLICT (usuario_id, permiso_id) DO UPDATE SET otorgado = true, updated_at = now()
RETURNING usuario_id::text;
""",
    ).strip()
    uid = out.splitlines()[0].strip() if out.strip() else ""
    return {"email": email, "uid": uid, "granted": bool(uid)}


def grant_money_box(client, email: str) -> dict:
    """Override usuario: flag worksheet.money_box (Money Box PRO standalone)."""
    email_sql = email.replace("'", "''")
    out = psql(
        client,
        f"""
WITH u AS (
  SELECT id FROM profiles WHERE email = '{email_sql}'
),
ins AS (
  INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
  SELECT f.id, 'usuario', u.id, true
  FROM flags f
  CROSS JOIN u
  WHERE f.clave = 'worksheet.money_box'
    AND (f.empresa_id IS NULL)
  ON CONFLICT (flag_id, alcance, alcance_id) DO UPDATE SET activo = true
  RETURNING alcance_id::text AS uid
)
SELECT uid FROM ins;
""",
    ).strip()
    uid = out.splitlines()[0].strip() if out.strip() else ""
    return {"email": email, "uid": uid, "granted": bool(uid), "flag": "worksheet.money_box"}


def check_broadcast_policy(client) -> dict:
    """¿Existe policy broadcast_expediente en realtime.messages? (precondición gate collab)."""
    out = psql(
        client,
        """
SELECT COUNT(*)::text
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'realtime'
  AND c.relname = 'messages'
  AND pol.polname = 'broadcast_expediente';
""",
    ).strip()
    n = int(out.splitlines()[0].strip() or "0")
    return {"broadcast_expediente": n > 0, "count": n}


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "uso: provision|counts|purge|seed-prospect|seed-collab-share|seed-collab-share-only|"
            "assert-collab-share-only|grant-survey-config|grant-money-box|check-broadcast-policy ..."
        )
    cmd = sys.argv[1]
    client = connect_vps(load_env_file(ROOT))
    try:
        if cmd == "check-broadcast-policy":
            print(json.dumps(check_broadcast_policy(client)))
            return
        if len(sys.argv) < 3:
            raise SystemExit(
                "uso: provision|counts|purge|seed-prospect|seed-collab-share|seed-collab-share-only|"
                "assert-collab-share-only|grant-survey-config|grant-money-box <email> ..."
            )
        email = sys.argv[2]
        if cmd == "provision":
            if len(sys.argv) < 5:
                raise SystemExit("provision <email> <password> <full_name>")
            print(json.dumps(provision(client, email, sys.argv[3], sys.argv[4])))
        elif cmd == "counts":
            print(json.dumps(counts(client, email)))
        elif cmd == "purge":
            print(json.dumps(purge(client, email)))
        elif cmd == "grant-survey-config":
            print(json.dumps(grant_survey_config(client, email)))
        elif cmd == "grant-money-box":
            print(json.dumps(grant_money_box(client, email)))
        elif cmd == "seed-prospect":
            if len(sys.argv) < 4:
                raise SystemExit("seed-prospect <email> <prospect_id> [name] [prospect_code]")
            name = sys.argv[4] if len(sys.argv) > 4 else "VacQa"
            code = sys.argv[5] if len(sys.argv) > 5 else None
            print(json.dumps(seed_prospect(client, email, sys.argv[3], name, code)))
        elif cmd == "seed-collab-share":
            if len(sys.argv) < 5:
                raise SystemExit(
                    "seed-collab-share <owner_email> <recipient_email> <prospect_id> [permission]"
                )
            perm = sys.argv[5] if len(sys.argv) > 5 else "edit"
            print(json.dumps(seed_collab_share(client, email, sys.argv[3], sys.argv[4], perm)))
        elif cmd == "seed-collab-share-only":
            if len(sys.argv) < 5:
                raise SystemExit(
                    "seed-collab-share-only <owner_email> <recipient_email> <prospect_id> [permission]"
                )
            perm = sys.argv[5] if len(sys.argv) > 5 else "edit"
            print(json.dumps(seed_collab_share_only(client, email, sys.argv[3], sys.argv[4], perm)))
        elif cmd == "assert-collab-share-only":
            if len(sys.argv) < 5:
                raise SystemExit(
                    "assert-collab-share-only <owner_email> <recipient_email> <prospect_id>"
                )
            print(json.dumps(assert_collab_share_only(client, email, sys.argv[3], sys.argv[4])))
        else:
            raise SystemExit(f"comando desconocido: {cmd}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
