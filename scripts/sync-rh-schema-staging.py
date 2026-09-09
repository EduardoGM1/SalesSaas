#!/usr/bin/env python3
"""
Alinea el esquema Royal Holiday de STAGING (supabase-db) con producción.

Causa histórica: 0085/0086/0087/0091 se aplicaron solo en saletse-prod-db
(scripts apply-migration-0086-prod.py / 0087-prod.py). Staging sí tenía 0076–0078
(catálogo Worksheet, comisiones, rh_premanifiesto base) pero no olas/RPC/Money Box.

Uso (idempotente):
  python scripts/sync-rh-schema-staging.py

No copia prospectos ni clientes de prod. Siembra olas genéricas OLA 1/2/3 y
una fila Money Box con defaults del DDL.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / ".rh-schema-sync-staging.json"
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
DB = "supabase-db"

MIGRATIONS = [
    "0085_worksheet_rh_money_box_flag.sql",
    "0086_rh_money_box_config.sql",
    "0087_rh_premanifiesto_olas_flags_rpc.sql",
    "0091_rh_pm_registrar_opc_fields.sql",
]

SEED = f"""
INSERT INTO public.rh_money_box_config (empresa_id)
SELECT '{RH_ID}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_money_box_config WHERE empresa_id = '{RH_ID}'
);

INSERT INTO public.rh_premanifiesto_ola_config (empresa_id, orden, etiqueta, hora, cupo_max)
SELECT '{RH_ID}', v.orden, v.etiqueta, v.hora::time, v.cupo_max
FROM (VALUES
  (1, 'OLA 1', '09:00', 10),
  (2, 'OLA 2', '10:30', 5),
  (3, 'OLA 3', '12:30', 5)
) AS v(orden, etiqueta, hora, cupo_max)
ON CONFLICT (empresa_id, orden) DO NOTHING;

INSERT INTO public.paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, f.id, true
FROM public.paquetes_acceso p
JOIN public.flags f ON f.empresa_id = p.empresa_id
WHERE p.empresa_id = '{RH_ID}'
  AND p.slug = 'opc-lobby'
  AND f.clave IN (
    'worksheet',
    'worksheet.royal_holiday',
    'rh.tool.ops',
    'rh.tool.premanifiesto',
    'rh.tool.premanifiesto.opc'
  )
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;

INSERT INTO public.paquete_flags (paquete_id, flag_id, activo)
SELECT p.id, f.id, true
FROM public.paquetes_acceso p
JOIN public.flags f ON f.empresa_id = p.empresa_id
WHERE p.empresa_id = '{RH_ID}'
  AND p.slug IN ('operacion-base', 'cierre', 'liner')
  AND f.clave IN (
    'worksheet',
    'worksheet.royal_holiday',
    'rh.tool.ops',
    'rh.tool.premanifiesto'
  )
ON CONFLICT (paquete_id, flag_id) DO UPDATE SET activo = true;

UPDATE public.roles r
SET paquete_id = p.id
FROM public.paquetes_acceso p
WHERE r.empresa_id = '{RH_ID}' AND r.slug = 'opc'
  AND p.empresa_id = '{RH_ID}' AND p.slug = 'opc-lobby';

INSERT INTO public.rol_permisos (rol_id, permiso_id)
SELECT opc.id, rp.permiso_id
FROM public.roles opc
JOIN public.roles liner ON liner.empresa_id = opc.empresa_id AND liner.slug = 'liner'
JOIN public.rol_permisos rp ON rp.rol_id = liner.id
WHERE opc.empresa_id = '{RH_ID}' AND opc.slug = 'opc'
ON CONFLICT DO NOTHING;
"""


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


def apply_sql_file(client, filename):
    local = ROOT / "supabase" / "migrations" / filename
    remote = f"/tmp/{filename}"
    sftp = client.open_sftp()
    sftp.put(str(local), remote)
    sftp.close()
    print(f"  applying {filename}")
    out = run(
        client,
        f"cat {remote} | docker exec -i {DB} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1",
        timeout=180,
    )
    return out[-1500:]


def psql(client, sql, timeout=120):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {DB} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    return run(client, cmd, timeout=timeout).strip()


def verify(client):
    checks = {
        "ola_config": psql(client, "SELECT to_regclass('public.rh_premanifiesto_ola_config') IS NOT NULL;"),
        "money_box": psql(client, "SELECT to_regclass('public.rh_money_box_config') IS NOT NULL;"),
        "ola_cols": psql(client, "SELECT count(*) FROM information_schema.columns WHERE table_name='rh_premanifiesto' AND column_name='ola_config_id';"),
        "olas_n": psql(client, f"SELECT count(*) FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}';"),
        "mb_n": psql(client, f"SELECT count(*) FROM rh_money_box_config WHERE empresa_id='{RH_ID}';"),
        "fn_dia": psql(client, "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rh_premanifiesto_dia');"),
        "fn_reg": psql(client, "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rh_premanifiesto_registrar_pareja');"),
        "flag_opc": psql(client, f"SELECT count(*) FROM flags WHERE empresa_id='{RH_ID}' AND clave='rh.tool.premanifiesto.opc';"),
        "flag_mb": psql(client, f"SELECT count(*) FROM flags WHERE empresa_id='{RH_ID}' AND clave='worksheet.royal_holiday.money_box';"),
    }
    ok = (
        checks["ola_config"] in ("t", "true")
        and checks["money_box"] in ("t", "true")
        and checks["ola_cols"] == "1"
        and int(checks["olas_n"]) >= 3
        and int(checks["mb_n"]) >= 1
        and checks["fn_dia"] in ("t", "true")
        and checks["fn_reg"] in ("t", "true")
        and int(checks["flag_opc"]) >= 1
    )
    return ok, checks


def main():
    report = {"startedAt": utcnow(), "migrations": []}
    client = ssh_connect(load_env())
    try:
        ok, checks = verify(client)
        if ok:
            report["skippedMigrations"] = True
            seed_out = psql(client, SEED)
            report["seedAt"] = utcnow()
            report["seedTail"] = seed_out[-400:]
            ok, checks = verify(client)
            report["verify"] = checks
            report["pass"] = ok
            print(json.dumps(checks, indent=2))
            print("STAGING RH SCHEMA already aligned — seed refreshed")
            return
        for name in MIGRATIONS:
            if name.startswith("0087"):
                has_dia = psql(
                    client,
                    "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                    "WHERE n.nspname='public' AND p.proname='rh_premanifiesto_dia');",
                ) in ("t", "true")
                if has_dia:
                    print("  skip 0087 (RPCs already present; re-apply would clash with 0091 overload)")
                    continue
            snippet = apply_sql_file(client, name)
            report["migrations"].append({"file": name, "at": utcnow(), "tail": snippet[-400:]})
        seed_out = psql(client, SEED)
        report["seedAt"] = utcnow()
        report["seedTail"] = seed_out[-400:]
        ok, checks = verify(client)
        report["verify"] = checks
        report["pass"] = ok
        if not ok:
            raise RuntimeError(f"verify FAIL: {json.dumps(checks)}")
        print(json.dumps(checks, indent=2))
        print("STAGING RH SCHEMA PASS")
    finally:
        client.close()
    report["finishedAt"] = utcnow()
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
