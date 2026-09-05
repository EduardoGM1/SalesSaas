#!/usr/bin/env python3
"""QA DOM Premanifiesto RH prod: usuarios QA + Playwright + limpieza."""
import json
import os
import subprocess
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
VPS_ENV = "/var/www/Saletse/.env"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL_MARKETING = "qa-rh-pm-dom-marketing@saletse-test.com"
EMAIL_OPC = "qa-rh-pm-dom-opc@saletse-test.com"
EMAIL_NOFLAG = "qa-rh-pm-dom-noflag@saletse-test.com"
EMAIL_GERENTE = "qa-rh-pm-dom-gerente@saletse-test.com"
QA_EMAILS = [EMAIL_MARKETING, EMAIL_OPC, EMAIL_NOFLAG, EMAIL_GERENTE]
PERSONAL_NAMES = ["QA DOM Marketing", "QA DOM OPC", "QA DOM NoFlag", "QA DOM Gerente"]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)
SHOTS = ROOT / "scripts" / ".qa-rh-pm-shots"


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


def psql(client, sql, allow_error=False):
    import base64
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    combined = out + err
    if not allow_error and "ERROR:" in combined:
        raise RuntimeError(combined[-2500:])
    return out.strip()


def auth_request(base, anon, service, method, path, body=None):
    import urllib.error
    import urllib.request
    url = f"{base.rstrip('/')}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {service}", "apikey": anon, "Content-Type": "application/json"},
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


def ensure_auth_user(base, anon, service, email, full_name):
    status, listed = auth_request(base, anon, service, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    users = listed.get("users") or []
    existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if existing:
        return existing["id"]
    status, created = auth_request(base, anon, service, "POST", "/auth/v1/admin/users", {
        "email": email, "email_confirm": True, "user_metadata": {"full_name": full_name},
    })
    if status not in (200, 201):
        raise RuntimeError(f"createUser {email}: {status} {created}")
    return created.get("id") or (created.get("user") or {}).get("id")


def purge_users(client, emails):
    quoted = ", ".join(f"'{e}'" for e in emails)
    psql(client, f"""
{sql_capture_qa_personal_workspaces(emails, PERSONAL_NAMES)}
DELETE FROM rh_premanifiesto WHERE created_by IN (SELECT id FROM profiles WHERE email IN ({quoted}));
DELETE FROM workspace_miembros wm USING profiles p WHERE wm.usuario_id = p.id AND p.email IN ({quoted});
DELETE FROM empresa_miembros em USING profiles p WHERE em.usuario_id = p.id AND p.email IN ({quoted});
{sql_delete_captured_qa_personal_workspaces()}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({quoted});
DELETE FROM auth.users WHERE email IN ({quoted});
DELETE FROM profiles WHERE email IN ({quoted});
""")


def setup_qa_noflag(client):
    psql(client, f"""
INSERT INTO paquetes_acceso (empresa_id, nombre, slug, descripcion, es_sistema, activo)
SELECT '{RH_ID}', 'QA DOM Sin PM', 'qa-pm-dom-noflag', 'QA DOM', false, true
WHERE NOT EXISTS (SELECT 1 FROM paquetes_acceso WHERE empresa_id='{RH_ID}' AND slug='qa-pm-dom-noflag');
INSERT INTO roles (slug, nombre, scope, empresa_id, paquete_id, es_sistema)
SELECT 'qa-pm-dom-noflag', 'QA DOM No PM', 'workspace', '{RH_ID}', p.id, false
FROM paquetes_acceso p WHERE p.empresa_id='{RH_ID}' AND p.slug='qa-pm-dom-noflag'
AND NOT EXISTS (SELECT 1 FROM roles WHERE empresa_id='{RH_ID}' AND slug='qa-pm-dom-noflag');
""")


def setup_membership(client, uid, role_slug):
    psql(client, f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo') ON CONFLICT DO NOTHING;
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_ID}', 'vendedor', r.id FROM roles r
WHERE r.empresa_id='{RH_ID}' AND r.slug='{role_slug}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id;
UPDATE profiles SET workspace_activo_id='{SALA_ID}', is_super_admin=false WHERE id='{uid}';
""")


def seed_opc_entry(client, uid):
    psql(client, f"DELETE FROM rh_premanifiesto WHERE prospect_nombre='QA DOM Badge OPC' AND fecha=CURRENT_DATE;", allow_error=True)
    psql(client, f"""
INSERT INTO rh_premanifiesto (
  empresa_id, workspace_id, fecha, ola_config_id, origen, prospect_nombre, status,
  comercial_bloqueado, created_by, updated_by, show_time
)
SELECT '{RH_ID}', '{SALA_ID}', CURRENT_DATE, c.id, 'opc', 'QA DOM Badge OPC', 'pendiente',
  true, '{uid}', '{uid}', c.hora
FROM rh_premanifiesto_ola_config c
WHERE c.empresa_id='{RH_ID}' AND c.orden=1
LIMIT 1;
""")


def grep_bundle(client):
    dist = "/var/www/Saletse/apps/web/dist/assets"
    _, o, _ = client.exec_command(
        f"grep -l 'rh-pm-page\\|RhPremanifiestoPage' {dist}/*.js 2>/dev/null | wc -l",
        timeout=30,
    )
    pos = o.read().decode().strip()
    mock_patterns = ["#2F5FE0", "border-radius:22px"]
    mock_hits = []
    for pat in mock_patterns:
        _, o2, _ = client.exec_command(
            f"grep -rl '{pat}' {dist}/ 2>/dev/null | head -3",
            timeout=30,
        )
        hits = [ln for ln in o2.read().decode().splitlines() if ln.strip()]
        mock_hits.append((pat, hits))
    return pos, mock_hits


def main():
    local = load_local_env()
    password = local.get("VPS_PASSWORD")
    host = local.get("VPS_HOST", "187.77.14.148")
    if not password:
        sys.exit("Falta VPS_PASSWORD")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=local.get("VPS_USER", "root"), password=password, timeout=30)
    vps = fetch_vps_env(client)
    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")

    SHOTS.mkdir(parents=True, exist_ok=True)
    results_path = ROOT / "scripts" / ".qa-rh-pm-dom-results.json"
    if results_path.is_file():
        results_path.unlink()

    try:
        purge_users(client, QA_EMAILS)
        setup_qa_noflag(client)
        uid_m = ensure_auth_user(base, anon, service, EMAIL_MARKETING, "QA DOM Marketing")
        uid_o = ensure_auth_user(base, anon, service, EMAIL_OPC, "QA DOM OPC")
        uid_n = ensure_auth_user(base, anon, service, EMAIL_NOFLAG, "QA DOM NoFlag")
        uid_g = ensure_auth_user(base, anon, service, EMAIL_GERENTE, "QA DOM Gerente")
        setup_membership(client, uid_m, "marketing")
        setup_membership(client, uid_o, "opc")
        setup_membership(client, uid_n, "qa-pm-dom-noflag")
        setup_membership(client, uid_g, "gerente")
        seed_opc_entry(client, uid_o)

        pos_count, mock_hits = grep_bundle(client)
        print(f"Grep bundle positivo: {pos_count} assets")
        for pat, hits in mock_hits:
            print(f"  mockup '{pat}': {len(hits)} hit(s)")

        env = os.environ.copy()
        env.update({
            "PLAYWRIGHT_BASE_URL": base,
            "SUPABASE_URL": base,
            "SUPABASE_ANON_KEY": anon,
            "SUPABASE_SERVICE_ROLE_KEY": service,
            "QA_RH_PM_SHOTS": str(SHOTS),
            "QA_RH_PM_CASES": json.dumps([
            {"email": EMAIL_MARKETING, "label": "marketing", "checkCalendar": True, "shot": "marketing-cal.png"},
            {"email": EMAIL_OPC, "label": "opc", "checkOpcForm": True, "checkOpcBadge": True, "shot": "opc-form.png"},
                {"email": EMAIL_GERENTE, "label": "gerente", "checkGerenteReadOnly": True, "shot": "gerente-ro.png"},
                {"email": EMAIL_NOFLAG, "label": "noflag", "checkHubHidden": True, "shot": "noflag-hub.png"},
            ]),
        })
        rc = subprocess.run(["node", str(ROOT / "scripts" / "qa-rh-premanifiesto-dom-only.mjs")], env=env, cwd=str(ROOT))
        if rc.returncode != 0:
            sys.exit(rc.returncode)

        if int(pos_count or "0") < 1:
            print("FAIL grep positivo bundle", file=sys.stderr)
            sys.exit(2)
        contaminated = [p for p, h in mock_hits if h]
        if contaminated:
            print(f"FAIL mockup contamination: {contaminated}", file=sys.stderr)
            sys.exit(3)
    finally:
        purge_users(client, QA_EMAILS)
        psql(client, "DELETE FROM rh_premanifiesto WHERE prospect_nombre='QA DOM Badge OPC';")
        left_ws = psql(client, sql_leftover_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)).strip().split("|")[-1].strip()
        print(f"  leftover ws_personal={left_ws}")
        client.close()

    print("\n=== DOM QA Premanifiesto OK ===")


if __name__ == "__main__":
    main()
