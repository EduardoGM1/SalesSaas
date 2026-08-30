#!/usr/bin/env python3
"""Verificación Fase 1 Premanifiesto en prod (schema VPS + API pública)."""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
API_BASE = os.environ.get("API_BASE", "http://187.77.14.148").rstrip("/")


def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.strip().startswith("#"):
                    k, v = raw.split("=", 1)
                    data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def psql(client, sql):
    cmd = f'docker exec saletse-prod-db psql -U supabase_admin -d postgres -t -A -c "{sql}"'
    _, stdout, stderr = client.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    code = stdout.channel.recv_exit_status()
    return code, out, err


def main():
    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    if not password:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    results = []

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(env.get("VPS_HOST", "187.77.14.148"), username=env.get("VPS_USER", "root"), password=password, timeout=30)

    checks = [
        ("SCHEMA ola_config", "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='rh_premanifiesto_ola_config')", "t"),
        ("SCHEMA RPC registrar", "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rh_premanifiesto_registrar_pareja')", "t"),
        ("SCHEMA flags PM", f"SELECT CASE WHEN count(*)>=5 THEN 't' ELSE 'f' END FROM flags WHERE empresa_id='{RH_ID}' AND clave LIKE 'rh.tool.premanifiesto%'", "t"),
        ("SCHEMA olas seed", f"SELECT CASE WHEN count(*)>=3 THEN 't' ELSE 'f' END FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}'", "t"),
    ]
    for label, sql, expect in checks:
        code, out, err = psql(client, sql)
        ok = code == 0 and out == expect
        results.append((label, out or err, ok))

    # Concurrencia cupo=1 en ola 3
    fecha = __import__("datetime").date.today().isoformat()
    setup = f"""
BEGIN;
UPDATE rh_premanifiesto_ola_config SET cupo_max=1 WHERE empresa_id='{RH_ID}' AND orden=3;
DELETE FROM rh_premanifiesto WHERE workspace_id='{SALA_ID}' AND fecha='{fecha}' AND ola_config_id=(SELECT id FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}' AND orden=3 LIMIT 1);
COMMIT;
"""
    for stmt in setup.strip().split(";"):
        s = stmt.strip()
        if s:
            psql(client, s)

    conc_sql = f"""
SELECT count(*) FILTER (WHERE ok) AS ok_count,
       count(*) FILTER (WHERE err LIKE '%PM_CUPO_LLENO%') AS cupo_count
FROM (
  SELECT true AS ok, null::text AS err
  FROM rh_premanifiesto_registrar_pareja(
    '{RH_ID}'::uuid, '{SALA_ID}'::uuid, '{fecha}'::date,
    (SELECT id FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}' AND orden=3 LIMIT 1),
    'marketing', 'Conc-seq', (SELECT id FROM profiles WHERE is_super_admin LIMIT 1)
  )
  UNION ALL
  SELECT false, left(m.message, 80)
  FROM (
    SELECT rh_premanifiesto_registrar_pareja(
      '{RH_ID}'::uuid, '{SALA_ID}'::uuid, '{fecha}'::date,
      (SELECT id FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}' AND orden=3 LIMIT 1),
      'marketing', 'Conc-dup', (SELECT id FROM profiles WHERE is_super_admin LIMIT 1)
    )
  ) x
  RIGHT JOIN LATERAL (SELECT 'skip') s ON false
  LEFT JOIN LATERAL (
    SELECT 'PM_CUPO_LLENO' AS message
  ) m ON true
) t;
"""
    # Simpler sequential test on prod
    ola_id_sql = f"SELECT id FROM rh_premanifiesto_ola_config WHERE empresa_id='{RH_ID}' AND orden=3 LIMIT 1"
    _, ola_id, _ = psql(client, ola_id_sql)
    admin_id_sql = "SELECT id FROM profiles WHERE email='eduardolalito99@hotmail.com' LIMIT 1"
    _, user_id, _ = psql(client, admin_id_sql)
    if not user_id:
        _, user_id, _ = psql(client, "SELECT id FROM profiles WHERE is_super_admin=true LIMIT 1")

    def rpc_registrar(nombre):
        sql = (
            "SET LOCAL role authenticated; "
            f"SELECT set_config('request.jwt.claim.sub', '{user_id}', true); "
            "SELECT public.rh_premanifiesto_registrar_pareja("
            f"'{RH_ID}'::uuid,'{SALA_ID}'::uuid,'{fecha}'::date,'{ola_id}'::uuid,"
            f"'marketing','{nombre}','{user_id}'::uuid)"
        )
        return psql(client, sql)

    code1, out1, err1 = rpc_registrar("Conc-A")
    code2, out2, err2 = rpc_registrar("Conc-B")
    ok1 = code1 == 0
    cupo2 = "PM_CUPO_LLENO" in (err2 or out2)
    results.append(("CUPO seq 1er insert", out1[:60] if ok1 else err1[:80], ok1))
    results.append(("CUPO seq 2do PM_CUPO_LLENO", err2[:80] if err2 else out2[:80], cupo2))

    psql(client, f"UPDATE rh_premanifiesto_ola_config SET cupo_max=5 WHERE empresa_id='{RH_ID}' AND orden=3")
    client.close()

    # API health (sin auth — solo ruta nueva existe tras deploy)
    try:
        req = urllib.request.Request(f"{API_BASE}/api/v1/royal-holiday/{RH_ID}/premanifiesto/dia")
        with urllib.request.urlopen(req, timeout=15) as resp:
            api_status = resp.status
    except urllib.error.HTTPError as e:
        api_status = e.code
    except Exception as e:
        api_status = str(e)[:40]
    results.append(("API /premanifiesto/dia (sin auth)", f"HTTP {api_status}", api_status in (401, 403)))

    print("=== Premanifiesto Fase 1 PROD ===")
    failed = 0
    for label, obs, ok in results:
        mark = "PASS" if ok else "FAIL"
        if not ok:
            failed += 1
        print(f"{mark}  {label}: {obs}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
