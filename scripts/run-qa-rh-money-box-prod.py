#!/usr/bin/env python3
"""
QA Money Box RH en prod:
- Auth + DB vía VPS self-hosted (no Supabase Cloud)
- Playwright DOM local contra http://VPS
- Limpieza total al final
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
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL_LINER = "qa-rh-mb-liner@saletse-test.com"
EMAIL_CERRADOR = "qa-rh-mb-cerrador@saletse-test.com"
QA_EMAILS = [EMAIL_LINER, EMAIL_CERRADOR]
PERSONAL_NAMES = ["QA MB Liner", "QA MB Cerrador"]
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)
SHOTS = ROOT / "scripts" / ".qa-rh-moneybox-shots"


def load_local_env():
    data = {}
    if ENV_LOCAL.is_file():
        for raw in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
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
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = f"echo {b64} | base64 -d | docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    _, o, e = client.exec_command(cmd, timeout=120)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if "ERROR:" in out or "ERROR:" in err:
        raise RuntimeError((out + err)[-2500:])
    return out + err


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
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
    try:
        with opener.open(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return ex.code, payload


def purge_users(client, emails):
    quoted = ", ".join(f"'{e}'" for e in emails)
    psql(client, f"""
{sql_capture_qa_personal_workspaces(emails, PERSONAL_NAMES)}
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
    uid = created.get("id") or created.get("user", {}).get("id")
    if not uid:
        raise RuntimeError(f"createUser {email}: sin id en respuesta {created}")
    return uid


def ensure_worksheet_parent_flags(client):
    psql(client, f"""
INSERT INTO paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, w.id, true
FROM flags w
JOIN paquetes_acceso p ON p.empresa_id = '{RH_ID}'
WHERE w.clave = 'worksheet' AND w.tipo = 'estandar'
  AND p.slug IN ('liner', 'cierre', 'operacion-base')
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;
""")


def setup_membership(client, uid, role_slug):
    psql(client, f"""
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false;

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{role_slug}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id;

UPDATE profiles SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false WHERE id = '{uid}';
""")


def resolve_flags(client, liner_uid, cerrador_uid):
    out = psql(client, f"""
SELECT
  resolver_workspace_flag('worksheet','{liner_uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('worksheet.royal_holiday','{liner_uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('worksheet.royal_holiday.money_box','{liner_uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('worksheet.royal_holiday.money_box','{cerrador_uid}','{SALA_RH_ID}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{liner_uid}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{cerrador_uid}');
""")
    parts = out.strip().split("|")
    return {
        "liner_worksheet": parts[0].strip() if parts else "?",
        "liner_rh": parts[1].strip() if len(parts) > 1 else "?",
        "liner_mb": parts[2].strip() if len(parts) > 2 else "?",
        "cerrador_mb": parts[3].strip() if len(parts) > 3 else "?",
        "liner_super": parts[4].strip() if len(parts) > 4 else "?",
        "cerrador_super": parts[5].strip() if len(parts) > 5 else "?",
    }


def toggle_liner_paquete(client, active):
    val = "true" if active else "false"
    psql(client, f"""
UPDATE paquete_flags SET activo = {val}
WHERE paquete_id = (SELECT paquete_id FROM roles WHERE empresa_id = '{RH_ID}' AND slug = 'liner' LIMIT 1)
  AND flag_id = (SELECT id FROM flags WHERE clave = 'worksheet.royal_holiday.money_box' AND empresa_id = '{RH_ID}');
""")


def run_playwright(base, anon, service, cases):
    SHOTS.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update({
        "PLAYWRIGHT_BASE_URL": base,
        "SUPABASE_URL": base,
        "SUPABASE_ANON_KEY": anon,
        "SUPABASE_SERVICE_ROLE_KEY": service,
        "QA_RH_MB_CASES": json.dumps(cases),
        "QA_RH_MB_SHOTS": str(SHOTS),
    })
    proc = subprocess.run(
        ["node", str(ROOT / "scripts" / "qa-rh-money-box-dom-only.mjs")],
        env=env,
        cwd=str(ROOT),
    )
    return proc.returncode


def main():
    local = load_local_env()
    host = local.get("VPS_HOST", "187.77.14.148")
    password = local.get("VPS_PASSWORD")
    if not password:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=local.get("VPS_USER", "root"), password=password, timeout=25, allow_agent=False, look_for_keys=False)
    vps = fetch_vps_env(client)

    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")
    web_base = base

    if not anon or not service:
        print("Faltan keys en VPS .env", file=sys.stderr)
        sys.exit(1)

    results_path = ROOT / "scripts" / ".qa-rh-moneybox-dom-results.json"
    if results_path.is_file():
        results_path.unlink()
    liner_uid = cerrador_uid = None
    try:
        print("=== PURGE previo ===")
        purge_users(client, [EMAIL_LINER, EMAIL_CERRADOR])

        print("=== CREAR usuarios Auth VPS ===")
        liner_uid = ensure_auth_user(base, anon, service, EMAIL_LINER, "QA MB Liner")
        cerrador_uid = ensure_auth_user(base, anon, service, EMAIL_CERRADOR, "QA MB Cerrador")
        print(f"  liner={liner_uid[:8]}… cerrador={cerrador_uid[:8]}…")

        print("=== MEMBRESÍA RH ===")
        ensure_worksheet_parent_flags(client)
        setup_membership(client, liner_uid, "liner")
        setup_membership(client, cerrador_uid, "cerrador")
        toggle_liner_paquete(client, True)
        flags = resolve_flags(client, liner_uid, cerrador_uid)
        print("  resolver:", flags)
        if flags["liner_super"] == "t" or flags["cerrador_super"] == "t":
            raise RuntimeError("usuarios QA no deben ser super_admin")

        print("\n=== DOM — flags ON ===")
        rc = run_playwright(web_base, anon, service, [
            {"email": EMAIL_LINER, "expect": True, "checkCalc": True, "shot": "liner-flag-on.png", "label": "liner ON"},
            {"email": EMAIL_CERRADOR, "expect": True, "checkCalc": True, "shot": "cerrador-flag-on.png", "label": "cerrador ON"},
        ])
        if rc != 0:
            raise RuntimeError("DOM fase ON falló")

        print("\n=== Toggle negativo: paquete liner OFF ===")
        toggle_liner_paquete(client, False)
        flags_off = resolve_flags(client, liner_uid, cerrador_uid)
        print("  resolver:", flags_off)

        print("\n=== DOM — liner OFF / cerrador ON ===")
        rc = run_playwright(web_base, anon, service, [
            {"email": EMAIL_LINER, "expect": False, "shot": "liner-flag-off.png", "label": "liner OFF"},
            {"email": EMAIL_CERRADOR, "expect": True, "shot": "cerrador-still-on.png", "label": "cerrador ON"},
        ])
        if rc != 0:
            raise RuntimeError("DOM fase OFF falló")

        toggle_liner_paquete(client, True)
    finally:
        print("\n=== LIMPIEZA ===")
        try:
            toggle_liner_paquete(client, True)
        except Exception:
            pass
        purge_users(client, [EMAIL_LINER, EMAIL_CERRADOR])
        left = psql(client, f"SELECT COUNT(*) FROM profiles WHERE email IN ('{EMAIL_LINER}','{EMAIL_CERRADOR}');").strip()
        left_ws = psql(client, sql_leftover_qa_personal_workspaces(QA_EMAILS, PERSONAL_NAMES)).strip().split("|")[-1].strip()
        print(f"  perfiles restantes: {left} ws_personal={left_ws}")
        client.close()

    results = json.loads(results_path.read_text(encoding="utf-8")) if results_path.is_file() else []

    print("\n=== RESUMEN DOM ===")
    print("| Caso | Esperado | DOM | OK |")
    print("|---|---|---|---|")
    for r in results:
        print(f"| {r['label']} | {'visible' if r['expectVisible'] else 'ausente'} | {r['domCount']} | {'PASS' if r['ok'] else 'FAIL'} |")
    print(f"\nCapturas: {SHOTS}")
    print(f"Deploy grep: index + worksheet-page en dist (ver deploy-web-dist-prod.py)")


if __name__ == "__main__":
    main()
