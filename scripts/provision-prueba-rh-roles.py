#!/usr/bin/env python3
"""
Cuentas de prueba PERSISTENTES (un rol/paquete de fábrica cada una) en la
Sala Royal Holiday.

  python scripts/provision-prueba-rh-roles.py --target staging
  python scripts/provision-prueba-rh-roles.py --target prod

No se purgan. Contraseña unificada en scripts/.env.prueba-rh-lalo
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
CREDS = ROOT / "scripts" / ".env.prueba-rh-lalo"
SUMMARY = ROOT / "scripts" / ".prueba-rh-lalo-summary.json"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_RH_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
TARGETS = {
    "staging": {
        "db": "supabase-db",
        "env_file": "/opt/saletse-api-staging/.env",
    },
    "prod": {
        "db": "saletse-prod-db",
        "env_file": "/var/www/Saletse/.env",
    },
}

# Un puesto de catálogo real por cuenta. Rep no tiene paquete: ver nota.
ACCOUNTS = [
    {
        "email": "prueba-opc@saletse-test.com",
        "name": "PRUEBA RH — OPC",
        "role_slug": "opc",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": [
            "rh.tool.ops",
            "rh.tool.premanifiesto",
            "rh.tool.premanifiesto.opc",
            "worksheet.royal_holiday",
        ],
    },
    {
        "email": "prueba-marketing@saletse-test.com",
        "name": "PRUEBA RH — Marketing",
        "role_slug": "marketing",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": [],
    },
    {
        "email": "prueba-rep@saletse-test.com",
        "name": "PRUEBA RH — Rep",
        "role_slug": "liner",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": ["rh.tool.premanifiesto.rep"],
        "note": "Rep no es paquete/rol en el catálogo; se asigna Liner de fábrica + solo el flag .rep",
    },
    {
        "email": "prueba-liner@saletse-test.com",
        "name": "PRUEBA RH — Liner",
        "role_slug": "liner",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": [],
    },
    {
        "email": "prueba-cerrador@saletse-test.com",
        "name": "PRUEBA RH — Cerrador",
        "role_slug": "cerrador",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": [],
    },
    {
        "email": "prueba-gerente@saletse-test.com",
        "name": "PRUEBA RH — Gerente",
        "role_slug": "gerente",
        "wm_rol": "vendedor",
        "es_admin": False,
        "extra_flags": [],
        "note": "Puesto Gerente (paquete operacion-base). rol_en_workspace queda vendedor: la sala solo admite un slot workspace_rol=gerente.",
    },
    {
        "email": "prueba-admin@saletse-test.com",
        "name": "PRUEBA RH — Admin empresa",
        "role_slug": "asistente_sala",
        "wm_rol": "vendedor",
        "es_admin": True,
        "extra_flags": [],
        "note": "Admin de empresa es empresa_miembros.es_admin, no un paquete. Puesto sala: Asistente de Sala (0 permisos de catálogo).",
    },
]


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


def psql(client, sql, timeout=180, db="saletse-prod-db"):
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


def ensure_auth_user(client, email, full_name, password, env_file="/var/www/Saletse/.env"):
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


def provision_one(client, acc, uid, password, db="saletse-prod-db"):
    name = acc["name"].replace("'", "''")
    email = acc["email"].replace("'", "''")
    extra = acc.get("extra_flags") or []
    extra_sql = ""
    if extra:
        keys = ", ".join("'" + k.replace("'", "''") + "'" for k in extra)
        extra_sql = f"""
INSERT INTO flag_reglas (flag_id, alcance, alcance_id, activo)
SELECT f.id, 'usuario', '{uid}', true
FROM flags f
WHERE f.clave IN ({keys})
  AND (f.empresa_id = '{RH_ID}' OR f.empresa_id IS NULL);
"""
    psql(
        client,
        f"""
SELECT public.ensure_personal_workspace('{uid}');
INSERT INTO empresa_miembros (empresa_id, usuario_id, es_admin, estado)
VALUES ('{RH_ID}', '{uid}', {'true' if acc['es_admin'] else 'false'}, 'activo')
ON CONFLICT (empresa_id, usuario_id) DO UPDATE
  SET es_admin = EXCLUDED.es_admin, estado = 'activo';
INSERT INTO workspace_miembros (usuario_id, workspace_id, rol_en_workspace, role_id)
SELECT '{uid}', '{SALA_RH_ID}', '{acc['wm_rol']}', r.id
FROM roles r WHERE r.empresa_id = '{RH_ID}' AND r.slug = '{acc['role_slug']}'
ON CONFLICT (usuario_id, workspace_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, rol_en_workspace = EXCLUDED.rol_en_workspace;
UPDATE profiles
SET workspace_activo_id = '{SALA_RH_ID}',
    is_super_admin = false,
    is_active = true,
    full_name = '{name}'
WHERE id = '{uid}';
DELETE FROM flag_reglas WHERE alcance = 'usuario' AND alcance_id = '{uid}';
DELETE FROM usuario_permisos_override WHERE usuario_id = '{uid}';
DELETE FROM workspace_usuario_permisos_override
WHERE usuario_id = '{uid}' AND workspace_id = '{SALA_RH_ID}';
{extra_sql}
UPDATE roles r
SET paquete_id = p.id
FROM paquetes_acceso p
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'opc'
  AND p.empresa_id = '{RH_ID}' AND p.slug = 'opc-lobby'
  AND (r.paquete_id IS DISTINCT FROM p.id);
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT opc.id, rp.permiso_id
FROM roles opc
JOIN roles liner ON liner.empresa_id = opc.empresa_id AND liner.slug = 'liner'
JOIN rol_permisos rp ON rp.rol_id = liner.id
WHERE opc.empresa_id = '{RH_ID}' AND opc.slug = 'opc'
ON CONFLICT DO NOTHING;
INSERT INTO workspace_usuario_permisos_override (workspace_id, usuario_id, permiso_id, otorgado)
SELECT '{SALA_RH_ID}', '{uid}', pe.id, true
FROM permisos pe
WHERE '{acc['role_slug']}' = 'opc'
  AND pe.clave IN ('expedientes:crear', 'expedientes:editar', 'expedientes:ver_propios')
ON CONFLICT (workspace_id, usuario_id, permiso_id) DO UPDATE SET otorgado = true;
""",
        db=db,
    )
    verify = last_line(
        psql(
            client,
            f"""
SELECT json_build_object(
  'email', p.email,
  'name', p.full_name,
  'es_admin', em.es_admin,
  'super', p.is_super_admin,
  'role', r.slug,
  'paquete', pa.slug,
  'wm_rol', wm.rol_en_workspace,
  'flag_overrides', (SELECT coalesce(json_agg(f.clave), '[]'::json)
                     FROM flag_reglas fr JOIN flags f ON f.id = fr.flag_id
                     WHERE fr.alcance = 'usuario' AND fr.alcance_id = p.id),
  'perm_overrides', (SELECT count(*) FROM usuario_permisos_override u WHERE u.usuario_id = p.id),
  'ws_perm_overrides', (SELECT count(*) FROM workspace_usuario_permisos_override w
                        WHERE w.usuario_id = p.id)
)::text
FROM profiles p
JOIN workspace_miembros wm ON wm.usuario_id = p.id AND wm.workspace_id = '{SALA_RH_ID}'
JOIN roles r ON r.id = wm.role_id
LEFT JOIN paquetes_acceso pa ON pa.id = r.paquete_id
JOIN empresa_miembros em ON em.usuario_id = p.id AND em.empresa_id = '{RH_ID}'
WHERE p.id = '{uid}';
""",
            db=db,
        )
    )
    return json.loads(verify)


def write_creds(rows):
    lines = [
        "# Cuentas de prueba PERSISTENTES — Sala Royal Holiday (producción)",
        "# Datos ficticios. No usar para clientes reales.",
        "# NO versionar este archivo.",
        f"# generado={utcnow()}",
        "",
    ]
    for r in rows:
        slug = r["email"].split("@")[0].replace("-", "_").upper()
        lines.append(f"{slug}_EMAIL={r['email']}")
        lines.append(f"{slug}_PASSWORD={r['password']}")
        lines.append(f"{slug}_ROLE={r['role_slug']}")
        lines.append("")
    CREDS.write_text("\n".join(lines), encoding="utf-8")
    try:
        os.chmod(CREDS, 0o600)
    except OSError:
        pass


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("staging", "prod"), default="prod")
    args = parser.parse_args()
    cfg = TARGETS[args.target]

    local = load_env()
    client = ssh_connect(local)
    created = []
    try:
        ola = run(
            client,
            f"docker exec {cfg['db']} psql -U supabase_admin -d postgres -tAc "
            "\"select coalesce(to_regclass('public.rh_premanifiesto_ola_config')::text,'');\"",
        ).strip()
        if not ola:
            raise SystemExit(f"{args.target} no tiene rh_premanifiesto_ola_config. Corre scripts/sync-rh-schema-staging.py primero.")

        old = {}
        if CREDS.is_file():
            for raw in CREDS.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.startswith("#"):
                    k, v = raw.split("=", 1)
                    old[k] = v

        email_to_pass_key = {
            acc["email"]: acc["email"].split("@")[0].replace("-", "_").upper() + "_PASSWORD"
            for acc in ACCOUNTS
        }

        for acc in ACCOUNTS:
            pw_key = email_to_pass_key[acc["email"]]
            password = old.get(pw_key) or "prueba2020"
            print(f"=== {args.target} {acc['email']} ===")
            uid = ensure_auth_user(client, acc["email"], acc["name"], password, env_file=cfg["env_file"])
            info = provision_one(client, acc, uid, password, db=cfg["db"])
            info["password"] = password
            info["uid"] = uid
            info["role_slug"] = acc["role_slug"]
            info["note"] = acc.get("note")
            created.append(info)
            print("  ok", json.dumps({k: info[k] for k in info if k != "password"}))

        if args.target == "prod":
            write_creds(created)
        summary = {
            "createdAt": utcnow(),
            "environment": args.target,
            "sala": SALA_RH_ID,
            "empresa": RH_ID,
            "purged": False,
            "credentialsFile": str(CREDS) if args.target == "prod" else None,
            "accounts": [{k: v for k, v in row.items() if k != "password"} for row in created],
        }
        out = ROOT / "scripts" / f".prueba-rh-lalo-summary-{args.target}.json"
        out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        if args.target == "prod":
            SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"Resumen (sin passwords): {out}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
