#!/usr/bin/env python3
"""
Fix de orden de autorización en expedientes:
1) Sube archivos a disco (backup previo)
2) Reinicia SOLO staging y corre smoke QA
3) Si staging PASS, reinicia prod y corre el mismo smoke
4) Limpia cuentas QA en ambos casos
Nunca reinicia prod si el smoke de staging falla; restaura backup en disco.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
ROLE_SLUG = "qa-sec-prospect-denied"
RESULTS = ROOT / "scripts" / ".qa-prospect-auth-order-results.json"

API_FILES = [
    "apps/api/src/services/prospects-service.js",
    "apps/api/src/services/prospect-participants-service.js",
]

EMAIL_DENIED = "qa-sec-denied-prospect@saletse-test.com"
EMAIL_LINER = "qa-sec-liner-prospect@saletse-test.com"
EMAIL_GERENTE = "qa-sec-gerente-prospect@saletse-test.com"
EMAIL_CLOSER = "qa-sec-closer-prospect@saletse-test.com"
EMAILS = [EMAIL_DENIED, EMAIL_LINER, EMAIL_GERENTE, EMAIL_CLOSER]
PERSONAL_NAMES = (
    "QA Sec Denied Prospect",
    "QA Sec Liner Prospect",
    "QA Sec Gerente Prospect",
    "QA Sec Closer Prospect",
)
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)

STRIP_KEYS = (
    "expedientes:ver_equipo",
    "expedientes:ver_propios",
    "expedientes:editar",
    "expedientes:eliminar",
    "expedientes:crear",
    "workflow:revisar",
    "workflow:cerrar",
    "dashboard:ver_equipo",
    "metas:ver_equipo",
    "ventas:ver_equipo",
)

TARGETS = {
    "staging": {
        "db": "supabase-db",
        "env_file": "/opt/saletse-api-staging/.env",
        "api": "http://127.0.0.1:4001",
        "pm2": "saletse-api-staging",
    },
    "prod": {
        "db": "saletse-prod-db",
        "env_file": "/var/www/Saletse/.env",
        "api": "http://127.0.0.1:4000",
        "pm2": "saletse-api",
    },
}


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def ssh_connect(env):
    pwd = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    if not pwd:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("VPS_HOST", "187.77.14.148"),
        username=env.get("VPS_USER", "root"),
        password=pwd,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    return client


def run(client, cmd, timeout=120):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"cmd failed ({code}): {cmd}\n{out}\n{err}")
    return out


def psql(client, db, sql):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    out = run(client, cmd, timeout=120)
    if "ERROR:" in out:
        raise RuntimeError(out[-2500:])
    return out


def last_line(text):
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1] if lines else ""


def quoted_emails():
    return ", ".join(f"'{e}'" for e in EMAILS)


def purge(client, db):
    q = quoted_emails()
    psql(
        client,
        db,
        f"""
SET session_replication_role = replica;
{sql_capture_qa_personal_workspaces(list(EMAILS), list(PERSONAL_NAMES))}
DELETE FROM prospect_workflow_events e
USING prospects pr, profiles p
WHERE e.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflow_events e
USING profiles p WHERE e.actor_id = p.id AND p.email IN ({q});
DELETE FROM sales s USING profiles p WHERE s.user_id = p.id AND p.email IN ({q});
DELETE FROM activities a USING profiles p WHERE a.user_id = p.id AND p.email IN ({q});
DELETE FROM goals g USING profiles p WHERE g.user_id = p.id AND p.email IN ({q});
DELETE FROM tool_calculations t USING profiles p WHERE t.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflows w
USING prospects pr, profiles p
WHERE w.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_messages m
USING chat_conversations c, prospects pr, profiles p
WHERE m.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_members cm
USING chat_conversations c, prospects pr, profiles p
WHERE cm.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_conversations c
USING prospects pr, profiles p
WHERE c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospects pr USING profiles p WHERE pr.user_id = p.id AND p.email IN ({q});
DELETE FROM workspace_usuario_permisos_override o USING profiles p
WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM usuario_permisos_override o USING profiles p
WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM permisos_delegados d USING profiles p
WHERE (d.usuario_asistente_id = p.id OR d.otorgado_por = p.id OR d.usuario_delegante_id = p.id)
  AND p.email IN ({q});
DELETE FROM workspace_miembros wm USING profiles p WHERE wm.usuario_id = p.id AND p.email IN ({q});
DELETE FROM empresa_miembros em USING profiles p WHERE em.usuario_id = p.id AND p.email IN ({q});
DELETE FROM flag_reglas fr USING profiles p
WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({q});
UPDATE profiles SET role_id = NULL WHERE email IN ({q});
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({q});
DELETE FROM auth.users WHERE email IN ({q});
DELETE FROM profiles WHERE email IN ({q});
DELETE FROM rol_permisos rp USING roles r
WHERE rp.rol_id = r.id AND r.empresa_id = '{RH_ID}' AND r.slug = '{ROLE_SLUG}';
DELETE FROM roles WHERE empresa_id = '{RH_ID}' AND slug = '{ROLE_SLUG}';
SET session_replication_role = origin;
""",
    )


def leftover(client, db):
    q = quoted_emails()
    raw = psql(
        client,
        db,
        f"""
SELECT 'profiles', COUNT(*) FROM profiles WHERE email IN ({q});
SELECT 'auth.users', COUNT(*) FROM auth.users WHERE email IN ({q});
SELECT 'wm', COUNT(*) FROM workspace_miembros wm JOIN profiles p ON p.id = wm.usuario_id WHERE p.email IN ({q});
SELECT 'role', COUNT(*) FROM roles WHERE empresa_id = '{RH_ID}' AND slug = '{ROLE_SLUG}';
{sql_leftover_qa_personal_workspaces(list(EMAILS), list(PERSONAL_NAMES))}
""",
    )
    counts = {}
    for line in raw.splitlines():
        if "|" in line:
            k, v = line.strip().split("|", 1)
            counts[k] = v
    return counts


def ensure_auth_user(client, env_file, email, full_name, password):
    script = f"""
python3 - <<'PY'
import json, os, urllib.request, urllib.error
env = {{}}
for raw in open({env_file!r}, encoding="utf-8"):
    raw = raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    k, v = raw.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
base = env.get("SUPABASE_URL", "").rstrip("/")
anon = env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
service = env.get("SUPABASE_SERVICE_ROLE_KEY")
email = {email!r}
full_name = {full_name!r}
password = {password!r}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        base + path,
        data=data,
        method=method,
        headers={{"Authorization": "Bearer " + service, "apikey": anon, "Content-Type": "application/json"}},
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {{}}
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {{"raw": raw[:400]}}
        return ex.code, payload

st, listed = req("GET", "/auth/v1/admin/users?page=1&per_page=1000")
if st != 200:
    raise SystemExit(f"listUsers {{st}} {{listed}}")
users = listed.get("users") or []
existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
body = {{"email": email, "password": password, "email_confirm": True, "user_metadata": {{"full_name": full_name}}}}
if existing:
    st, out = req("PUT", f"/auth/v1/admin/users/{{existing['id']}}", {{"email_confirm": True, "password": password, "user_metadata": {{"full_name": full_name}}}})
    if st not in (200, 201):
        raise SystemExit(f"updateUser {{st}} {{out}}")
    print(existing["id"])
else:
    st, created = req("POST", "/auth/v1/admin/users", body)
    if st not in (200, 201):
        raise SystemExit(f"createUser {{st}} {{created}}")
    uid = created.get("id") or (created.get("user") or {{}}).get("id")
    if not uid:
        raise SystemExit(f"sin id {{created}}")
    print(uid)
PY
"""
    return last_line(run(client, script, timeout=90))


def login_token(client, env_file, email, password):
    py = f"""
python3 - <<'PY'
import json, urllib.request, urllib.error
env = {{}}
for raw in open({env_file!r}, encoding="utf-8"):
    raw = raw.strip()
    if not raw or raw.startswith("#") or "=" not in raw:
        continue
    k, v = raw.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
base = env.get("SUPABASE_URL", "").rstrip("/")
anon = env.get("SUPABASE_ANON_KEY") or env.get("VITE_SUPABASE_ANON_KEY")
body = json.dumps({{"email": {email!r}, "password": {password!r}}}).encode()
req = urllib.request.Request(
    base + "/auth/v1/token?grant_type=password",
    data=body,
    method="POST",
    headers={{"apikey": anon, "Content-Type": "application/json"}},
)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
except urllib.error.HTTPError as ex:
    raise SystemExit(ex.read().decode()[:400])
token = data.get("access_token")
if not token:
    raise SystemExit("sin access_token")
print(token)
PY
"""
    return last_line(run(client, py, timeout=60))


def remote_http(client, method, url, token, body=None):
    import base64

    raw_b64 = base64.b64encode(json.dumps(body).encode()).decode() if body is not None else ""
    py = f"""
python3 - <<'PY'
import json, urllib.request, urllib.error, base64
method = {method!r}
url = {url!r}
token = {token!r}
raw_b64 = {raw_b64!r}
body = json.loads(base64.b64decode(raw_b64).decode()) if raw_b64 else None
headers = {{
    "Authorization": "Bearer " + token,
    "Accept": "application/json",
    "Origin": "http://127.0.0.1",
}}
data = None
if body is not None:
    headers["Content-Type"] = "application/json"
    data = json.dumps(body).encode()
req = urllib.request.Request(url, data=data, method=method, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8", "replace")
        status = resp.status
except urllib.error.HTTPError as ex:
    raw = ex.read().decode("utf-8", "replace")
    status = ex.code
try:
    parsed = json.loads(raw) if raw else None
except Exception:
    parsed = None
print(json.dumps({{"status": status, "json": parsed, "text": raw[:1500]}}))
PY
"""
    out = run(client, py, timeout=90)
    line = last_line(out)
    return json.loads(line)


def rec(checks, key, passed, detail):
    checks[key] = {"pass": bool(passed), "detail": detail}
    print(f"  [{'PASS' if passed else 'FAIL'}] {key}: {detail}")


def setup_users(client, db, passwords):
    purge(client, db)
    strip_sql = ", ".join(f"'{k}'" for k in STRIP_KEYS)
    psql(
        client,
        db,
        f"""
INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT r.empresa_id, 'QA sec prospect denied', '{ROLE_SLUG}', r.scope, r.paquete_id, false
FROM roles r
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
  AND NOT EXISTS (
    SELECT 1 FROM roles x WHERE x.empresa_id = '{RH_ID}' AND x.slug = '{ROLE_SLUG}'
  );

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT qa.id, rp.permiso_id
FROM roles qa
JOIN roles liner ON liner.empresa_id = qa.empresa_id AND liner.slug = 'liner'
JOIN rol_permisos rp ON rp.rol_id = liner.id
JOIN permisos p ON p.id = rp.permiso_id
WHERE qa.empresa_id = '{RH_ID}' AND qa.slug = '{ROLE_SLUG}'
  AND p.clave NOT IN ({strip_sql})
ON CONFLICT DO NOTHING;
""",
    )


def membership_sql(uid, role_slug, rol_en_workspace):
    return f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false, estado = 'activo';

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', '{rol_en_workspace}', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{role_slug}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;

UPDATE profiles SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true
WHERE id = '{uid}';
"""


def smoke_target(client, target_name, passwords):
    cfg = TARGETS[target_name]
    db = cfg["db"]
    api = cfg["api"]
    checks = {}
    print(f"\n=== SMOKE {target_name} @ {api} ===")
    setup_users(client, db, passwords)

    env_file = cfg["env_file"]
    uid_denied = ensure_auth_user(client, env_file, EMAIL_DENIED, "QA Sec Denied Prospect", passwords["denied"])
    uid_liner = ensure_auth_user(client, env_file, EMAIL_LINER, "QA Sec Liner Prospect", passwords["liner"])
    uid_gerente = ensure_auth_user(client, env_file, EMAIL_GERENTE, "QA Sec Gerente Prospect", passwords["gerente"])
    uid_closer = ensure_auth_user(client, env_file, EMAIL_CLOSER, "QA Sec Closer Prospect", passwords["closer"])
    print(f"  uids denied={uid_denied[:8]}… liner={uid_liner[:8]}… gerente={uid_gerente[:8]}… closer={uid_closer[:8]}…")

    for uid in (uid_denied, uid_liner, uid_gerente, uid_closer):
        psql(client, db, f"SELECT public.ensure_personal_workspace('{uid}');")
    psql(client, db, membership_sql(uid_denied, ROLE_SLUG, "vendedor"))
    psql(client, db, membership_sql(uid_liner, "liner", "vendedor"))
    # Un solo rol_en_workspace='gerente' por sala (workspace_un_gerente_por_sala).
    # El puesto gerente se asigna por role_id; isManager sigue saliendo por
    # workflow:revisar / expedientes:ver_equipo del catálogo de ese puesto.
    psql(client, db, membership_sql(uid_gerente, "gerente", "vendedor"))
    psql(client, db, membership_sql(uid_closer, "cerrador", "vendedor"))

    perm_raw = psql(
        client,
        db,
        f"""
SELECT
  (SELECT COUNT(*) FROM rol_permisos rp JOIN workspace_miembros wm ON wm.role_id = rp.rol_id JOIN permisos p ON p.id = rp.permiso_id
   WHERE wm.usuario_id = '{uid_denied}' AND wm.workspace_id = '{SALA_RH_ID}' AND p.clave IN ('expedientes:ver_propios','expedientes:ver_equipo','expedientes:editar','workflow:revisar','dashboard:ver_equipo')),
  (SELECT COUNT(*) FROM rol_permisos rp JOIN workspace_miembros wm ON wm.role_id = rp.rol_id JOIN permisos p ON p.id = rp.permiso_id
   WHERE wm.usuario_id = '{uid_liner}' AND wm.workspace_id = '{SALA_RH_ID}' AND p.clave = 'expedientes:editar'),
  (SELECT r.slug FROM workspace_miembros wm JOIN roles r ON r.id = wm.role_id WHERE wm.usuario_id = '{uid_gerente}' AND wm.workspace_id = '{SALA_RH_ID}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{uid_denied}');
""",
    ).strip()
    parts = [p.strip() for p in perm_raw.split("|")]
    rec(checks, "catalog_denied_stripped", parts[0] == "0", f"denied forbidden-keys count={parts[0]} (debe 0)")
    rec(checks, "catalog_liner_can_edit", parts[1] == "1", f"liner expedientes:editar={parts[1]}")
    rec(checks, "catalog_gerente_role", parts[2] == "gerente" and parts[3] == "f", f"gerente slug={parts[2]} denied_super={parts[3]}")

    tokens = {}
    for name, email, pw in (
        ("denied", EMAIL_DENIED, passwords["denied"]),
        ("liner", EMAIL_LINER, passwords["liner"]),
        ("gerente", EMAIL_GERENTE, passwords["gerente"]),
        ("closer", EMAIL_CLOSER, passwords["closer"]),
    ):
        try:
            tokens[name] = login_token(client, env_file, email, pw)
            rec(checks, f"login_{name}", bool(tokens[name]), f"password-grant {name} token={tokens[name][:12]}…")
        except Exception as ex:
            tokens[name] = ""
            rec(checks, f"login_{name}", False, f"password-grant {name} FAIL {ex}")

    created = remote_http(
        client,
        "POST",
        f"{api}/api/v1/prospects",
        tokens["liner"],
        {"name": "QA sec auth-order", "name1": "QA sec auth-order", "status": "activo"},
    )
    prospect_id = (created.get("json") or {}).get("data", {}).get("id") or (created.get("json") or {}).get("id")
    rec(checks, "liner_create_prospect", created.get("status") in (200, 201) and bool(prospect_id), f"POST prospect HTTP {created.get('status')} id={prospect_id}")
    if not prospect_id:
        return checks, False

    wf_count = "0"
    for _ in range(12):
        wf_count = last_line(
            psql(client, db, f"SELECT COUNT(*) FROM prospect_workflows WHERE prospect_id = '{prospect_id}';")
        )
        if wf_count == "1":
            break
        time.sleep(0.5)
    rec(checks, "workflow_side_effect_or_absent", wf_count in ("0", "1"), f"workflow rows before denied assign={wf_count}")
    snap_before = last_line(
        psql(
            client,
            db,
            f"SELECT COUNT(*)::text || ',' || COALESCE((SELECT cerrador_id::text FROM prospect_workflows WHERE prospect_id = '{prospect_id}' LIMIT 1),'') FROM prospect_workflows WHERE prospect_id = '{prospect_id}';",
        )
    )

    denied_assign = remote_http(
        client,
        "POST",
        f"{api}/api/v1/prospects/{prospect_id}/participants/assign-closer",
        tokens["denied"],
        {"cerrador_id": uid_closer},
    )
    denied_rep = remote_http(
        client,
        "POST",
        f"{api}/api/v1/prospects/{prospect_id}/participants/assign-representante",
        tokens["denied"],
        {"representante_id": uid_liner},
    )
    snap_after = last_line(
        psql(
            client,
            db,
            f"SELECT COUNT(*)::text || ',' || COALESCE((SELECT cerrador_id::text FROM prospect_workflows WHERE prospect_id = '{prospect_id}' LIMIT 1),'') FROM prospect_workflows WHERE prospect_id = '{prospect_id}';",
        )
    )
    assign_ok = (
        denied_assign.get("status") == 403
        and denied_rep.get("status") == 403
        and snap_before == snap_after
    )
    rec(
        checks,
        "s1_denied_assign_no_write",
        assign_ok,
        f"assignCloser HTTP {denied_assign.get('status')} body={json.dumps(denied_assign.get('json'))} "
        f"assignRep HTTP {denied_rep.get('status')} db {snap_before} -> {snap_after}",
    )

    gerente_get = remote_http(client, "GET", f"{api}/api/v1/prospects/{prospect_id}/participants", tokens["gerente"])
    gerente_assign = remote_http(
        client,
        "POST",
        f"{api}/api/v1/prospects/{prospect_id}/participants/assign-closer",
        tokens["gerente"],
        {"cerrador_id": uid_closer},
    )
    closer_db = last_line(
        psql(client, db, f"SELECT COALESCE(cerrador_id::text,'') FROM prospect_workflows WHERE prospect_id = '{prospect_id}';")
    )
    rec(
        checks,
        "s2_gerente_assign_ok",
        gerente_get.get("status") == 200 and gerente_assign.get("status") == 200 and closer_db == uid_closer,
        f"GET participants {gerente_get.get('status')}; assignCloser {gerente_assign.get('status')} "
        f"cerrador_id={closer_db[:8] if closer_db else ''}… expected closer",
    )

    prospect_b = remote_http(
        client,
        "POST",
        f"{api}/api/v1/prospects",
        tokens["liner"],
        {"name": "QA sec assignment-bypass", "name1": "QA sec assignment-bypass", "status": "activo"},
    )
    prospect_b_id = (prospect_b.get("json") or {}).get("data", {}).get("id") or (prospect_b.get("json") or {}).get("id")
    rec(checks, "liner_create_prospect_b", bool(prospect_b_id), f"prospect B id={prospect_b_id}")
    if prospect_b_id:
        psql(
            client,
            db,
            f"""
INSERT INTO prospect_workflows (prospect_id, workspace_id, representante_id, cerrador_id, created_by, estado)
VALUES ('{prospect_b_id}', '{SALA_RH_ID}', '{uid_liner}', '{uid_denied}', '{uid_liner}', 'en_progreso')
ON CONFLICT (prospect_id) DO UPDATE SET cerrador_id = EXCLUDED.cerrador_id;
""",
        )
        assigned = last_line(
            psql(
                client,
                db,
                f"SELECT COUNT(*) FROM prospect_workflows WHERE prospect_id = '{prospect_b_id}' AND cerrador_id = '{uid_denied}';",
            )
        )
        rec(checks, "assignment_exists_for_denied", assigned == "1", f"denied is cerrador on B count={assigned}")
        listed = remote_http(client, "GET", f"{api}/api/v1/prospects?limit=50", tokens["denied"])
        got = remote_http(client, "GET", f"{api}/api/v1/prospects/{prospect_b_id}", tokens["denied"])
        list_denied = listed.get("status") == 403 and (listed.get("json") or {}).get("code") == "WORKSPACE_PERMISSION_DENIED"
        get_denied = got.get("status") == 403 and (got.get("json") or {}).get("code") == "WORKSPACE_PERMISSION_DENIED"
        rec(
            checks,
            "s3_list_get_denied_despite_assignment",
            list_denied and get_denied,
            f"list HTTP {listed.get('status')} {listed.get('json')}; get HTTP {got.get('status')} {got.get('json')}",
        )

    team = remote_http(client, "GET", f"{api}/api/v1/prospects?limit=50", tokens["gerente"])
    team_json = team.get("json") or {}
    team_data = team_json.get("data") if isinstance(team_json, dict) else None
    ids = {row.get("id") for row in (team_data or []) if isinstance(row, dict)}
    rec(
        checks,
        "s4_gerente_ver_equipo",
        team.get("status") == 200 and prospect_id in ids,
        f"GET list gerente HTTP {team.get('status')} total={team_json.get('total')} has liner prospect={prospect_id in ids}",
    )

    name_before = last_line(psql(client, db, f"SELECT COALESCE(name1, name, '') FROM prospects WHERE id = '{prospect_id}';"))
    denied_patch = remote_http(
        client,
        "PATCH",
        f"{api}/api/v1/prospects/{prospect_id}",
        tokens["denied"],
        {"name1": "HACKED BY DENIED"},
    )
    name_after_denied = last_line(psql(client, db, f"SELECT COALESCE(name1, name, '') FROM prospects WHERE id = '{prospect_id}';"))
    denied_patch_ok = (
        denied_patch.get("status") == 403
        and (denied_patch.get("json") or {}).get("code") == "WORKSPACE_PERMISSION_DENIED"
        and name_after_denied == name_before
    )
    rec(
        checks,
        "s5a_update_denied_no_write",
        denied_patch_ok,
        f"PATCH denied HTTP {denied_patch.get('status')} {denied_patch.get('json')} db '{name_before}' -> '{name_after_denied}'",
    )

    liner_patch = remote_http(
        client,
        "PATCH",
        f"{api}/api/v1/prospects/{prospect_id}",
        tokens["liner"],
        {"name1": "QA sec liner edited"},
    )
    name_after_liner = last_line(psql(client, db, f"SELECT COALESCE(name1, name, '') FROM prospects WHERE id = '{prospect_id}';"))
    rec(
        checks,
        "s5b_update_liner_ok",
        liner_patch.get("status") == 200 and name_after_liner == "QA sec liner edited",
        f"PATCH liner HTTP {liner_patch.get('status')} db='{name_after_liner}'",
    )

    required = [
        "s1_denied_assign_no_write",
        "s2_gerente_assign_ok",
        "s3_list_get_denied_despite_assignment",
        "s4_gerente_ver_equipo",
        "s5a_update_denied_no_write",
        "s5b_update_liner_ok",
    ]
    passed = all(checks.get(k, {}).get("pass") for k in required)
    print(f"  SMOKE {target_name}={'PASS' if passed else 'FAIL'}")
    return checks, passed


def upload_files(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-prospect-auth-order-{stamp}"
    run(client, f"mkdir -p {backup}")
    for rel in API_FILES:
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        run(client, f"cp -a {remote} {backup}/")
    sftp = client.open_sftp()
    for rel in API_FILES:
        local = ROOT / rel
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"upload {rel}")
        sftp.put(str(local), remote)
    sftp.close()
    return backup


def restore_files(client, backup):
    for rel in API_FILES:
        name = Path(rel).name
        run(client, f"cp -a {backup}/{name} {REMOTE}/{rel.replace(chr(92), '/')}")


def restart_api(client, name):
    run(client, f"pm2 restart {name} && sleep 2")
    port = "4001" if name.endswith("staging") else "4000"
    health = run(client, f"curl -sf http://127.0.0.1:{port}/health")
    if '"ok":true' not in health.replace(" ", ""):
        raise RuntimeError(f"health {name} fail: {health}")
    return health


def main():
    env = load_env()
    client = ssh_connect(env)
    report = {"startedAt": utcnow(), "targets": {}}
    passwords = {
        "denied": secrets.token_urlsafe(10) + "Aa1!",
        "liner": secrets.token_urlsafe(10) + "Aa1!",
        "gerente": secrets.token_urlsafe(10) + "Aa1!",
        "closer": secrets.token_urlsafe(10) + "Aa1!",
    }
    backup = None
    rc = 1
    try:
        print("=== backup + upload (disco compartido; prod sigue en memoria vieja) ===")
        backup = upload_files(client)
        print(f"  backup={backup}")
        grep = run(
            client,
            f"grep -n 'requireWorkspacePermission' {REMOTE}/apps/api/src/services/prospects-service.js | head -20; "
            f"grep -n 'assertCanManageParticipants\\|participantsAfterAuth' {REMOTE}/apps/api/src/services/prospect-participants-service.js | head",
        )
        print(grep)
        report["backup"] = backup
        report["uploadAt"] = utcnow()

        print("=== restart STAGING only ===")
        restart_api(client, "saletse-api-staging")
        report["stagingRestartAt"] = utcnow()

        try:
            checks, passed = smoke_target(client, "staging", passwords)
        finally:
            print("=== purge staging QA ===")
            try:
                purge(client, TARGETS["staging"]["db"])
                left = leftover(client, TARGETS["staging"]["db"])
                print(f"  leftover staging={left}")
                report.setdefault("targets", {}).setdefault("staging", {})["leftover"] = left
            except Exception as ex:
                print(f"  WARN purge staging: {ex}")
        report["targets"]["staging"] = {**report.get("targets", {}).get("staging", {}), "checks": checks, "pass": passed, "finishedAt": utcnow()}
        if not passed:
            print("STAGING SMOKE FAIL — restauro disco y NO reinicio prod")
            restore_files(client, backup)
            report["prodDeployed"] = False
            report["restoredAfterStagingFail"] = True
            RESULTS.write_text(json.dumps(report, indent=2), encoding="utf-8")
            sys.exit(1)

        print("=== staging PASS — ahora sí prod ===")
        report["prodDeployStartedAt"] = utcnow()
        staging_done = report["targets"]["staging"]["finishedAt"]
        prod_start = report["prodDeployStartedAt"]
        if staging_done >= prod_start:
            raise RuntimeError("invariante temporal: staging smoke debe terminar ANTES del deploy prod")
        restart_api(client, "saletse-api")
        report["prodRestartAt"] = utcnow()
        try:
            pchecks, ppassed = smoke_target(client, "prod", passwords)
        finally:
            print("=== purge prod QA ===")
            try:
                purge(client, TARGETS["prod"]["db"])
                left = leftover(client, TARGETS["prod"]["db"])
                print(f"  leftover prod={left}")
                report.setdefault("targets", {}).setdefault("prod", {})["leftover"] = left
            except Exception as ex:
                print(f"  WARN purge prod: {ex}")
                ppassed = False
        report["targets"]["prod"] = {**report.get("targets", {}).get("prod", {}), "checks": pchecks, "pass": ppassed, "finishedAt": utcnow()}
        report["prodDeployed"] = True
        rc = 0 if ppassed else 1
        if not ppassed:
            print("PROD SMOKE FAIL — restauro disco y reinicio prod al backup")
            restore_files(client, backup)
            restart_api(client, "saletse-api")
            report["restoredAfterProdFail"] = True
    finally:
        report["finishedAt"] = utcnow()
        RESULTS.write_text(json.dumps(report, indent=2), encoding="utf-8")
        client.close()
        print(f"\nJSON: {RESULTS}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
