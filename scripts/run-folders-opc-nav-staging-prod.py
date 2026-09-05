#!/usr/bin/env python3
"""
Carpetas expediente + flujo OPC + sidebar RH compacto.
Staging API smoke con cuentas QA (purga estándar, incluye WS personal).
Prod API + dist web solo si staging PASS.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
DIST = ROOT / "apps" / "web" / "dist"
REMOTE_DIST = f"{REMOTE}/apps/web/dist"
API_FILES = ["apps/api/src/services/workspace-service.js"]
RESULTS = ROOT / "scripts" / ".qa-folders-opc-nav-results.json"

RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"

EMAIL_OPC = "qa-folders-opc@saletse-test.com"
EMAIL_LINER = "qa-folders-liner@saletse-test.com"
EMAIL_CERR = "qa-folders-cerrador@saletse-test.com"
EMAIL_GER = "qa-folders-gerente@saletse-test.com"
EMAIL_MKT = "qa-folders-mkt@saletse-test.com"
EMAILS = [EMAIL_OPC, EMAIL_LINER, EMAIL_CERR, EMAIL_GER, EMAIL_MKT]
NAMES = {
    EMAIL_OPC: "QA Folders OPC",
    EMAIL_LINER: "QA Folders Liner",
    EMAIL_CERR: "QA Folders Cerrador",
    EMAIL_GER: "QA Folders Gerente",
    EMAIL_MKT: "QA Folders Marketing",
}

sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)
from spa_selfhosted_guard import assert_dist_selfhosted  # noqa: E402

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
    names = list(NAMES.values())
    psql(
        client,
        db,
        f"""
SET session_replication_role = replica;
{sql_capture_qa_personal_workspaces(EMAILS, names)}
DELETE FROM rh_premanifiesto WHERE created_by IN (SELECT id FROM profiles WHERE email IN ({q}));
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
{sql_leftover_qa_personal_workspaces(EMAILS, list(NAMES.values()))}
""",
    )
    counts = {}
    for line in raw.splitlines():
        if "|" in line:
            k, v = line.strip().split("|", 1)
            counts[k] = v
    return counts


def setup_membership(client, db, uid, role_slug, gerente=False):
    # Una sola fila gerente por sala (workspace_un_gerente_por_sala). El QA
    # usa slug gerente con rol_en_workspace=vendedor para no chocar.
    # Staging puede no tener opc/marketing sembrados: se crean si faltan.
    psql(client, db, f"SELECT public.ensure_personal_workspace('{uid}');")
    psql(
        client,
        db,
        f"""
INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT '{RH_ID}', 'OPC', 'opc', 'workspace',
       (SELECT id FROM paquetes_acceso WHERE empresa_id = '{RH_ID}' AND slug = 'opc-lobby' LIMIT 1),
       true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE empresa_id = '{RH_ID}' AND slug = 'opc');
INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT '{RH_ID}', 'Marketing', 'marketing', 'workspace',
       (SELECT id FROM paquetes_acceso WHERE empresa_id = '{RH_ID}' AND slug = 'marketing' LIMIT 1),
       true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE empresa_id = '{RH_ID}' AND slug = 'marketing');
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', {str(gerente).lower()}, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = EXCLUDED.es_admin, estado = 'activo';
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{role_slug}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;
UPDATE profiles
SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true
WHERE id = '{uid}';
DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = '{uid}';
INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
SELECT f.id, 'usuario', '{uid}', true
FROM flags f
WHERE f.clave IN (
  'worksheet',
  'worksheet.royal_holiday',
  'worksheet.royal_holiday.money_box',
  'rh.tool.ops',
  'rh.tool.premanifiesto'
)
AND (f.empresa_id = '{RH_ID}' OR (f.clave = 'worksheet' AND f.empresa_id IS NULL));
""",
    )
    extra = []
    if role_slug == "opc":
        extra.append("rh.tool.premanifiesto.opc")
    if role_slug == "marketing":
        extra.append("rh.tool.premanifiesto.marketing")
    if extra:
        keys = ", ".join(f"'{k}'" for k in extra)
        psql(
            client,
            db,
            f"""
INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
SELECT f.id, 'usuario', '{uid}', true
FROM flags f
WHERE f.clave IN ({keys})
AND (f.empresa_id = '{RH_ID}' OR f.empresa_id IS NULL);
""",
        )


def session_payload(client, api, env_file, email, password):
    token = login_token(client, env_file, email, password)
    res = remote_http(client, "GET", f"{api}/api/v1/auth/session", token)
    return res


def upload_api(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-folders-opc-{stamp}"
    run(client, f"mkdir -p {backup}")
    sftp = client.open_sftp()
    for rel in API_FILES:
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        run(client, f"cp -a {remote} {backup}/")
        sftp.put(str(ROOT / rel), remote)
        print(f"upload {rel}")
    sftp.close()
    return backup


def restart_api(client, name):
    try:
        run(client, f"pm2 describe {name} >/dev/null")
        run(client, f"pm2 restart {name} && sleep 3")
    except RuntimeError:
        if name != "saletse-api-staging":
            raise
        run(
            client,
            "cd /var/www/Saletse && pm2 start /opt/saletse-api-staging/listen.mjs "
            "--name saletse-api-staging --cwd /var/www/Saletse --interpreter node && sleep 3",
        )
    port = "4001" if name.endswith("staging") else "4000"
    health = run(client, f"curl -sf http://127.0.0.1:{port}/health")
    compact = health.replace(" ", "")
    if '"ok":true' not in compact:
        logs = run(client, f"pm2 logs {name} --lines 40 --nostream || true")
        raise RuntimeError(f"health {name} fail: {health}\n{logs[-2000:]}")
    return health


def deploy_web(client):
    assert_dist_selfhosted(DIST)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    tar_path = ROOT / f".web-dist-folders-{stamp}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(DIST, arcname="dist")
    backup = f"{BACKUP_ROOT}/web-dist-pre-folders-{stamp}"
    run(client, f"mkdir -p {BACKUP_ROOT}")
    run(client, f"test -d {REMOTE_DIST} && cp -a {REMOTE_DIST} {backup} || echo 'sin dist previo'")
    sftp = client.open_sftp()
    remote_tar = f"/tmp/web-dist-folders-{stamp}.tar.gz"
    sftp.put(str(tar_path), remote_tar)
    sftp.close()
    run(client, f"rm -rf {REMOTE_DIST} && mkdir -p {REMOTE_DIST}")
    run(client, f"tar xzf {remote_tar} -C {REMOTE}/apps/web --strip-components=0")
    run(client, f"rm -f {remote_tar}")
    run(client, f"test -f {REMOTE_DIST}/index.html && echo DIST_OK")
    tar_path.unlink(missing_ok=True)
    return backup


def smoke_target(client, label, target, passwords):
    db = target["db"]
    env_file = target["env_file"]
    api = target["api"]
    checks = {}
    print(f"\n=== SMOKE {label} {utcnow()} ===")
    purge(client, db)

    uids = {}
    for email, slug, gerente in (
        (EMAIL_OPC, "opc", False),
        (EMAIL_LINER, "liner", False),
        (EMAIL_CERR, "cerrador", False),
        (EMAIL_GER, "gerente", True),
        (EMAIL_MKT, "marketing", False),
    ):
        uid = ensure_auth_user(client, env_file, email, NAMES[email], passwords[email])
        uids[email] = uid
        setup_membership(client, db, uid, slug, gerente=gerente)

    cases = [
        (EMAIL_OPC, "opc", False, True),
        (EMAIL_LINER, "liner", False, True),
        (EMAIL_CERR, "cerrador", False, True),
        (EMAIL_GER, "gerente", True, False),
        (EMAIL_MKT, "marketing", False, False),
    ]
    for email, expect_slug, expect_gerente, expect_compact in cases:
        res = session_payload(client, api, env_file, email, passwords[email])
        ok_http = res.get("status") == 200
        payload = res.get("json") or {}
        ws = payload.get("workspace_activo") or {}
        slug = ws.get("role_slug")
        tipo = ws.get("tipo")
        rol = ws.get("rol_en_workspace")
        empresa_id = ws.get("empresa_id")
        in_rh = empresa_id == RH_ID
        compact = (
            tipo == "sala_de_venta"
            and in_rh
            and rol != "gerente"
            and slug != "gerente"
            and slug in ("liner", "cerrador", "opc")
        )
        rec(checks, f"{expect_slug}.http", ok_http, f"status={res.get('status')}")
        rec(checks, f"{expect_slug}.role_slug", slug == expect_slug, f"got={slug}")
        rec(checks, f"{expect_slug}.tipo_sala", tipo == "sala_de_venta", f"tipo={tipo}")
        rec(checks, f"{expect_slug}.empresa_rh", in_rh, f"empresa_id={empresa_id}")
        rec(checks, f"{expect_slug}.compact", compact == expect_compact, f"compact={compact} expected={expect_compact}")

    # Personal workspace: same OPC user should not compact
    psql(
        client,
        db,
        f"""
UPDATE profiles SET workspace_activo_id = (
  SELECT w.id FROM workspaces w
  JOIN workspace_miembros wm ON wm.workspace_id = w.id
  WHERE wm.usuario_id = '{uids[EMAIL_OPC]}' AND w.tipo = 'personal'
  LIMIT 1
) WHERE id = '{uids[EMAIL_OPC]}';
""",
    )
    res = session_payload(client, api, env_file, EMAIL_OPC, passwords[EMAIL_OPC])
    ws = (res.get("json") or {}).get("workspace_activo") or {}
    rec(checks, "opc.personal.no_compact", ws.get("tipo") == "personal", f"tipo={ws.get('tipo')}")

    purge(client, db)
    left = leftover(client, db)
    rec(
        checks,
        "purge.leftover",
        all(str(left.get(k, "1")) == "0" for k in ("profiles", "auth.users", "wm", "ws_personal")),
        str(left),
    )
    return checks


def main():
    if not DIST.is_dir() or not (DIST / "index.html").is_file():
        print(f"Falta build: {DIST}", file=sys.stderr)
        sys.exit(1)
    env = load_env()
    client = ssh_connect(env)
    report = {"startedAt": utcnow(), "targets": {}}
    passwords = {email: secrets.token_urlsafe(10) + "Aa1!" for email in EMAILS}
    try:
        print("=== backup + upload workspace-service.js ===")
        backup = upload_api(client)
        report["backup"] = backup
        report["uploadAt"] = utcnow()

        print("=== STAGING restart ===")
        health = restart_api(client, TARGETS["staging"]["pm2"])
        report["stagingHealthAt"] = utcnow()
        report["stagingHealth"] = health.strip()
        report["targets"]["staging"] = smoke_target(client, "staging", TARGETS["staging"], passwords)
        stg_pass = all(v["pass"] for v in report["targets"]["staging"].values())
        report["stagingPass"] = stg_pass
        report["stagingFinishedAt"] = utcnow()
        if not stg_pass:
            raise RuntimeError("staging FAIL — no se toca prod")

        print("=== PROD API restart ===")
        health = restart_api(client, TARGETS["prod"]["pm2"])
        report["prodHealthAt"] = utcnow()
        report["prodHealth"] = health.strip()
        report["targets"]["prod"] = smoke_target(client, "prod", TARGETS["prod"], passwords)
        prod_pass = all(v["pass"] for v in report["targets"]["prod"].values())
        report["prodApiPass"] = prod_pass
        if not prod_pass:
            raise RuntimeError("prod API FAIL — no se sube dist")

        print("=== WEB dist ===")
        report["webBackup"] = deploy_web(client)
        report["webDeployAt"] = utcnow()
        grep = run(
            client,
            f"grep -R -l 'opc-nuevo' {REMOTE_DIST}/assets/*.js 2>/dev/null | head -5 || true",
        )
        rec(
            report.setdefault("web", {}),
            "opc_chunk",
            "opc-nuevo" in grep or "opc-expediente" in grep,
            grep.strip()[:400] or "sin match",
        )
        report["finishedAt"] = utcnow()
        report["pass"] = stg_pass and prod_pass and report["web"]["opc_chunk"]["pass"]
    except Exception as exc:
        report["error"] = str(exc)
        report["finishedAt"] = utcnow()
        report["pass"] = False
        print(f"ERROR: {exc}", file=sys.stderr)
    finally:
        RESULTS.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nWrote {RESULTS}")
        client.close()
    sys.exit(0 if report.get("pass") else 1)


if __name__ == "__main__":
    main()
