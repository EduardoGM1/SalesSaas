#!/usr/bin/env python3
"""E2E OPC click-through en prod: diagnóstico magic-link + flujo a–f + purga estándar."""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
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

RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL = "qa-opc-e2e-click@saletse-test.com"
NAME = "QA OPC E2E Click"
SHOTS = ROOT / "scripts" / ".qa-opc-e2e-shots"
VPS_ENV = "/var/www/Saletse/.env"


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def load_local_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def fetch_vps_env(client):
    _, o, _ = client.exec_command(f"cat {VPS_ENV}", timeout=30)
    data = {}
    for line in o.read().decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def psql(client, sql):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i saletse-prod-db "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    combined = out + err
    if "ERROR:" in combined:
        raise RuntimeError(combined[-2500:])
    return out.strip()


def auth_request(base, anon, service, method, path, body=None):
    import urllib.error
    import urllib.request

    url = f"{base.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {service}",
            "apikey": anon,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", errors="replace")
        try:
            return ex.code, json.loads(raw)
        except json.JSONDecodeError:
            return ex.code, {"raw": raw[:300]}


def ensure_auth_user(base, anon, service, email, full_name, password):
    status, listed = auth_request(base, anon, service, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    users = listed.get("users") or []
    existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if existing:
        st, out = auth_request(
            base,
            anon,
            service,
            "PUT",
            f"/auth/v1/admin/users/{existing['id']}",
            {"email_confirm": True, "password": password, "user_metadata": {"full_name": full_name}},
        )
        if st not in (200, 201):
            raise RuntimeError(f"updateUser {st} {out}")
        return existing["id"]
    st, created = auth_request(
        base,
        anon,
        service,
        "POST",
        "/auth/v1/admin/users",
        {"email": email, "password": password, "email_confirm": True, "user_metadata": {"full_name": full_name}},
    )
    if st not in (200, 201):
        raise RuntimeError(f"createUser {st} {created}")
    return created.get("id") or (created.get("user") or {}).get("id")


def purge(client):
    emails = [EMAIL]
    names = [NAME]
    psql(
        client,
        f"""
{sql_capture_qa_personal_workspaces(emails, names)}
DELETE FROM rh_premanifiesto WHERE created_by IN (SELECT id FROM profiles WHERE email IN ('{EMAIL}'))
  OR prospect_nombre ILIKE 'Qaopc%';
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


def leftover(client):
    raw = psql(
        client,
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


def setup_opc(client, uid):
    psql(client, f"SELECT public.ensure_personal_workspace('{uid}');")
    psql(
        client,
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


def main():
    local = load_local_env()
    password_vps = local.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = local.get("VPS_HOST", "187.77.14.148")
    if not password_vps:
        sys.exit("Falta VPS_PASSWORD")

    SHOTS.mkdir(parents=True, exist_ok=True)
    qa_password = secrets.token_urlsafe(10) + "Aa1!"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=local.get("VPS_USER", "root"), password=password_vps, timeout=30)
    vps = fetch_vps_env(client)
    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")

    rc = 1
    left = {}
    try:
        print(f"=== SETUP {utcnow()} ===")
        purge(client)
        uid = ensure_auth_user(base, anon, service, EMAIL, NAME, qa_password)
        setup_opc(client, uid)
        print(f"uid={uid}")

        env = os.environ.copy()
        env.update({
            "PLAYWRIGHT_BASE_URL": base,
            "SUPABASE_URL": base,
            "SUPABASE_ANON_KEY": anon,
            "SUPABASE_SERVICE_ROLE_KEY": service,
            "QA_OPC_E2E_EMAIL": EMAIL,
            "QA_OPC_E2E_PASSWORD": qa_password,
            "QA_OPC_E2E_SHOTS": str(SHOTS),
        })
        print(f"=== PLAYWRIGHT {utcnow()} ===")
        proc = subprocess.run(
            ["node", str(ROOT / "scripts" / "qa-opc-e2e-clickthrough.mjs")],
            env=env,
            cwd=str(ROOT),
        )
        rc = proc.returncode
    finally:
        print(f"=== PURGE {utcnow()} ===")
        try:
            purge(client)
            left = leftover(client)
            print("leftover", left)
        finally:
            client.close()

    leftover_ok = all(str(left.get(k, "1")) == "0" for k in ("profiles", "auth.users", "wm", "ws_personal"))
    if not leftover_ok:
        print("FAIL leftover no es 0", file=sys.stderr)
        sys.exit(2)
    sys.exit(rc)


if __name__ == "__main__":
    main()
