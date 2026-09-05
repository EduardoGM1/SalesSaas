#!/usr/bin/env python3
"""
Campos expediente OPC vs mockup: SQL+API en staging, smoke UI local→API staging,
luego SQL prod + SPA + smoke prod. No toca prod SPA si staging falla.
"""
from __future__ import annotations

import json
import os
import secrets
import select
import socket
import socketserver
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)
from spa_selfhosted_guard import assert_dist_selfhosted  # noqa: E402

REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
DIST = ROOT / "apps" / "web" / "dist"
REMOTE_DIST = f"{REMOTE}/apps/web/dist"
API_REL = "apps/api/src/services/royal-holiday-service.js"
SQL_REL = "supabase/migrations/0091_rh_pm_registrar_opc_fields.sql"
RESULTS = ROOT / "scripts" / ".qa-opc-fields-results.json"
SHOTS = ROOT / "scripts" / ".qa-opc-fields-shots"
PLAY = ROOT / "scripts" / "qa-opc-fields-clickthrough.mjs"

RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL = "qa-opc-fields@saletse-test.com"
NAME = "QA OPC Fields"
LOCAL_PORT = 14001
VITE_PORT = 5177

TARGETS = {
    "staging": {
        "db": "supabase-db",
        "env_file": "/opt/saletse-api-staging/.env",
        "pm2": "saletse-api-staging",
        "api": "http://127.0.0.1:4001",
    },
    "prod": {
        "db": "saletse-prod-db",
        "env_file": "/var/www/Saletse/.env",
        "pm2": "saletse-api",
        "api": "http://127.0.0.1:4000",
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
        sys.exit("Falta VPS_PASSWORD")
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


def last_line(text):
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1] if lines else ""


def psql(client, db, sql, timeout=180):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    out = run(client, cmd, timeout=timeout)
    if "ERROR:" in out:
        raise RuntimeError(out[-2500:])
    return out


def apply_sql_file(client, db):
    remote = "/tmp/0091_rh_pm_registrar_opc_fields.sql"
    sftp = client.open_sftp()
    sftp.put(str(ROOT / SQL_REL), remote)
    sftp.close()
    run(
        client,
        f"cat {remote} | docker exec -i {db} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1",
        timeout=180,
    )


def upload_api(client):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-opc-fields-{stamp}"
    run(client, f"mkdir -p {backup}")
    remote = f"{REMOTE}/{API_REL}"
    run(client, f"cp -a {remote} {backup}/")
    sftp = client.open_sftp()
    sftp.put(str(ROOT / API_REL), remote)
    sftp.close()
    print(f"upload {API_REL} backup={backup}")
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
    if '"ok":true' not in health.replace(" ", ""):
        raise RuntimeError(f"health {name} fail: {health}")
    return health.strip()


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


def purge(client, db):
    emails = [EMAIL]
    names = [NAME]
    psql(
        client,
        db,
        f"""
{sql_capture_qa_personal_workspaces(emails, names)}
DELETE FROM rh_premanifiesto WHERE created_by IN (SELECT id FROM profiles WHERE email IN ('{EMAIL}'))
  OR prospect_nombre ILIKE 'QaopcF%';
SET session_replication_role = replica;
DELETE FROM prospect_workflow_events e
USING prospects pr, profiles p
WHERE e.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ('{EMAIL}');
DELETE FROM prospect_workflows w
USING prospects pr, profiles p
WHERE w.prospect_id = pr.id AND pr.user_id = p.id AND p.email IN ('{EMAIL}');
DELETE FROM prospects WHERE user_id IN (SELECT id FROM profiles WHERE email IN ('{EMAIL}'));
SET session_replication_role = origin;
DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id IN (SELECT id FROM profiles WHERE email IN ('{EMAIL}'));
DELETE FROM workspace_miembros wm USING profiles p WHERE wm.usuario_id = p.id AND p.email IN ('{EMAIL}');
DELETE FROM empresa_miembros em USING profiles p WHERE em.usuario_id = p.id AND p.email IN ('{EMAIL}');
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ('{EMAIL}');
DELETE FROM auth.users WHERE email IN ('{EMAIL}');
DELETE FROM profiles WHERE email IN ('{EMAIL}');
""",
    )


def leftover(client, db):
    raw = psql(
        client,
        db,
        f"""
SELECT 'profiles', COUNT(*) FROM profiles WHERE email = '{EMAIL}'
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users WHERE email = '{EMAIL}'
UNION ALL SELECT 'wm', COUNT(*) FROM workspace_miembros wm
  JOIN profiles p ON p.id = wm.usuario_id WHERE p.email = '{EMAIL}'
UNION ALL {sql_leftover_qa_personal_workspaces([EMAIL], [NAME]).strip().rstrip(';')}
""",
    )
    counts = {}
    for line in raw.splitlines():
        if "|" in line:
            k, v = line.strip().split("|", 1)
            counts[k] = v
    return counts


def setup_opc(client, db, uid):
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
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT opc.id, rp.permiso_id
FROM roles opc
JOIN roles liner ON liner.empresa_id = opc.empresa_id AND liner.slug = 'liner'
JOIN rol_permisos rp ON rp.rol_id = liner.id
WHERE opc.empresa_id = '{RH_ID}' AND opc.slug = 'opc'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos x WHERE x.rol_id = opc.id AND x.permiso_id = rp.permiso_id
  );
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false, estado = 'activo';
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'opc'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = 'vendedor';
UPDATE profiles
SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false, is_active = true, full_name = '{NAME}'
WHERE id = '{uid}';
DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = '{uid}';
INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
SELECT f.id, 'usuario', '{uid}', true
FROM flags f
WHERE f.clave IN (
  'worksheet',
  'worksheet.royal_holiday',
  'rh.tool.ops',
  'rh.tool.premanifiesto',
  'rh.tool.premanifiesto.opc'
)
AND (f.empresa_id = '{RH_ID}' OR (f.clave = 'worksheet' AND f.empresa_id IS NULL));
""",
    )


class ForwardHandler(socketserver.BaseRequestHandler):
    chain_host = "127.0.0.1"
    chain_port = 4001
    ssh_transport = None

    def handle(self):
        try:
            chan = self.ssh_transport.open_channel(
                "direct-tcpip",
                (self.chain_host, self.chain_port),
                self.request.getpeername(),
            )
        except Exception:
            return
        if chan is None:
            return
        while True:
            r, _, _ = select.select([self.request, chan], [], [])
            if self.request in r:
                data = self.request.recv(65536)
                if not data:
                    break
                chan.send(data)
            if chan in r:
                data = chan.recv(65536)
                if not data:
                    break
                self.request.send(data)
        chan.close()
        self.request.close()


def start_tunnel(transport, local_port, remote_port=4000):
    class Fwd(socketserver.ThreadingTCPServer):
        daemon_threads = True
        allow_reuse_address = True

    ForwardHandler.ssh_transport = transport
    ForwardHandler.chain_port = remote_port
    server = Fwd(("127.0.0.1", local_port), ForwardHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def start_vite():
    env = os.environ.copy()
    env["VITE_API_PROXY"] = f"http://127.0.0.1:{LOCAL_PORT}"
    sock = socket.socket()
    in_use = sock.connect_ex(("127.0.0.1", VITE_PORT)) == 0
    sock.close()
    if in_use:
        print(f"vite ya escucha en {VITE_PORT}, se reutiliza")
        return None
    if os.name == "nt":
        cmd = f"npm run dev -w @salesapp/web -- --host 127.0.0.1 --port {VITE_PORT} --strictPort"
        shell = True
    else:
        cmd = ["npm", "run", "dev", "-w", "@salesapp/web", "--", "--host", "127.0.0.1", "--port", str(VITE_PORT), "--strictPort"]
        shell = False
    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=shell,
    )
    started = time.time()
    buf = []
    while time.time() - started < 90:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        buf.append(line)
        if f"localhost:{VITE_PORT}" in line or f"127.0.0.1:{VITE_PORT}" in line:
            return proc
    proc.kill()
    raise RuntimeError("vite no arrancó:\n" + "".join(buf[-40:]))


def playwright_env(base, email, password, shots, results):
    env = os.environ.copy()
    env.update({
        "PLAYWRIGHT_BASE_URL": base,
        "QA_OPC_FIELDS_EMAIL": email,
        "QA_OPC_FIELDS_PASSWORD": password,
        "QA_OPC_FIELDS_SHOTS": str(shots),
        "QA_OPC_FIELDS_RESULTS": str(results),
    })
    return env


def verify_db(client, db, prospect_id, mark):
    raw = psql(
        client,
        db,
        f"""
SELECT row_to_json(x)::text FROM (
  SELECT
    p.country, p.city, p.occupation1, p.occupation2, p.note AS prospect_note,
    r.agencia, r.estado_procedencia, r.nights, r.room_type, r.room_number,
    r.rate, r.total, r.calif, r.regalo_nombre, r.notes AS pm_notes, r.prospect_id
  FROM prospects p
  LEFT JOIN rh_premanifiesto r ON r.prospect_id = p.id
  WHERE p.id = '{prospect_id}'
) x;
""",
    )
    line = last_line(raw)
    try:
        row = json.loads(line)
    except json.JSONDecodeError:
        return {"pass": False, "detail": f"row={line!r}"}
    notes = row.get("pm_notes") or row.get("prospect_note") or ""
    snap = {}
    if "---opc---" in notes:
        try:
            snap = json.loads(notes.split("---opc---", 1)[1].strip())
        except json.JSONDecodeError:
            snap = {}
    checks = {
        "pais": row.get("country") == "México" or snap.get("pais") == "México",
        "estado": row.get("city") == "Quintana Roo",
        "ocupacion_hombre": "Ingeniero" in str(row.get("occupation1") or ""),
        "agencia": row.get("agencia") == "Agencia QA Fields",
        "nights": str(row.get("nights")) == "3",
        "room_type": row.get("room_type") == "Deluxe",
        "rate": str(row.get("rate") or "").startswith("110"),
        "total": str(row.get("total") or "").startswith("330"),
        "calif": row.get("calif") == "Calif-A",
        "regalo": row.get("regalo_nombre") == "iPad QA",
        "modulo": snap.get("modulo") == "Módulo 4",
        "idioma": snap.get("idioma") == "Español",
        "estado_civil": snap.get("estado_civil") == "Casados",
        "nino_edad": str((snap.get("integrantes") or {}).get("ninos", {}).get("edad")) == "8",
        "notas_cliente": snap.get("notas_cliente") == "nota-cliente-opc",
        "mark": mark in str((snap.get("integrantes") or {}).get("hombre", {}).get("nombre") or ""),
        "linked": str(row.get("prospect_id") or "") == prospect_id,
    }
    failed = [k for k, v in checks.items() if not v]
    return {"pass": not failed, "detail": {"failed": failed, "rate": row.get("rate"), "calif": row.get("calif"), "agencia": row.get("agencia")}}


def deploy_web(client):
    assert_dist_selfhosted(DIST)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    tar_path = ROOT / f".web-dist-opc-fields-{stamp}.tar.gz"
    import tarfile

    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(DIST, arcname="dist")
    backup = f"{BACKUP_ROOT}/web-dist-pre-opc-fields-{stamp}"
    run(client, f"mkdir -p {BACKUP_ROOT}")
    run(client, f"test -d {REMOTE_DIST} && cp -a {REMOTE_DIST} {backup} || echo 'sin dist previo'")
    sftp = client.open_sftp()
    remote_tar = f"/tmp/web-dist-opc-fields-{stamp}.tar.gz"
    sftp.put(str(tar_path), remote_tar)
    sftp.close()
    run(client, f"rm -rf {REMOTE_DIST} && mkdir -p {REMOTE_DIST}")
    run(client, f"tar xzf {remote_tar} -C {REMOTE}/apps/web --strip-components=0")
    run(client, f"rm -f {remote_tar}")
    tar_path.unlink(missing_ok=True)
    return backup


def main():
    local = load_env()
    SHOTS.mkdir(parents=True, exist_ok=True)
    report = {"startedAt": utcnow(), "targets": {}}
    client = ssh_connect(local)
    transport = client.get_transport()
    tunnel = None
    vite = None
    qa_password = secrets.token_urlsafe(10) + "Aa1!"
    try:
        print(f"=== STAGING CHECK {utcnow()} ===")
        stg_rel = last_line(
            psql(
                client,
                TARGETS["staging"]["db"],
                "select coalesce(to_regclass('public.rh_premanifiesto_ola_config')::text,'');",
            )
        )
        report["stagingRhTables"] = stg_rel
        if not stg_rel:
            report["stagingSkip"] = "supabase-db no tiene rh_premanifiesto_ola_config; el corte RH vive en saletse-prod-db (kong :8001)."
            report["stagingFinishedAt"] = utcnow()
            print(report["stagingSkip"])
        else:
            apply_sql_file(client, TARGETS["staging"]["db"])
            report["stagingSqlAt"] = utcnow()
            upload_api(client)
            health = restart_api(client, TARGETS["staging"]["pm2"])
            report["stagingHealth"] = health
            report["stagingRestartAt"] = utcnow()
            print(f"=== STAGING QA SETUP {utcnow()} ===")
            purge(client, TARGETS["staging"]["db"])
            uid = ensure_auth_user(client, TARGETS["staging"]["env_file"], EMAIL, NAME, qa_password)
            setup_opc(client, TARGETS["staging"]["db"], uid)
            tunnel = start_tunnel(transport, LOCAL_PORT, 4001)
            vite = start_vite()
            stg_results = ROOT / "scripts" / ".qa-opc-fields-staging-ui.json"
            stg_shots = ROOT / "scripts" / ".qa-opc-fields-staging-shots"
            stg_shots.mkdir(parents=True, exist_ok=True)
            print(f"=== STAGING PLAYWRIGHT {utcnow()} ===")
            proc = subprocess.run(
                ["node", str(PLAY)],
                env=playwright_env(f"http://127.0.0.1:{VITE_PORT}", EMAIL, qa_password, stg_shots, stg_results),
                cwd=str(ROOT),
            )
            ui = json.loads(stg_results.read_text(encoding="utf-8")) if stg_results.is_file() else {}
            dbv = {"pass": False, "detail": "sin prospectId"}
            if ui.get("prospectId"):
                dbv = verify_db(client, TARGETS["staging"]["db"], ui["prospectId"], ui.get("mark") or "")
            report["targets"]["staging"] = {
                "uiPass": ui.get("pass") is True,
                "db": dbv,
                "finishedAt": utcnow(),
                "prospectId": ui.get("prospectId"),
            }
            print("staging db", dbv)
            purge(client, TARGETS["staging"]["db"])
            if proc.returncode != 0 or not ui.get("pass") or not dbv.get("pass"):
                raise RuntimeError("staging FAIL — no se toca prod")
            if vite:
                vite.terminate()
                try:
                    vite.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    vite.kill()
                vite = None
            if tunnel:
                tunnel.shutdown()
                tunnel = None

        print(f"=== PRE-SPA (SQL prod + API + UI local) {utcnow()} ===")
        apply_sql_file(client, TARGETS["prod"]["db"])
        report["prodSqlAt"] = utcnow()
        upload_api(client)
        restart_api(client, TARGETS["prod"]["pm2"])
        report["prodRestartAt"] = utcnow()

        purge(client, TARGETS["prod"]["db"])
        uid = ensure_auth_user(client, TARGETS["prod"]["env_file"], EMAIL, NAME, qa_password)
        setup_opc(client, TARGETS["prod"]["db"], uid)
        tunnel = start_tunnel(transport, LOCAL_PORT, 4000)
        vite = start_vite()
        pre_results = ROOT / "scripts" / ".qa-opc-fields-prespa-ui.json"
        pre_shots = ROOT / "scripts" / ".qa-opc-fields-prespa-shots"
        pre_shots.mkdir(parents=True, exist_ok=True)
        print(f"=== PRE-SPA PLAYWRIGHT {utcnow()} ===")
        proc = subprocess.run(
            ["node", str(PLAY)],
            env=playwright_env(f"http://127.0.0.1:{VITE_PORT}", EMAIL, qa_password, pre_shots, pre_results),
            cwd=str(ROOT),
        )
        ui = json.loads(pre_results.read_text(encoding="utf-8")) if pre_results.is_file() else {}
        dbv = {"pass": False, "detail": "sin prospectId"}
        if ui.get("prospectId"):
            dbv = verify_db(client, TARGETS["prod"]["db"], ui["prospectId"], ui.get("mark") or "")
        report["targets"]["preSpa"] = {
            "uiPass": ui.get("pass") is True,
            "db": dbv,
            "finishedAt": utcnow(),
            "prospectId": ui.get("prospectId"),
        }
        print("preSpa db", dbv)
        purge(client, TARGETS["prod"]["db"])
        if proc.returncode != 0 or not ui.get("pass") or not dbv.get("pass"):
            raise RuntimeError("pre-spa FAIL — no se publica dist")

        print(f"=== PROD SPA {utcnow()} ===")
        print("build SPA…")
        subprocess.check_call([sys.executable, str(ROOT / "scripts" / "build-web-vps-prod.py")], cwd=str(ROOT))
        report["webBackup"] = deploy_web(client)
        report["prodDeployAt"] = utcnow()

        purge(client, TARGETS["prod"]["db"])
        uid = ensure_auth_user(client, TARGETS["prod"]["env_file"], EMAIL, NAME, qa_password)
        setup_opc(client, TARGETS["prod"]["db"], uid)
        host = local.get("VPS_HOST", "187.77.14.148")
        prod_results = RESULTS
        print(f"=== PROD PLAYWRIGHT {utcnow()} ===")
        proc = subprocess.run(
            ["node", str(PLAY)],
            env=playwright_env(f"http://{host}", EMAIL, qa_password, SHOTS, prod_results),
            cwd=str(ROOT),
        )
        ui = json.loads(prod_results.read_text(encoding="utf-8")) if prod_results.is_file() else {}
        dbv = {"pass": False, "detail": "sin prospectId"}
        if ui.get("prospectId"):
            dbv = verify_db(client, TARGETS["prod"]["db"], ui["prospectId"], ui.get("mark") or "")
        report["targets"]["prod"] = {
            "uiPass": ui.get("pass") is True,
            "db": dbv,
            "finishedAt": utcnow(),
            "prospectId": ui.get("prospectId"),
        }
        print("prod db", dbv)
        purge(client, TARGETS["prod"]["db"])
        if proc.returncode != 0 or not ui.get("pass") or not dbv.get("pass"):
            raise RuntimeError("prod smoke FAIL")
        report["pass"] = True
    except Exception as ex:
        report["pass"] = False
        report["error"] = str(ex)
        print(ex, file=sys.stderr)
    finally:
        if vite:
            vite.terminate()
            try:
                vite.wait(timeout=8)
            except subprocess.TimeoutExpired:
                vite.kill()
        if tunnel:
            tunnel.shutdown()
        report["finishedAt"] = utcnow()
        RESULTS.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Wrote {RESULTS} pass={report.get('pass')}")
        client.close()
    sys.exit(0 if report.get("pass") else 1)


if __name__ == "__main__":
    main()
