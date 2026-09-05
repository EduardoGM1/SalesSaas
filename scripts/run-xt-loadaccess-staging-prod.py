#!/usr/bin/env python3
"""
Punto 1 (nginx + stub ESM) + punto 3 (cross-tenant 2 salas) + punto 4 (loadAccess).
Staging API smoke ANTES de reiniciar prod. Limpieza incluye el workspace.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
RESULTS = ROOT / "scripts" / ".qa-xt-loadaccess-results.json"
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
)
API_FILES = ["apps/api/src/services/prospect-participants-service.js"]
DIST = "/var/www/Saletse/apps/web/dist"
RETIRED = "index-DS5s4Hkv.js"

EMAIL_A = "qa-xt-sala-a@saletse-test.com"
EMAIL_B = "qa-xt-sala-b@saletse-test.com"
EMAILS = [EMAIL_A, EMAIL_B]
NAME_A = "QA XT Sala A"
NAME_B = "QA XT Sala B"
EMPRESA_NOMBRE = "QA XT Audit Empresa"
SALA_NOMBRE = "QA XT Audit Sala"
SECRET_A = "XT-A-SECRET-prospect"
SECRET_B = "XT-B-SECRET-prospect"
FAKE_UUID = "00000000-0000-4000-8000-aaaaaaaaaaaa"

ESM_STUB = (
    'console.warn("[pwa] retired entry chunk, recovering");'
    "var go=function(){location.reload();};"
    "var chain=Promise.resolve();"
    'if("serviceWorker" in navigator){'
    "chain=chain.then(function(){return navigator.serviceWorker.getRegistrations();})"
    ".then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});"
    "}"
    'if("caches" in window){'
    "chain=chain.then(function(){return caches.keys();})"
    ".then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});"
    "}"
    "chain.then(go).catch(go);"
    "export {};"
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


def first_uuid(text):
    match = re.search(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        text or "",
    )
    return match.group(0) if match else ""


def dump_body(resp):
    if resp.get("json") is not None:
        return json.dumps(resp.get("json"), ensure_ascii=False)
    return resp.get("text") or ""


def rec(checks, key, passed, detail):
    checks[key] = {"pass": bool(passed), "detail": detail}
    print(f"  [{'PASS' if passed else 'FAIL'}] {key}: {detail}")


def blocked(resp, forbidden_substrings):
    status = resp.get("status")
    body = dump_body(resp) + (resp.get("text") or "")
    leaked = [s for s in forbidden_substrings if s and s in body]
    ok_status = status in (401, 403, 404)
    return ok_status and not leaked, status, leaked, body[:350]


def collect_ids(obj, acc=None):
    acc = acc or set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in {"id", "prospect_id", "sale_id"} and isinstance(v, str) and re.fullmatch(
                r"[0-9a-fA-F-]{36}", v
            ):
                acc.add(v)
            collect_ids(v, acc)
    elif isinstance(obj, list):
        for item in obj:
            collect_ids(item, acc)
    return acc


def ensure_auth_user(client, env_file, email, full_name, password):
    script = f"""
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
print(json.dumps({{"status": status, "json": parsed, "text": raw[:2000]}}))
PY
"""
    return json.loads(last_line(run(client, py, timeout=90)))


def q_emails():
    return ", ".join(f"'{e}'" for e in EMAILS)


def purge(client, db):
    q = q_emails()
    psql(
        client,
        db,
        f"""
SET session_replication_role = replica;
{sql_capture_qa_personal_workspaces(EMAILS, [NAME_A, NAME_B])}
DELETE FROM share_permission_requests r USING profiles p
WHERE (r.owner_id = p.id OR r.requester_id = p.id) AND p.email IN ({q});
DELETE FROM prospect_share_invites i USING profiles p WHERE i.owner_id = p.id AND p.email IN ({q});
DELETE FROM prospect_shares s USING profiles p WHERE (s.owner_id = p.id OR s.shared_with_id = p.id) AND p.email IN ({q});
DELETE FROM direct_messages m USING profiles p WHERE (m.sender_id = p.id OR m.recipient_id = p.id) AND p.email IN ({q});
DELETE FROM user_connections c USING profiles p WHERE (c.requester_id = p.id OR c.addressee_id = p.id) AND p.email IN ({q});
DELETE FROM prospect_workflow_events e USING prospects pr, profiles p
WHERE e.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflow_events e USING profiles p WHERE e.actor_id = p.id AND p.email IN ({q});
DELETE FROM calendar_entries c USING profiles p WHERE c.user_id = p.id AND p.email IN ({q});
DELETE FROM sales s USING profiles p WHERE s.user_id = p.id AND p.email IN ({q});
DELETE FROM activities a USING profiles p WHERE a.user_id = p.id AND p.email IN ({q});
DELETE FROM goals g USING profiles p WHERE g.user_id = p.id AND p.email IN ({q});
DELETE FROM tool_calculations t USING profiles p WHERE t.user_id = p.id AND p.email IN ({q});
DELETE FROM prospect_workflows w USING prospects pr, profiles p
WHERE w.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_messages m USING chat_conversations c, prospects pr, profiles p
WHERE m.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_members cm USING chat_conversations c, prospects pr, profiles p
WHERE cm.conversation_id = c.id AND c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM chat_conversations c USING prospects pr, profiles p
WHERE c.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ({q});
DELETE FROM prospects pr USING profiles p WHERE pr.user_id = p.id AND p.email IN ({q});
DELETE FROM workspace_usuario_permisos_override o USING profiles p WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM usuario_permisos_override o USING profiles p WHERE o.usuario_id = p.id AND p.email IN ({q});
DELETE FROM permisos_delegados d USING profiles p
WHERE (d.usuario_asistente_id = p.id OR d.otorgado_por = p.id OR d.usuario_delegante_id = p.id) AND p.email IN ({q});
DELETE FROM flag_reglas fr USING profiles p WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({q});
DELETE FROM workspace_miembros wm USING profiles p WHERE wm.usuario_id = p.id AND p.email IN ({q});
DELETE FROM empresa_miembros em USING profiles p WHERE em.usuario_id = p.id AND p.email IN ({q});
UPDATE profiles SET role_id = NULL, workspace_activo_id = NULL WHERE email IN ({q});
DELETE FROM workspace_miembros wm USING workspaces w
WHERE wm.workspace_id = w.id AND w.tipo = 'sala_de_venta' AND w.nombre = '{SALA_NOMBRE}';
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM workspaces WHERE tipo = 'sala_de_venta' AND nombre = '{SALA_NOMBRE}';
DELETE FROM rol_permisos rp USING roles r
WHERE rp.rol_id = r.id AND r.empresa_id IN (SELECT id FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}');
DELETE FROM roles WHERE empresa_id IN (SELECT id FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}');
DELETE FROM paquete_flags pf USING paquetes_acceso pa
WHERE pf.paquete_id = pa.id AND pa.empresa_id IN (SELECT id FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}');
DELETE FROM paquetes_acceso WHERE empresa_id IN (SELECT id FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}');
DELETE FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}';
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({q});
DELETE FROM auth.users WHERE email IN ({q});
DELETE FROM profiles WHERE email IN ({q});
SET session_replication_role = origin;
""",
    )


def leftover(client, db):
    q = q_emails()
    raw = psql(
        client,
        db,
        f"""
SELECT 'profiles', COUNT(*) FROM profiles WHERE email IN ({q});
SELECT 'auth.users', COUNT(*) FROM auth.users WHERE email IN ({q});
SELECT 'wm', COUNT(*) FROM workspace_miembros wm JOIN profiles p ON p.id = wm.usuario_id WHERE p.email IN ({q});
SELECT 'ws_personal', COUNT(*) FROM workspaces WHERE tipo = 'personal' AND nombre IN ('{NAME_A}', '{NAME_B}');
SELECT 'ws_sala', COUNT(*) FROM workspaces WHERE tipo = 'sala_de_venta' AND nombre = '{SALA_NOMBRE}';
SELECT 'empresa', COUNT(*) FROM empresas WHERE nombre = '{EMPRESA_NOMBRE}';
""",
    )
    counts = {}
    for line in raw.splitlines():
        if "|" in line:
            k, v = line.strip().split("|", 1)
            counts[k] = v
    return counts


def setup_tenants(client, db, uid_a, uid_b):
    psql(client, db, f"SELECT public.ensure_personal_workspace('{uid_a}');")
    psql(client, db, f"SELECT public.ensure_personal_workspace('{uid_b}');")
    emp_id = first_uuid(
        psql(
            client,
            db,
            f"""
INSERT INTO empresas (nombre, estado, colores_marca)
VALUES ('{EMPRESA_NOMBRE}', 'activa', '{{}}'::jsonb)
RETURNING id;
""",
        )
    )
    sala_id = first_uuid(
        psql(
            client,
            db,
            f"""
INSERT INTO workspaces (tipo, empresa_id, nombre, estado)
VALUES ('sala_de_venta', '{emp_id}', '{SALA_NOMBRE}', 'activo')
RETURNING id;
""",
        )
    )
    psql(
        client,
        db,
        f"""
INSERT INTO paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
SELECT '{emp_id}', pa.nombre, pa.slug, pa.descripcion, true, true
FROM paquetes_acceso pa
WHERE pa.empresa_id = '{RH_ID}' AND pa.slug = 'liner'
LIMIT 1;

INSERT INTO paquete_flags (paquete_id, flag_id, activo)
SELECT np.id, pf.flag_id, pf.activo
FROM paquetes_acceso np
JOIN paquetes_acceso rp ON rp.empresa_id = '{RH_ID}' AND rp.slug = 'liner'
JOIN paquete_flags pf ON pf.paquete_id = rp.id
WHERE np.empresa_id = '{emp_id}' AND np.slug = 'liner'
ON CONFLICT (paquete_id, flag_id) DO NOTHING;

INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT '{emp_id}', r.nombre, r.slug, r.scope, np.id, true
FROM roles r
JOIN paquetes_acceso np ON np.empresa_id = '{emp_id}' AND np.slug = 'liner'
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
LIMIT 1;

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT nr.id, rp.permiso_id
FROM roles nr
JOIN roles rr ON rr.empresa_id = '{RH_ID}' AND rr.slug = 'liner'
JOIN rol_permisos rp ON rp.rol_id = rr.id
WHERE nr.empresa_id = '{emp_id}' AND nr.slug = 'liner'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES
  ('{emp_id}', '{uid_a}', false, 'activo'),
  ('{RH_ID}', '{uid_b}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET estado = 'activo';

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_a}', '{sala_id}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{emp_id}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid_b}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;

UPDATE profiles SET workspace_activo_id = '{sala_id}', is_super_admin = false, is_active = true, full_name = '{NAME_A}'
WHERE id = '{uid_a}';
UPDATE profiles SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true, full_name = '{NAME_B}'
WHERE id = '{uid_b}';
""",
    )
    return emp_id, sala_id


def seed_rows(client, db, uid, ws, prospect_id, secret):
    sale_id = str(uuid4())
    cal_id = str(uuid4())
    act_id = str(uuid4())
    psql(
        client,
        db,
        f"""
INSERT INTO sales (id, user_id, prospect_id, workspace_id, sale_date, vol, tours, status)
VALUES ('{sale_id}', '{uid}', '{prospect_id}', '{ws}', CURRENT_DATE, 1, 1, 'venta');
INSERT INTO calendar_entries (id, user_id, prospect_id, workspace_id, type, entry_date, note)
VALUES ('{cal_id}', '{uid}', '{prospect_id}', '{ws}', 'nota', CURRENT_DATE, '{secret}-cal');
INSERT INTO activities (id, user_id, prospect_id, workspace_id, type, title, note, activity_date)
VALUES ('{act_id}', '{uid}', '{prospect_id}', '{ws}', 'nota', '{secret}-act', '{secret}-act', CURRENT_DATE);
INSERT INTO goals (user_id, workspace_id, year, month, vol, tours, ventas, dias)
VALUES ('{uid}', '{ws}', 2026, 7, 1, 1, 1, 1);
""",
    )
    return {"sale": sale_id, "cal": cal_id, "act": act_id}


def smoke_target(client, target_name, passwords):
    cfg = TARGETS[target_name]
    db = cfg["db"]
    api = cfg["api"]
    checks = {}
    print(f"\n=== SMOKE {target_name} @ {api} ===")
    purge(client, db)

    uid_a = ensure_auth_user(client, cfg["env_file"], EMAIL_A, NAME_A, passwords["a"])
    uid_b = ensure_auth_user(client, cfg["env_file"], EMAIL_B, NAME_B, passwords["b"])
    emp_id, sala_a = setup_tenants(client, db, uid_a, uid_b)
    rec(checks, "tenants_created", bool(emp_id and sala_a), f"empresa={emp_id} sala_a={sala_a}")

    tok_a = login_token(client, cfg["env_file"], EMAIL_A, passwords["a"])
    tok_b = login_token(client, cfg["env_file"], EMAIL_B, passwords["b"])
    rec(checks, "login_a", bool(tok_a), "password-grant A")
    rec(checks, "login_b", bool(tok_b), "password-grant B")

    created_a = remote_http(client, "POST", f"{api}/api/v1/prospects", tok_a, {"name": SECRET_A, "name1": SECRET_A, "status": "activo"})
    created_b = remote_http(client, "POST", f"{api}/api/v1/prospects", tok_b, {"name": SECRET_B, "name1": SECRET_B, "status": "activo"})
    pid_a = (created_a.get("json") or {}).get("data", {}).get("id") or (created_a.get("json") or {}).get("id")
    pid_b = (created_b.get("json") or {}).get("data", {}).get("id") or (created_b.get("json") or {}).get("id")
    rec(checks, "create_a", created_a.get("status") in (200, 201) and bool(pid_a), f"A HTTP {created_a.get('status')} {pid_a}")
    rec(checks, "create_b", created_b.get("status") in (200, 201) and bool(pid_b), f"B HTTP {created_b.get('status')} {pid_b}")
    if not (pid_a and pid_b):
        return checks, False

    rows_a = seed_rows(client, db, uid_a, sala_a, pid_a, SECRET_A)
    rows_b = seed_rows(client, db, uid_b, SALA_RH_ID, pid_b, SECRET_B)

    missing = remote_http(client, "GET", f"{api}/api/v1/prospects/{FAKE_UUID}/participants", tok_a)
    rec(
        checks,
        "p4_missing_uuid_403",
        missing.get("status") == 403 and (missing.get("json") or {}).get("error") == "No puedes acceder a este expediente.",
        f"GET fake participants HTTP {missing.get('status')} {dump_body(missing)[:200]}",
    )
    own_part = remote_http(client, "GET", f"{api}/api/v1/prospects/{pid_a}/participants", tok_a)
    rec(checks, "p4_own_participants_ok", own_part.get("status") == 200, f"GET own participants HTTP {own_part.get('status')}")
    other_part = remote_http(client, "GET", f"{api}/api/v1/prospects/{pid_b}/participants", tok_a)
    ok_p, st_p, leak_p, body_p = blocked(other_part, [SECRET_B])
    rec(checks, "p4_foreign_participants_denied", ok_p and other_part.get("status") == 403, f"HTTP {st_p} leaked={leak_p} {body_p}")

    pairs = [
        ("prospects", f"/api/v1/prospects/{pid_b}", f"/api/v1/prospects/{pid_a}", SECRET_B, SECRET_A),
        ("sales", f"/api/v1/sales/{rows_b['sale']}", f"/api/v1/sales/{rows_a['sale']}", SECRET_B, SECRET_A),
        ("calendar", f"/api/v1/calendar-entries/{rows_b['cal']}", f"/api/v1/calendar-entries/{rows_a['cal']}", f"{SECRET_B}-cal", f"{SECRET_A}-cal"),
        ("activities", f"/api/v1/activities/{rows_b['act']}", f"/api/v1/activities/{rows_a['act']}", f"{SECRET_B}-act", f"{SECRET_A}-act"),
    ]
    n = 0
    for name, url_b_for_a, url_a_for_b, secret_b, secret_a in pairs:
        ra = remote_http(client, "GET", api + url_b_for_a, tok_a)
        ok, st, leaked, body = blocked(ra, [secret_b])
        rec(checks, f"xt_a_get_{name}_of_b", ok, f"A→B {name} HTTP {st} leaked={leaked} {body}")
        n += 1
        rb = remote_http(client, "GET", api + url_a_for_b, tok_b)
        ok, st, leaked, body = blocked(rb, [secret_a])
        rec(checks, f"xt_b_get_{name}_of_a", ok, f"B→A {name} HTTP {st} leaked={leaked} {body}")
        n += 1

    for label, tok, own_id, foreign_id, foreign_secret, list_path in (
        ("a", tok_a, pid_a, pid_b, SECRET_B, "/api/v1/prospects?limit=50"),
        ("b", tok_b, pid_b, pid_a, SECRET_A, "/api/v1/prospects?limit=50"),
    ):
        listed = remote_http(client, "GET", api + list_path, tok)
        own_get = remote_http(client, "GET", f"{api}/api/v1/prospects/{own_id}", tok)
        ids = collect_ids(listed.get("json"))
        rec(
            checks,
            f"xt_{label}_list_prospects",
            listed.get("status") == 200
            and foreign_id not in ids
            and foreign_secret not in dump_body(listed)
            and own_get.get("status") == 200,
            f"list HTTP {listed.get('status')} foreign_in={foreign_id in ids} "
            f"own GET HTTP {own_get.get('status')} body_keys={list((listed.get('json') or {{}}).keys()) if isinstance(listed.get('json'), dict) else type(listed.get('json'))}",
        )

    for label, tok, list_path, foreign_id, secret in (
        ("a", tok_a, "/api/v1/sales?limit=50", rows_b["sale"], SECRET_B),
        ("b", tok_b, "/api/v1/sales?limit=50", rows_a["sale"], SECRET_A),
        ("a", tok_a, "/api/v1/calendar-entries?limit=50", rows_b["cal"], f"{SECRET_B}-cal"),
        ("b", tok_b, "/api/v1/calendar-entries?limit=50", rows_a["cal"], f"{SECRET_A}-cal"),
        ("a", tok_a, "/api/v1/activities?limit=50", rows_b["act"], f"{SECRET_B}-act"),
        ("b", tok_b, "/api/v1/activities?limit=50", rows_a["act"], f"{SECRET_A}-act"),
        ("a", tok_a, "/api/v1/goals", None, SECRET_B),
        ("b", tok_b, "/api/v1/goals", None, SECRET_A),
    ):
        listed = remote_http(client, "GET", api + list_path, tok)
        ids = collect_ids(listed.get("json"))
        leaked = secret in dump_body(listed)
        foreign_ok = (foreign_id is None) or (foreign_id not in ids)
        rec(
            checks,
            f"xt_{label}_list_{list_path.split('/')[3].split('?')[0]}",
            listed.get("status") == 200 and foreign_ok and not leaked,
            f"HTTP {listed.get('status')} foreign_in={not foreign_ok} leaked={leaked}",
        )
        n += 1

    sync_a = remote_http(client, "GET", f"{api}/api/v1/sync", tok_a)
    sync_b = remote_http(client, "GET", f"{api}/api/v1/sync", tok_b)
    ids_sa = collect_ids(sync_a.get("json"))
    ids_sb = collect_ids(sync_b.get("json"))
    rec(
        checks,
        "xt_a_sync_no_b",
        sync_a.get("status") == 200 and pid_b not in ids_sa and SECRET_B not in dump_body(sync_a),
        f"sync A HTTP {sync_a.get('status')} has_b={pid_b in ids_sa}",
    )
    rec(
        checks,
        "xt_b_sync_no_a",
        sync_b.get("status") == 200 and pid_a not in ids_sb and SECRET_A not in dump_body(sync_b),
        f"sync B HTTP {sync_b.get('status')} has_a={pid_a in ids_sb}",
    )

    patch_a = remote_http(client, "PATCH", f"{api}/api/v1/prospects/{pid_b}", tok_a, {"name1": "HACKED"})
    ok, st, leaked, body = blocked(patch_a, [SECRET_B])
    rec(checks, "xt_a_patch_b", ok, f"PATCH A→B HTTP {st} leaked={leaked} {body}")
    patch_b = remote_http(client, "PATCH", f"{api}/api/v1/prospects/{pid_a}", tok_b, {"name1": "HACKED"})
    ok, st, leaked, body = blocked(patch_b, [SECRET_A])
    rec(checks, "xt_b_patch_a", ok, f"PATCH B→A HTTP {st} leaked={leaked} {body}")

    name_a = last_line(psql(client, db, f"SELECT name1 FROM prospects WHERE id = '{pid_a}';"))
    name_b = last_line(psql(client, db, f"SELECT name1 FROM prospects WHERE id = '{pid_b}';"))
    rec(checks, "xt_no_write_cross", name_a == SECRET_A and name_b == SECRET_B, f"db A='{name_a}' B='{name_b}'")

    required = [k for k in checks if k.startswith("xt_") or k.startswith("p4_")]
    passed = all(checks.get(k, {}).get("pass") for k in required)
    print(f"  request-like checks={len(required)} SMOKE {target_name}={'PASS' if passed else 'FAIL'}")
    return checks, passed


def apply_punto1(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run(client, f"cp -a /etc/nginx/sites-enabled/saletse {BACKUP_ROOT}/nginx-saletse-{stamp}")
    sftp = client.open_sftp()
    sftp.put(str(ROOT / "deploy" / "nginx-saletse.conf"), "/etc/nginx/sites-enabled/saletse")
    with sftp.file(f"{DIST}/assets/{RETIRED}", "w") as fh:
        fh.write(ESM_STUB)
    sftp.close()
    run(client, "nginx -t && systemctl reload nginx")
    headers = run(
        client,
        f"curl -sS -D - -o /tmp/_ret.js -H 'Host: 187.77.14.148' http://127.0.0.1/assets/{RETIRED} | head -20; "
        "echo '--- body ---'; cat /tmp/_ret.js; echo; "
        "echo '--- index ---'; curl -sS http://127.0.0.1/index.html | grep -oE 'assets/index-[A-Za-z0-9_-]+\\.js' | head -1; "
        f"echo '--- build-id ---'; curl -sS http://127.0.0.1/build-id.txt; "
        f"echo '--- cloud in live js ---'; grep -l '{RETIRED.replace('index-','')}' {DIST}/index.html || echo index_ok_not_retired; "
        f"grep -c 'ihuyisrplbmgxnvkpifm' {DIST}/assets/index-Dfh6D8Np.js || true",
    )
    return stamp, headers


def upload_api(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-loadaccess-{stamp}"
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
    env = load_env()
    client = ssh_connect(env)
    report = {"startedAt": utcnow(), "targets": {}}
    passwords = {"a": secrets.token_urlsafe(10) + "Aa1!", "b": secrets.token_urlsafe(10) + "Aa1!"}
    backup = None
    rc = 1
    try:
        print("=== PUNTO 1: nginx no-store + stub ESM (sin rebuild SPA) ===")
        nginx_stamp, headers = apply_punto1(client)
        report["punto1"] = {
            "nginxBackup": f"{BACKUP_ROOT}/nginx-saletse-{nginx_stamp}",
            "appliedAt": utcnow(),
            "curl": headers[-4000:],
        }
        stub_ok = "export {}" in headers and "no-store" in headers.lower()
        report["punto1"]["pass"] = stub_ok
        print(headers[-2500:])
        if not stub_ok:
            print("WARN punto1 curl no confirmó no-store+export+Dfh6D8Np — sigo, revisar headers")

        print("=== backup + upload API (loadAccess) ===")
        backup = upload_api(client)
        report["backup"] = backup
        report["uploadAt"] = utcnow()

        print("=== restart STAGING only ===")
        restart_api(client, "saletse-api-staging")
        report["stagingRestartAt"] = utcnow()
        try:
            checks, passed = smoke_target(client, "staging", passwords)
        except Exception as ex:
            checks = {"crash": {"pass": False, "detail": str(ex)[:1500]}}
            passed = False
            print(f"  STAGING exception: {ex}")
        finally:
            print("=== purge staging QA (incluye workspace/empresa) ===")
            try:
                purge(client, TARGETS["staging"]["db"])
                left = leftover(client, TARGETS["staging"]["db"])
                print(f"  leftover staging={left}")
                report.setdefault("targets", {}).setdefault("staging", {})["leftover"] = left
            except Exception as ex:
                print(f"  WARN purge staging: {ex}")
        report["targets"]["staging"] = {
            **report.get("targets", {}).get("staging", {}),
            "checks": checks,
            "pass": passed,
            "finishedAt": utcnow(),
        }
        if not passed:
            print("STAGING SMOKE FAIL — restauro API y NO reinicio prod")
            restore_api(client, backup)
            report["prodDeployed"] = False
            RESULTS.write_text(json.dumps(report, indent=2), encoding="utf-8")
            sys.exit(1)

        print("=== staging PASS — ahora sí prod ===")
        report["prodDeployStartedAt"] = utcnow()
        restart_api(client, "saletse-api")
        report["prodRestartAt"] = utcnow()
        try:
            pchecks, ppassed = smoke_target(client, "prod", passwords)
        except Exception as ex:
            pchecks = {"crash": {"pass": False, "detail": str(ex)[:1500]}}
            ppassed = False
            print(f"  PROD exception: {ex}")
        finally:
            print("=== purge prod QA (incluye workspace/empresa) ===")
            try:
                purge(client, TARGETS["prod"]["db"])
                left = leftover(client, TARGETS["prod"]["db"])
                print(f"  leftover prod={left}")
                report.setdefault("targets", {}).setdefault("prod", {})["leftover"] = left
            except Exception as ex:
                print(f"  WARN purge prod: {ex}")
                ppassed = False
        report["targets"]["prod"] = {
            **report.get("targets", {}).get("prod", {}),
            "checks": pchecks,
            "pass": ppassed,
            "finishedAt": utcnow(),
        }
        report["prodDeployed"] = True
        rc = 0 if ppassed else 1
        if not ppassed:
            restore_api(client, backup)
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
