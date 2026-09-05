#!/usr/bin/env python3
"""
Crea usuario QA desechable en prod (personal + sala RH liner),
corre Playwright de verificación MVC, rate-limit en loopback, limpia sí o sí.
"""
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
VPS_ENV = "/var/www/Saletse/.env"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EMAIL = "qa-mvc-prod-verify@saletse-test.com"
SHOTS = ROOT / "scripts" / ".qa-mvc-prod-shots"
RESULTS = ROOT / "scripts" / ".qa-mvc-prod-results.json"
QA_FULL_NAME = "QA MVC Prod Verify"
sys.path.insert(0, str(ROOT / "scripts"))
from qa_purge_standard import (  # noqa: E402
    sql_capture_qa_personal_workspaces,
    sql_delete_captured_qa_personal_workspaces,
    sql_leftover_qa_personal_workspaces,
)


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
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i saletse-prod-db "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
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
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as ex:
        raw = ex.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw[:500]}
        return ex.code, payload


def purge(client, emails, personal_ids=None):
    quoted = ", ".join(f"'{e}'" for e in emails)
    extra = ""
    if personal_ids:
        ids = ", ".join(f"'{i}'" for i in personal_ids if i)
        if ids:
            extra = f"DELETE FROM workspaces WHERE id IN ({ids}) AND tipo = 'personal';"
    psql(
        client,
        f"""
{sql_capture_qa_personal_workspaces(emails, [QA_FULL_NAME])}
DELETE FROM workspace_miembros wm USING profiles p
WHERE wm.usuario_id = p.id AND p.email IN ({quoted});
DELETE FROM empresa_miembros em USING profiles p
WHERE em.usuario_id = p.id AND p.email IN ({quoted});
DELETE FROM flag_reglas fr USING profiles p
WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id AND p.email IN ({quoted});
{sql_delete_captured_qa_personal_workspaces()}
{extra}
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email IN ({quoted});
DELETE FROM auth.users WHERE email IN ({quoted});
DELETE FROM profiles WHERE email IN ({quoted});
""",
    )


def ensure_auth_user(base, anon, service, email, full_name, password):
    status, listed = auth_request(base, anon, service, "GET", "/auth/v1/admin/users?page=1&per_page=1000")
    if status != 200:
        raise RuntimeError(f"listUsers: HTTP {status} {listed}")
    users = listed.get("users") or []
    existing = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
    if existing:
        uid = existing["id"]
        st, body = auth_request(base, anon, service, "PUT", f"/auth/v1/admin/users/{uid}", {
            "email_confirm": True,
            "password": password,
            "user_metadata": {"full_name": full_name},
        })
        if st not in (200, 201):
            raise RuntimeError(f"updateUser: HTTP {st} {body}")
        return uid
    st, created = auth_request(base, anon, service, "POST", "/auth/v1/admin/users", {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    })
    if st not in (200, 201):
        raise RuntimeError(f"createUser {email}: HTTP {st} {created}")
    uid = created.get("id") or created.get("user", {}).get("id")
    if not uid:
        raise RuntimeError(f"createUser sin id: {created}")
    return uid


def rate_limit_loopback(client):
    script = r"""
codes=""
for i in $(seq 1 12); do
  c=$(curl -s -o /tmp/qa-rl.json -w "%{http_code}" -X POST http://127.0.0.1:4000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"qa-rate-limit-probe@example.invalid","password":"nope"}')
  codes="$codes $c"
done
echo "CODES:$codes"
python3 - <<'PY'
import json
try:
    print("LAST_BODY", open("/tmp/qa-rl.json").read()[:300])
except Exception as e:
    print("LAST_BODY_ERR", e)
PY
"""
    _, o, e = client.exec_command(script, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    return (out + err).strip()


def main():
    local = load_local_env()
    host = local.get("VPS_HOST", "187.77.14.148")
    password_vps = local.get("VPS_PASSWORD")
    if not password_vps:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=local.get("VPS_USER", "root"), password=password_vps, timeout=25, allow_agent=False, look_for_keys=False)
    vps = fetch_vps_env(client)
    base = f"http://{host}"
    anon = vps.get("SUPABASE_ANON_KEY") or vps.get("VITE_SUPABASE_ANON_KEY")
    service = vps.get("SUPABASE_SERVICE_ROLE_KEY")
    if not anon or not service:
        print("Faltan keys en VPS .env", file=sys.stderr)
        sys.exit(1)

    qa_password = secrets.token_urlsafe(10) + "Aa1!"
    personal_id = None
    uid = None
    rc = 1
    try:
        print("=== PURGE previo ===")
        purge(client, [EMAIL])

        print("=== CREAR usuario Auth ===")
        uid = ensure_auth_user(base, anon, service, EMAIL, QA_FULL_NAME, qa_password)
        print(f"  uid={uid[:8]}…")

        print("=== WORKSPACE personal + sala RH liner ===")
        personal_id = psql(client, f"SELECT public.ensure_personal_workspace('{uid}');").strip().splitlines()[-1].strip()
        if not personal_id or len(personal_id) < 30:
            raise RuntimeError(f"ensure_personal_workspace falló: {personal_id!r}")
        psql(
            client,
            f"""
INSERT INTO paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, w.id, true
FROM flags w
JOIN paquetes_acceso p ON p.empresa_id = '{RH_ID}'
WHERE w.clave IN ('worksheet','worksheet.royal_holiday','worksheet.royal_holiday.money_box')
  AND (w.empresa_id = '{RH_ID}' OR w.tipo = 'estandar')
  AND p.slug IN ('liner','cierre','operacion-base')
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;

INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', false, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE SET es_admin = false;

INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', 'vendedor', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'liner'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE SET role_id = EXCLUDED.role_id;

UPDATE profiles SET workspace_activo_id = '{SALA_RH_ID}', is_super_admin = false WHERE id = '{uid}';
""",
        )
        flags = psql(
            client,
            f"""
SELECT
  resolver_workspace_flag('worksheet','{uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('worksheet.royal_holiday','{uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('worksheet.royal_holiday.money_box','{uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('rh.tool.ops','{uid}','{SALA_RH_ID}'),
  resolver_workspace_flag('analysis','{uid}','{SALA_RH_ID}'),
  (SELECT is_super_admin FROM profiles WHERE id = '{uid}'),
  (SELECT COUNT(*) FROM workspace_miembros WHERE usuario_id = '{uid}'),
  (SELECT empresa_id FROM workspaces WHERE id = '{SALA_RH_ID}');
""",
        ).strip()
        print(f"  personal={personal_id}")
        print(f"  resolver: {flags}")
        parts = [p.strip() for p in flags.split("|")]
        if parts[5:6] == ["t"]:
            raise RuntimeError("el usuario QA no debe ser super_admin")
        if parts[0] != "t" or parts[1] != "t" or parts[2] != "t":
            raise RuntimeError(f"flags worksheet/RH/money_box no ON para liner: {flags}")

        print("\n=== PLAYWRIGHT (login real) ===")
        SHOTS.mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env.update({
            "PLAYWRIGHT_BASE_URL": base,
            "QA_MVC_EMAIL": EMAIL,
            "QA_MVC_PASSWORD": qa_password,
            "QA_MVC_SALA_ID": SALA_RH_ID,
            "QA_MVC_PERSONAL_ID": personal_id,
            "QA_MVC_RH_ID": RH_ID,
            "QA_MVC_SHOTS": str(SHOTS),
        })
        proc = subprocess.run(
            ["node", str(ROOT / "scripts" / "qa-mvc-prod-verify.mjs")],
            env=env,
            cwd=str(ROOT),
        )
        rc = proc.returncode

        print("\n=== RATE LIMIT login (loopback VPS, no bloquea tu IP) ===")
        rl = rate_limit_loopback(client)
        print(rl)
        codes_line = next((ln for ln in rl.splitlines() if ln.startswith("CODES:")), "")
        codes = [c for c in codes_line.replace("CODES:", "").split() if c]
        has_429 = "429" in codes
        first_429 = codes.index("429") + 1 if has_429 else None
        print(f"  RATE_LIMIT_429={'PASS' if has_429 else 'FAIL'} first_429_at={first_429} codes={codes}")
        extra = {}
        if RESULTS.is_file():
            extra = json.loads(RESULTS.read_text(encoding="utf-8"))
        extra["rateLimitLoopback"] = {"codes": codes, "pass": has_429, "first429At": first_429, "raw": rl[-400:]}
        RESULTS.write_text(json.dumps(extra, indent=2), encoding="utf-8")
        if not has_429:
            rc = 1
    finally:
        print("\n=== LIMPIEZA ===")
        try:
            purge(client, [EMAIL], personal_ids=[personal_id] if personal_id else None)
            left_p = psql(client, f"SELECT COUNT(*) FROM profiles WHERE email = '{EMAIL}';").strip()
            left_u = psql(client, f"SELECT COUNT(*) FROM auth.users WHERE email = '{EMAIL}';").strip()
            left_m = psql(
                client,
                f"SELECT COUNT(*) FROM workspace_miembros wm JOIN profiles p ON p.id = wm.usuario_id WHERE p.email = '{EMAIL}';",
            ).strip()
            left_ws = psql(client, sql_leftover_qa_personal_workspaces([EMAIL], [QA_FULL_NAME])).strip().split("|")[-1].strip()
            print(f"  perfiles restantes={left_p} auth.users={left_u} membresías={left_m} ws_personal={left_ws}")
            if left_p not in ("0", "") or left_u not in ("0", "") or left_ws not in ("0", ""):
                print("  WARN: la cuenta QA no quedó en cero")
                rc = 1
            else:
                print("  cuenta QA eliminada por completo")
        except Exception as ex:
            print(f"  LIMPIEZA FALLÓ: {ex}")
            rc = 1
        client.close()

    if RESULTS.is_file():
        print("\n=== CHECKS ===")
        data = json.loads(RESULTS.read_text(encoding="utf-8"))
        for k, v in (data.get("checks") or {}).items():
            mark = "PASS" if v.get("pass") else "FAIL"
            print(f"  [{mark}] {k}: {v.get('detail')}")
        print(f"\nCapturas: {SHOTS}")
        print(f"JSON: {RESULTS}")

    sys.exit(rc)


if __name__ == "__main__":
    main()
