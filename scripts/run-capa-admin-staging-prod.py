#!/usr/bin/env python3
"""
0090 + techo delegante capa:app.
Staging: aplica SQL + restart API, smoke, leftover 0.
Prod: solo si staging PASS.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
MIG = ROOT / "supabase" / "migrations" / "0090_empresa_admin_exclude_capa_admin.sql"
API_FILES = [
    "apps/api/src/services/delegacion-service.js",
    "apps/api/src/controllers/delegacion-controller.js",
]
RESULTS = ROOT / "scripts" / ".qa-capa-admin-results.json"

RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL_ADMIN = "qa-capa-admin-rh@saletse-test.com"
EMAIL_ASIST = "qa-capa-asist-rh@saletse-test.com"
EMAILS = [EMAIL_ADMIN, EMAIL_ASIST]
NAME_ADMIN = "QA Capa Admin RH"
NAME_ASIST = "QA Capa Asist RH"

APP_PROBE = [
    "expedientes:ver_equipo",
    "expedientes:crear",
    "ventas:registrar",
    "herramientas:worksheet",
    "workflow:ver",
    "agenda:usar",
]
ADMIN_PROBE = [
    "ver_logs",
    "gestionar_roles_permisos",
    "usuarios.cambiar_plan",
    "ver_resumen",
    "usuarios.export_csv",
]

sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
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


def run(client, cmd, timeout=180):
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


def rec(checks, key, passed, detail):
    checks[key] = {"pass": bool(passed), "detail": detail}
    print(f"  [{'PASS' if passed else 'FAIL'}] {key}: {detail}")


def ensure_auth_user(client, env_file, email, full_name, password):
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
service = env.get("SUPABASE_SERVICE_ROLE_KEY")
email = {email!r}
full_name = {full_name!r}
password = {password!r}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        base + path, data=data, method=method,
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
if existing:
    st, out = req("PUT", f"/auth/v1/admin/users/{{existing['id']}}", {{"email_confirm": True, "password": password, "user_metadata": {{"full_name": full_name}}}})
    if st not in (200, 201):
        raise SystemExit(f"updateUser {{st}} {{out}}")
    print(existing["id"])
else:
    st, created = req("POST", "/auth/v1/admin/users", {{"email": email, "password": password, "email_confirm": True, "user_metadata": {{"full_name": full_name}}}})
    if st not in (200, 201):
        raise SystemExit(f"createUser {{st}} {{created}}")
    uid = created.get("id") or (created.get("user") or {{}}).get("id")
    if not uid:
        raise SystemExit(f"sin id {{created}}")
    print(uid)
PY
"""
    return last_line(run(client, py, timeout=90))


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
    data=body, method="POST",
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
headers = {{"Authorization": "Bearer " + token, "Accept": "application/json", "Origin": "http://127.0.0.1"}}
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
print(json.dumps({{"status": status, "json": parsed, "text": raw[:2000]}}))
PY
"""
    return json.loads(last_line(run(client, py, timeout=90)))


def purge(client, db):
    q = ", ".join(f"'{e}'" for e in EMAILS)
    psql(
        client,
        db,
        f"""
SET session_replication_role = replica;
{sql_capture_qa_personal_workspaces(EMAILS, [NAME_ADMIN, NAME_ASIST])}
DELETE FROM permisos_delegados d USING profiles p
WHERE (d.usuario_asistente_id = p.id OR d.otorgado_por = p.id OR d.usuario_delegante_id = p.id)
  AND p.email IN ({q});
DELETE FROM workspace_usuario_permisos_override o USING profiles p WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM usuario_permisos_override o USING profiles p WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM flag_reglas fr USING profiles p WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({q});
DELETE FROM workspace_miembros wm USING profiles p WHERE wm.usuario_id = p.id AND p.email IN ({q});
DELETE FROM empresa_miembros em USING profiles p WHERE em.usuario_id = p.id AND p.email IN ({q});
UPDATE profiles SET role_id = NULL, workspace_activo_id = NULL, is_super_admin = false WHERE email IN ({q});
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({q});
DELETE FROM auth.users WHERE email IN ({q});
DELETE FROM profiles WHERE email IN ({q});
SET session_replication_role = origin;
""",
    )


def leftover(client, db):
    q = ", ".join(f"'{e}'" for e in EMAILS)
    raw = psql(
        client,
        db,
        f"""
SELECT 'profiles', COUNT(*) FROM profiles WHERE email IN ({q});
SELECT 'auth.users', COUNT(*) FROM auth.users WHERE email IN ({q});
SELECT 'wm', COUNT(*) FROM workspace_miembros wm JOIN profiles p ON p.id = wm.usuario_id WHERE p.email IN ({q});
{sql_leftover_qa_personal_workspaces(EMAILS, [NAME_ADMIN, NAME_ASIST])}
""",
    )
    counts = {}
    for line in raw.splitlines():
        if "|" in line:
            k, v = line.strip().split("|", 1)
            counts[k] = v
    return counts


def rpc_keys(client, db, uid, sala_id):
    raw = psql(
        client,
        db,
        f"""
SELECT coalesce(array_to_json(public.effective_workspace_permissions('{uid}'::uuid, '{sala_id}'::uuid)), '[]'::json)
FROM (
  SELECT
    set_config('request.jwt.claim.role', 'service_role', true),
    set_config('request.jwt.claims', '{{"role":"service_role"}}', true)
) s;
""",
    )
    line = last_line(raw)
    try:
        keys = json.loads(line)
    except json.JSONDecodeError:
        keys = []
    return keys if isinstance(keys, list) else []


def classify(keys, admin_catalog=None):
    s = set(keys or [])
    catalog = list(admin_catalog or ADMIN_PROBE)
    admin_hits = sorted(k for k in catalog if k in s)
    return {
        "n": len(s),
        "admin_hits": admin_hits,
        "app_missing": [k for k in APP_PROBE if k not in s],
        "has_any_admin_probe": bool(admin_hits),
    }


def load_capa_keys(client, db, capa):
    raw = psql(
        client,
        db,
        f"SELECT coalesce(json_agg(clave ORDER BY clave), '[]'::json) FROM public.permisos WHERE capa = '{capa}';",
    )
    try:
        keys = json.loads(last_line(raw) or "[]")
    except json.JSONDecodeError:
        keys = []
    return keys if isinstance(keys, list) else []


def load_capa_admin_keys(client, db):
    return load_capa_keys(client, db, "admin")


def missing_app_keys(client, db, granted):
    catalog = load_capa_keys(client, db, "app")
    have = set(granted or [])
    return [k for k in catalog if k not in have]


def real_rh_empresa_admin_id(client, db):
    return last_line(
        psql(
            client,
            db,
            f"""
SELECT em.usuario_id::text
FROM public.empresa_miembros em
JOIN public.profiles p ON p.id = em.usuario_id
WHERE em.empresa_id = '{RH_ID}'
  AND em.es_admin = true
  AND em.estado = 'activo'
  AND coalesce(p.is_super_admin, false) = false
  AND coalesce(p.email, '') NOT ILIKE '%saletse-test.com'
ORDER BY em.fecha_union NULLS LAST
LIMIT 1;
""",
        )
    )


def setup_qa(client, db, uid_admin, uid_asist):
    psql(client, db, f"SELECT public.ensure_personal_workspace('{uid_admin}');")
    psql(client, db, f"SELECT public.ensure_personal_workspace('{uid_asist}');")
    psql(
        client,
        db,
        f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid_admin}', true, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = true, estado = 'activo';
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid_asist}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false, estado = 'activo';
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_admin}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_asist}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;
UPDATE profiles
SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true, full_name = '{NAME_ADMIN}'
WHERE id = '{uid_admin}';
UPDATE profiles
SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true, full_name = '{NAME_ASIST}'
WHERE id = '{uid_asist}';
DELETE FROM flag_reglas
WHERE alcance = 'usuario' AND alcance_id IN ('{uid_admin}', '{uid_asist}');
INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
SELECT f.id, 'usuario', '{uid_admin}', true
FROM flags f
WHERE f.clave IN (
  'worksheet',
  'worksheet.royal_holiday',
  'worksheet.royal_holiday.money_box',
  'rh.tool.bottom_lines',
  'rh.tool.comisiones',
  'rh.tool.calendario_comisiones',
  'rh.tool.creditos'
)
AND (f.empresa_id = '{RH_ID}' OR (f.clave = 'worksheet' AND f.empresa_id IS NULL));
""",
    )


def session_keys(payload):
    if not isinstance(payload, dict):
        return []
    profile = payload.get("profile") or {}
    keys = payload.get("permission_keys") or profile.get("permission_keys") or []
    return keys if isinstance(keys, list) else []


def smoke_target(client, label, passwords, uid_admin, uid_asist):
    cfg = TARGETS[label]
    db, api, env_file = cfg["db"], cfg["api"], cfg["env_file"]
    checks = {}
    print(f"\n=== SMOKE {label} @ {api} ===")
    admin_catalog = load_capa_admin_keys(client, db)

    keys = rpc_keys(client, db, uid_admin, SALA_RH_ID)
    info = classify(keys, admin_catalog)
    app_gap = missing_app_keys(client, db, keys)
    rec(
        checks,
        "rpc_empresa_admin_no_capa_admin",
        (not info["has_any_admin_probe"]) and (not info["app_missing"]) and (not app_gap),
        f"n={info['n']} admin_hits={info['admin_hits']} app_missing={info['app_missing']} catalog_app_gap={app_gap}",
    )

    real_id = real_rh_empresa_admin_id(client, db)
    if real_id:
        real_keys = rpc_keys(client, db, real_id, SALA_RH_ID)
        real_info = classify(real_keys, admin_catalog)
        real_gap = missing_app_keys(client, db, real_keys)
        rec(
            checks,
            "rpc_admin_rh_real_no_capa_admin",
            (not real_info["has_any_admin_probe"]) and (not real_gap),
            f"uid={real_id} n={real_info['n']} admin_hits={real_info['admin_hits']} catalog_app_gap={real_gap}",
        )
    else:
        rec(checks, "rpc_admin_rh_real_no_capa_admin", False, "sin admin RH real (no-super, no-QA)")

    super_id = last_line(
        psql(client, db, "SELECT id FROM profiles WHERE is_super_admin = true LIMIT 1;")
    )
    super_keys = rpc_keys(client, db, super_id, SALA_RH_ID) if super_id else []
    super_info = classify(super_keys, admin_catalog)
    rec(
        checks,
        "rpc_superadmin_keeps_capa_admin",
        super_info["has_any_admin_probe"] and "ver_logs" in set(super_keys),
        f"n={super_info['n']} admin_hits={super_info['admin_hits'][:8]}",
    )

    tok = login_token(client, env_file, EMAIL_ADMIN, passwords["admin"])
    rec(checks, "login_empresa_admin", bool(tok), "password-grant")

    sess = remote_http(client, "GET", f"{api}/api/v1/auth/session", tok)
    skeys = session_keys(sess.get("json") or {})
    sinfo = classify(skeys, admin_catalog)
    rec(
        checks,
        "session_no_capa_admin",
        sess.get("status") == 200 and (not sinfo["has_any_admin_probe"]) and (not sinfo["app_missing"]),
        f"HTTP {sess.get('status')} n={sinfo['n']} admin_hits={sinfo['admin_hits']} app_missing={sinfo['app_missing']}",
    )
    flags = ((sess.get("json") or {}).get("profile") or {}).get("flags") or (sess.get("json") or {}).get("flags") or {}
    rec(
        checks,
        "flags_worksheet_money_box",
        sess.get("status") == 200
        and flags.get("worksheet") is True
        and flags.get("worksheet.royal_holiday") is not False
        and flags.get("worksheet.royal_holiday.money_box") is not False,
        f"worksheet={flags.get('worksheet')} rh={flags.get('worksheet.royal_holiday')} money_box={flags.get('worksheet.royal_holiday.money_box')}",
    )
    if real_id:
        flag_sql = last_line(
            psql(
                client,
                db,
                f"""
SELECT json_build_object(
  'worksheet', public.resolver_workspace_flag('worksheet', '{real_id}'::uuid, '{SALA_RH_ID}'::uuid),
  'rh', public.resolver_workspace_flag('worksheet.royal_holiday', '{real_id}'::uuid, '{SALA_RH_ID}'::uuid),
  'money_box', public.resolver_workspace_flag('worksheet.royal_holiday.money_box', '{real_id}'::uuid, '{SALA_RH_ID}'::uuid)
)
FROM (
  SELECT
    set_config('request.jwt.claim.role', 'service_role', true),
    set_config('request.jwt.claims', '{{"role":"service_role"}}', true)
) s;
""",
            )
        )
        try:
            flag_real = json.loads(flag_sql)
        except json.JSONDecodeError:
            flag_real = {}
        rec(
            checks,
            "flags_rh_admin_real_sql",
            flag_real.get("worksheet") is True,
            str(flag_real) + " (money_box/rh son flags, no permission_keys)",
        )

    prospects = remote_http(client, "GET", f"{api}/api/v1/prospects?limit=5", tok)
    rec(
        checks,
        "crm_list_prospects",
        prospects.get("status") == 200,
        f"HTTP {prospects.get('status')}",
    )
    sales = remote_http(client, "GET", f"{api}/api/v1/sales?limit=5", tok)
    rec(
        checks,
        "crm_list_sales",
        sales.get("status") == 200,
        f"HTTP {sales.get('status')}",
    )
    worksheet = remote_http(client, "GET", f"{api}/api/v1/tool-calculations?tool=worksheet", tok)
    rec(
        checks,
        "crm_worksheet_tool",
        worksheet.get("status") == 200,
        f"HTTP {worksheet.get('status')}",
    )
    roles = remote_http(client, "GET", f"{api}/api/v1/admin/tenant/empresas/{RH_ID}/roles", tok)
    rec(
        checks,
        "crm_list_tenant_roles",
        roles.get("status") == 200,
        f"HTTP {roles.get('status')}",
    )
    catalogo = remote_http(client, "GET", f"{api}/api/v1/royal-holiday/{RH_ID}/catalogo", tok)
    rec(
        checks,
        "crm_rh_catalogo",
        catalogo.get("status") == 200,
        f"HTTP {catalogo.get('status')}",
    )
    mb = remote_http(client, "GET", f"{api}/api/v1/royal-holiday/{RH_ID}/money-box-config", tok)
    rec(
        checks,
        "crm_rh_money_box_config",
        mb.get("status") in (200, 403),
        f"HTTP {mb.get('status')}",
    )

    techo_emp = remote_http(
        client, "GET", f"{api}/api/v1/admin/tenant/empresas/{RH_ID}/delegacion/techo", tok
    )
    techo_keys = techo_emp.get("json")
    if isinstance(techo_keys, dict):
        techo_keys = techo_keys.get("data") or techo_keys.get("keys") or []
    if not isinstance(techo_keys, list):
        techo_keys = []
    tinfo = classify(techo_keys, admin_catalog)
    rec(
        checks,
        "techo_delegante_empresa_sin_capa_admin",
        techo_emp.get("status") == 200 and (not tinfo["has_any_admin_probe"]) and (not tinfo["app_missing"]),
        f"HTTP {techo_emp.get('status')} n={tinfo['n']} admin_hits={tinfo['admin_hits']} app_missing={tinfo['app_missing']}",
    )

    techo_sala = remote_http(client, "GET", f"{api}/api/v1/workspace/team/delegacion/techo", tok)
    sala_keys = techo_sala.get("json")
    if isinstance(sala_keys, dict):
        sala_keys = sala_keys.get("data") or sala_keys.get("keys") or []
    if not isinstance(sala_keys, list):
        sala_keys = []
    slinfo = classify(sala_keys, admin_catalog)
    rec(
        checks,
        "techo_delegante_sala_sin_capa_admin",
        techo_sala.get("status") == 200 and (not slinfo["has_any_admin_probe"]),
        f"HTTP {techo_sala.get('status')} n={slinfo['n']} admin_hits={slinfo['admin_hits']}",
    )

    deny_admin = remote_http(
        client,
        "PUT",
        f"{api}/api/v1/admin/tenant/empresas/{RH_ID}/delegacion",
        tok,
        {"asistente_id": uid_asist, "permiso_keys": ["ver_logs"]},
    )
    rec(
        checks,
        "delegacion_rechaza_capa_admin",
        deny_admin.get("status") in (400, 403),
        f"HTTP {deny_admin.get('status')} body={str(deny_admin.get('json') or deny_admin.get('text') or '')[:220]}",
    )
    ok_app = remote_http(
        client,
        "PUT",
        f"{api}/api/v1/admin/tenant/empresas/{RH_ID}/delegacion",
        tok,
        {"asistente_id": uid_asist, "permiso_keys": ["expedientes:ver_propios"]},
    )
    rec(
        checks,
        "delegacion_acepta_capa_app",
        ok_app.get("status") in (200, 204),
        f"HTTP {ok_app.get('status')}",
    )

    passed = all(v.get("pass") for v in checks.values())
    print(f"SMOKE {label}={'PASS' if passed else 'FAIL'}")
    return checks, passed, {"rpc": info, "session": sinfo, "techo": tinfo, "super": super_info}


def apply_sql(client, db, label):
    sftp = client.open_sftp()
    sftp.put(str(MIG), "/tmp/0090_empresa_admin_exclude_capa_admin.sql")
    sftp.close()
    out = run(
        client,
        f"docker exec -i {db} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "
        "< /tmp/0090_empresa_admin_exclude_capa_admin.sql",
        timeout=120,
    )
    print(f"=== SQL {label} ===")
    print(out[-1500:])
    return out


def upload_api(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-capa-admin-{stamp}"
    run(client, f"mkdir -p {backup}")
    sftp = client.open_sftp()
    for rel in API_FILES:
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        run(client, f"cp -a {remote} {backup}/")
        sftp.put(str(ROOT / rel), remote)
        print(f"upload {rel}")
    sftp.close()
    return backup


def restore_api(client, backup):
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
    if not MIG.is_file():
        print(f"Falta {MIG}", file=sys.stderr)
        sys.exit(1)
    env = load_env()
    client = ssh_connect(env)
    report = {"startedAt": utcnow(), "targets": {}}
    passwords = {
        "admin": secrets.token_urlsafe(10) + "Aa1!",
        "asist": secrets.token_urlsafe(10) + "Aa1!",
    }
    backup = None
    try:
        print("=== backup + upload delegacion-service.js ===")
        backup = upload_api(client)
        report["backup"] = backup
        report["uploadAt"] = utcnow()

        print("=== STAGING: snapshot BEFORE + apply 0090 ===")
        purge(client, TARGETS["staging"]["db"])
        uid_a = ensure_auth_user(
            client, TARGETS["staging"]["env_file"], EMAIL_ADMIN, NAME_ADMIN, passwords["admin"]
        )
        uid_b = ensure_auth_user(
            client, TARGETS["staging"]["env_file"], EMAIL_ASIST, NAME_ASIST, passwords["asist"]
        )
        setup_qa(client, TARGETS["staging"]["db"], uid_a, uid_b)
        admin_catalog_stg = load_capa_admin_keys(client, TARGETS["staging"]["db"])
        before = classify(rpc_keys(client, TARGETS["staging"]["db"], uid_a, SALA_RH_ID), admin_catalog_stg)
        real_before_id = real_rh_empresa_admin_id(client, TARGETS["staging"]["db"])
        report["stagingBefore"] = {
            **before,
            "realAdminId": real_before_id,
            "realAdminHits": classify(
                rpc_keys(client, TARGETS["staging"]["db"], real_before_id, SALA_RH_ID),
                admin_catalog_stg,
            )["admin_hits"]
            if real_before_id
            else [],
        }
        print(
            f"  BEFORE staging n={before['n']} admin_hits={before['admin_hits']} "
            f"real_admin_hits={report['stagingBefore']['realAdminHits']}"
        )
        apply_sql(client, TARGETS["staging"]["db"], "staging")
        report["stagingSqlAt"] = utcnow()
        restart_api(client, TARGETS["staging"]["pm2"])
        report["stagingRestartAt"] = utcnow()
        checks = {}
        passed = False
        snap = {}
        try:
            checks, passed, snap = smoke_target(client, "staging", passwords, uid_a, uid_b)
        except Exception as ex:
            checks = {"crash": {"pass": False, "detail": str(ex)[:1500]}}
            passed = False
            snap = {}
            print(f"  STAGING exception: {ex}")
        finally:
            print("=== purge staging QA ===")
            try:
                purge(client, TARGETS["staging"]["db"])
                left = leftover(client, TARGETS["staging"]["db"])
                print(f"  leftover staging={left}")
                report.setdefault("targets", {}).setdefault("staging", {})["leftover"] = left
                rec(checks, "leftover_ws_personal_0", str(left.get("ws_personal", "1")) == "0", str(left))
                passed = all(v.get("pass") for v in checks.values())
            except Exception as ex:
                print(f"  WARN purge staging: {ex}")
                rec(checks, "leftover_ws_personal_0", False, str(ex)[:400])
                passed = False
        report["targets"]["staging"] = {
            **report.get("targets", {}).get("staging", {}),
            "checks": checks,
            "pass": passed,
            "snap": snap,
            "finishedAt": utcnow(),
        }
        if not passed:
            print("STAGING SMOKE FAIL — restauro API, NO toco prod SQL/pm2")
            restore_api(client, backup)
            restart_api(client, TARGETS["staging"]["pm2"])
            report["prodDeployed"] = False
            RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
            sys.exit(1)

        print("=== staging PASS — prod SQL + restart ===")
        report["prodDeployStartedAt"] = utcnow()
        apply_sql(client, TARGETS["prod"]["db"], "prod")
        report["prodSqlAt"] = utcnow()
        restart_api(client, TARGETS["prod"]["pm2"])
        report["prodRestartAt"] = utcnow()
        purge(client, TARGETS["prod"]["db"])
        uid_pa = ensure_auth_user(
            client, TARGETS["prod"]["env_file"], EMAIL_ADMIN, NAME_ADMIN, passwords["admin"]
        )
        uid_pb = ensure_auth_user(
            client, TARGETS["prod"]["env_file"], EMAIL_ASIST, NAME_ASIST, passwords["asist"]
        )
        setup_qa(client, TARGETS["prod"]["db"], uid_pa, uid_pb)
        pchecks = {}
        ppassed = False
        psnap = {}
        try:
            pchecks, ppassed, psnap = smoke_target(client, "prod", passwords, uid_pa, uid_pb)
        except Exception as ex:
            pchecks = {"crash": {"pass": False, "detail": str(ex)[:1500]}}
            ppassed = False
            psnap = {}
            print(f"  PROD exception: {ex}")
        finally:
            print("=== purge prod QA ===")
            try:
                purge(client, TARGETS["prod"]["db"])
                left = leftover(client, TARGETS["prod"]["db"])
                print(f"  leftover prod={left}")
                report.setdefault("targets", {}).setdefault("prod", {})["leftover"] = left
                rec(pchecks, "leftover_ws_personal_0", str(left.get("ws_personal", "1")) == "0", str(left))
                ppassed = all(v.get("pass") for v in pchecks.values())
            except Exception as ex:
                print(f"  WARN purge prod: {ex}")
                rec(pchecks, "leftover_ws_personal_0", False, str(ex)[:400])
                ppassed = False
        report["targets"]["prod"] = {
            **report.get("targets", {}).get("prod", {}),
            "checks": pchecks,
            "pass": ppassed,
            "snap": psnap,
            "finishedAt": utcnow(),
        }
        report["prodDeployed"] = True
        report["finishedAt"] = utcnow()
        RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"\nJSON: {RESULTS}")
        if not ppassed:
            sys.exit(4)
    finally:
        client.close()


if __name__ == "__main__":
    main()
