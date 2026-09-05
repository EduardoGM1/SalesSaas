#!/usr/bin/env python3
"""
QA E2E Premanifiesto RH prod:
1. Bootstrap RH en VPS + verificar paquetes/roles marketing/opc-lobby
2. Usuarios QA temporales + smoke API real
3. Limpieza total
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
VPS_ENV = "/var/www/Saletse/.env"
REMOTE = "/var/www/Saletse"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
GERENTE_EMAIL = "eduardolalito99@hotmail.com"
EMAIL_MARKETING = "qa-rh-pm-marketing@saletse-test.com"
EMAIL_OPC = "qa-rh-pm-opc@saletse-test.com"
EMAIL_NOFLAG = "qa-rh-pm-noflag@saletse-test.com"
EMAIL_LINER = "qa-rh-pm-liner@saletse-test.com"
EMAIL_GERENTE_QA = "qa-rh-pm-gerente@saletse-test.com"
QA_EMAILS = [EMAIL_MARKETING, EMAIL_OPC, EMAIL_NOFLAG, EMAIL_LINER, EMAIL_GERENTE_QA]
PERSONAL_NAMES = [
    "QA PM Marketing",
    "QA PM OPC",
    "QA PM No Flag",
    "QA PM Liner CSI",
    "QA PM Gerente",
]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)
UPLOAD_FILES = [
    "scripts/bootstrap-royal-holiday.mjs",
    "scripts/seed-rh-tool-flags.mjs",
    "apps/api/src/services/empresa-roles-seed.js",
    "scripts/qa-rh-premanifiesto-api-prod.mjs",
]


def load_local_env():
    data = {}
    for path in (ENV_LOCAL, ROOT / ".env"):
        if path.is_file():
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


def psql(client, sql, tuples_only=True):
    flag = "-t -A" if tuples_only else ""
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 {flag}"
    _, o, e = client.exec_command(cmd, timeout=180)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    combined = out + err
    if "ERROR:" in combined and "NOTICE:" not in combined.split("ERROR:")[0][-20:]:
        # allow ERROR in output only if it's the expected test error
        if "ERROR:" in out and "PM_CUPO" not in out:
            raise RuntimeError(combined[-3000:])
    if "ERROR:" in err and "STOP" in err:
        raise RuntimeError(combined[-3000:])
    return out.strip()


def auth_request(base, anon, service, method, path, body=None):
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
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", errors="replace")
        try:
            return ex.code, json.loads(raw)
        except json.JSONDecodeError:
            return ex.code, {"raw": raw[:500]}


def ensure_auth_user(base, anon, service, email, full_name):
    status, listed = auth_request(base, anon, service, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    if status != 200:
        raise RuntimeError(f"listUsers: HTTP {status} {listed}")
    users = listed.get("users") or []
    existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if existing:
        uid = existing["id"]
        auth_request(base, anon, service, "PUT", f"/auth/v1/admin/users/{uid}", {
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        })
        return uid
    status, created = auth_request(base, anon, service, "POST", "/auth/v1/admin/users", {
        "email": email,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    })
    if status not in (200, 201):
        raise RuntimeError(f"createUser {email}: HTTP {status} {created}")
    uid = created.get("id") or (created.get("user") or {}).get("id")
    if not uid:
        raise RuntimeError(f"createUser {email}: sin id")
    return uid


def purge_users(client, emails):
    quoted = ", ".join(f"'{e}'" for e in emails)
    psql(client, f"""
{sql_capture_qa_personal_workspaces(emails, PERSONAL_NAMES)}
DELETE FROM rh_premanifiesto WHERE created_by IN (SELECT id FROM profiles WHERE email IN ({quoted}));
DELETE FROM workspace_miembros wm USING profiles p
WHERE wm.usuario_id = p.id AND p.email IN ({quoted});
DELETE FROM empresa_miembros em USING profiles p
WHERE em.usuario_id = p.id AND p.email IN ({quoted});
DELETE FROM flag_reglas fr USING profiles p
WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({quoted});
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({quoted});
DELETE FROM auth.users WHERE email IN ({quoted});
DELETE FROM profiles WHERE email IN ({quoted});
""")


def setup_qa_noflag_package(client):
    psql(client, f"""
INSERT INTO paquetes_acceso (id, empresa_id, nombre, slug, descripcion, es_sistema, activo)
SELECT gen_random_uuid(), '{RH_ID}', 'QA Sin Premanifiesto', 'qa-pm-noflag', 'QA temp', false, true
WHERE NOT EXISTS (
  SELECT 1 FROM paquetes_acceso WHERE empresa_id = '{RH_ID}' AND slug = 'qa-pm-noflag'
);
INSERT INTO roles (id, slug, nombre, scope, empresa_id, paquete_id, es_sistema)
SELECT gen_random_uuid(), 'qa-pm-noflag', 'QA Sin PM', 'workspace', '{RH_ID}', p.id, false
FROM paquetes_acceso p
WHERE p.empresa_id = '{RH_ID}' AND p.slug = 'qa-pm-noflag'
  AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'qa-pm-noflag');
""")


def setup_membership(client, uid, role_slug):
    psql(client, f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false;

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{role_slug}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id;

UPDATE profiles SET workspace_activo_id = '{SALA_ID}', is_super_admin = false WHERE id = '{uid}';
""")


def verify_packages_roles(client):
    packs = psql(client, f"""
SELECT slug FROM paquetes_acceso
WHERE empresa_id = '{RH_ID}' AND slug IN ('marketing', 'opc-lobby')
ORDER BY slug;
""").splitlines()
    packs = [p.strip() for p in packs if p.strip()]
    roles = psql(client, f"""
SELECT slug FROM roles
WHERE empresa_id = '{RH_ID}' AND slug IN ('marketing', 'opc')
ORDER BY slug;
""").splitlines()
    roles = [r.strip() for r in roles if r.strip()]
    return {
        "packages_marketing_opc": packs,
        "roles_marketing_opc": roles,
        "packages_ok": "marketing" in packs and "opc-lobby" in packs,
        "roles_ok": "marketing" in roles and "opc" in roles,
    }


def materialize_marketing_opc_sql(client):
    """Idempotente: paquetes + roles marketing/opc-lobby (paridad empresa-roles-seed.js)."""
    psql(client, f"""
-- Paquete marketing
INSERT INTO paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
SELECT '{RH_ID}', 'Marketing', 'marketing', 'Premanifiesto RH — calendario y olas.', true, true
WHERE NOT EXISTS (SELECT 1 FROM paquetes_acceso WHERE empresa_id = '{RH_ID}' AND slug = 'marketing');

INSERT INTO paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
SELECT '{RH_ID}', 'OPC Lobby', 'opc-lobby', 'Premanifiesto RH — invitación desde lobby.', true, true
WHERE NOT EXISTS (SELECT 1 FROM paquetes_acceso WHERE empresa_id = '{RH_ID}' AND slug = 'opc-lobby');

-- Flags en paquete marketing (cadena padre worksheet → RH → ops → premanifiesto)
INSERT INTO paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, f.id, true
FROM paquetes_acceso p
JOIN flags f ON (f.empresa_id = p.empresa_id OR (f.empresa_id IS NULL AND f.tipo = 'estandar'))
WHERE p.empresa_id = '{RH_ID}' AND p.slug = 'marketing'
  AND f.clave IN (
    'worksheet', 'worksheet.royal_holiday',
    'rh.tool.ops', 'rh.tool.premanifiesto', 'rh.tool.premanifiesto.marketing'
  )
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;

-- Flags en paquete opc-lobby (cadena padre + ops para resolver)
INSERT INTO paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, f.id, true
FROM paquetes_acceso p
JOIN flags f ON (f.empresa_id = p.empresa_id OR (f.empresa_id IS NULL AND f.tipo = 'estandar'))
WHERE p.empresa_id = '{RH_ID}' AND p.slug = 'opc-lobby'
  AND f.clave IN (
    'worksheet', 'worksheet.royal_holiday',
    'rh.tool.ops', 'rh.tool.premanifiesto', 'rh.tool.premanifiesto.opc'
  )
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;

-- Roles marketing / opc
INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT '{RH_ID}', 'Marketing', 'marketing', 'workspace', p.id, true
FROM paquetes_acceso p
WHERE p.empresa_id = '{RH_ID}' AND p.slug = 'marketing'
  AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'marketing');

INSERT INTO roles (empresa_id, nombre, slug, scope, paquete_id, es_sistema)
SELECT '{RH_ID}', 'OPC', 'opc', 'workspace', p.id, true
FROM paquetes_acceso p
WHERE p.empresa_id = '{RH_ID}' AND p.slug = 'opc-lobby'
  AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'opc');

UPDATE roles r SET paquete_id = p.id
FROM paquetes_acceso p
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'marketing' AND p.empresa_id = '{RH_ID}' AND p.slug = 'marketing';

UPDATE roles r SET paquete_id = p.id
FROM paquetes_acceso p
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'opc' AND p.empresa_id = '{RH_ID}' AND p.slug = 'opc-lobby';
""")


def run_bootstrap(client):
    cmd = f"cd {REMOTE} && node scripts/bootstrap-royal-holiday.mjs 2>&1"
    _, o, e = client.exec_command(cmd, timeout=300)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    return code, out + err


def main():
    local = load_local_env()
    password = local.get("VPS_PASSWORD")
    host = local.get("VPS_HOST", "187.77.14.148")
    if not password:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=local.get("VPS_USER", "root"), password=password, timeout=30)
    vps = fetch_vps_env(client)
    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")
    if not anon or not service:
        print("Faltan keys Supabase en VPS", file=sys.stderr)
        sys.exit(1)

    report = {"bootstrap": {}, "materialization": {}, "scenarios": []}

    try:
        print("=== UPLOAD scripts actualizados ===")
        sftp = client.open_sftp()
        for rel in UPLOAD_FILES:
            local_path = ROOT / rel
            remote_path = f"{REMOTE}/{rel.replace(chr(92), '/')}"
            print(f"  upload {rel}")
            sftp.put(str(local_path), remote_path)
        sftp.close()

        print("\n=== BOOTSTRAP Royal Holiday en VPS ===")
        code, boot_out = run_bootstrap(client)
        report["bootstrap"] = {"exit_code": code, "output_tail": boot_out[-2000:]}
        print(boot_out[-800:] if boot_out else "(sin output)")
        if code != 0:
            print(f"WARN bootstrap node exit={code} — materializando paquetes/roles vía SQL")

        print("\n=== MATERIALIZAR paquetes/roles marketing/opc (SQL idempotente) ===")
        materialize_marketing_opc_sql(client)

        print("\n=== VERIFICAR materialización paquetes/roles ===")
        mat = verify_packages_roles(client)
        report["materialization"] = mat
        print(f"  Paquetes: {mat['packages_marketing_opc']}")
        print(f"  Roles: {mat['roles_marketing_opc']}")
        if not mat["packages_ok"] or not mat["roles_ok"]:
            raise RuntimeError("Paquetes/roles marketing/opc-lobby NO materializados en prod")

        ola_id = psql(client, f"""
SELECT id FROM rh_premanifiesto_ola_config
WHERE empresa_id = '{RH_ID}' AND activo = true
ORDER BY orden LIMIT 1;
""").strip()

        gerente_super = psql(client, f"""
SELECT is_super_admin FROM profiles WHERE email = '{GERENTE_EMAIL}' LIMIT 1;
""").strip()
        gerente_marketing_flag = psql(client, f"""
SELECT resolver_workspace_flag('rh.tool.premanifiesto.marketing', p.id, '{SALA_ID}')
FROM profiles p WHERE p.email = '{GERENTE_EMAIL}' LIMIT 1;
""").strip()
        report["gerente_prod"] = {
            "email": GERENTE_EMAIL,
            "is_super_admin": gerente_super,
            "has_marketing_flag": gerente_marketing_flag,
        }

        print("\n=== PURGE usuarios QA previos ===")
        purge_users(client, QA_EMAILS)
        setup_qa_noflag_package(client)

        print("\n=== CREAR usuarios QA ===")
        uid_m = ensure_auth_user(base, anon, service, EMAIL_MARKETING, "QA PM Marketing")
        uid_o = ensure_auth_user(base, anon, service, EMAIL_OPC, "QA PM OPC")
        uid_n = ensure_auth_user(base, anon, service, EMAIL_NOFLAG, "QA PM No Flag")
        uid_l = ensure_auth_user(base, anon, service, EMAIL_LINER, "QA PM Liner CSI")
        uid_gq = ensure_auth_user(base, anon, service, EMAIL_GERENTE_QA, "QA PM Gerente")
        print(f"  marketing={uid_m[:8]}… opc={uid_o[:8]}… noflag={uid_n[:8]}… liner={uid_l[:8]}… gerenteQA={uid_gq[:8]}…")

        setup_membership(client, uid_m, "marketing")
        setup_membership(client, uid_o, "opc")
        setup_membership(client, uid_n, "qa-pm-noflag")
        setup_membership(client, uid_l, "liner")
        setup_membership(client, uid_gq, "gerente")

        flags_check = psql(client, f"""
SELECT
  resolver_workspace_flag('rh.tool.premanifiesto.marketing','{uid_m}','{SALA_ID}'),
  resolver_workspace_flag('rh.tool.premanifiesto.opc','{uid_o}','{SALA_ID}'),
  resolver_workspace_flag('rh.tool.premanifiesto','{uid_n}','{SALA_ID}'),
  resolver_workspace_flag('rh.tool.premanifiesto','{uid_l}','{SALA_ID}'),
  resolver_workspace_flag('rh.tool.premanifiesto.csi','{uid_l}','{SALA_ID}');
""").split("|")
        print(f"  flags: marketing={flags_check[0].strip()} opc={flags_check[1].strip()} noflag_pm={flags_check[2].strip()} liner_pm={flags_check[3].strip()} liner_csi={flags_check[4].strip()}")

        print("\n=== API E2E (Node) ===")
        env = os.environ.copy()
        env.update({
            "API_BASE": base,
            "SUPABASE_URL": base,
            "SUPABASE_ANON_KEY": anon,
            "SUPABASE_SERVICE_ROLE_KEY": service,
            "RH_EMPRESA_ID": RH_ID,
            "RH_SALA_ID": SALA_ID,
            "QA_PM_OLA_ID": ola_id,
            "QA_PM_EMAIL_GERENTE": GERENTE_EMAIL,
        })
        proc = subprocess.run(
            ["node", str(ROOT / "scripts" / "qa-rh-premanifiesto-api-prod.mjs")],
            env=env,
            cwd=str(ROOT),
        )
        results_path = ROOT / "scripts" / ".qa-rh-pm-e2e-results.json"
        if results_path.is_file():
            payload = json.loads(results_path.read_text(encoding="utf-8"))
            report["scenarios"] = payload.get("results", [])
            csi_id = payload.get("ids", {}).get("csiRowId")
            opc_id = payload.get("ids", {}).get("opcRowId")
        else:
            csi_id = opc_id = None

        if proc.returncode != 0:
            report["api_exit_code"] = proc.returncode

    finally:
        print("\n=== LIMPIEZA ===")
        try:
            results_path = ROOT / "scripts" / ".qa-rh-pm-e2e-results.json"
            if results_path.is_file():
                payload = json.loads(results_path.read_text(encoding="utf-8"))
                csi_id = payload.get("ids", {}).get("csiRowId")
                opc_id = payload.get("ids", {}).get("opcRowId")
                if csi_id or opc_id:
                    ids = ",".join(f"'{x}'" for x in [csi_id, opc_id] if x)
                    psql(client, f"DELETE FROM rh_premanifiesto WHERE id IN ({ids});")
        except Exception as ex:
            print(f"  warn cleanup rows: {ex}")
        purge_users(client, QA_EMAILS)
        left = psql(client, f"SELECT COUNT(*) FROM profiles WHERE email LIKE 'qa-rh-pm-%@saletse-test.com';")
        left_ws = psql(client, sql_leftover_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)).strip().split("|")[-1].strip()
        print(f"  perfiles QA restantes: {left} ws_personal={left_ws}")
        client.close()

    out_path = ROOT / "scripts" / ".qa-rh-pm-e2e-report.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\n" + "=" * 60)
    print("ENTREGABLE — Materialización prod")
    print("=" * 60)
    mat = report.get("materialization", {})
    print(f"  Paquetes marketing/opc-lobby: {'PASS' if mat.get('packages_ok') else 'FAIL'} — {mat.get('packages_marketing_opc')}")
    print(f"  Roles marketing/opc: {'PASS' if mat.get('roles_ok') else 'FAIL'} — {mat.get('roles_marketing_opc')}")
    if report.get("gerente_prod", {}).get("is_super_admin") == "t":
        print("  NOTA: gerente prod es super_admin - POST /registrar bypass flags; escenario 4c valida gerente sin super")

    print("\nENTREGABLE — Escenarios API")
    print("=" * 60)
    for r in report.get("scenarios", []):
        print(f"  {r.get('ok')}  {r.get('id')}: {r.get('obs')}")

    failed = [r for r in report.get("scenarios", []) if r.get("ok") == "FAIL"]
    if not mat.get("packages_ok") or not mat.get("roles_ok"):
        sys.exit(2)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
