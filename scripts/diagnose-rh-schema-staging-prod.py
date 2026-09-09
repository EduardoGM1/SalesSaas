#!/usr/bin/env python3
"""Diff de esquema Royal Holiday: staging (supabase-db) vs prod (saletse-prod-db)."""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / ".rh-schema-diff-staging-prod.json"


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


def psql(client, db, sql, timeout=120):
    import base64

    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    return run(client, cmd, timeout=timeout).strip()


def qjson(client, db, sql):
    raw = psql(client, db, sql)
    lines = [ln for ln in raw.splitlines() if ln.strip() and not ln.startswith("SET")]
    payload = lines[-1] if lines else raw
    if not payload:
        return None
    return json.loads(payload)


def snapshot(client, db):
    tables = qjson(
        client,
        db,
        """
SELECT coalesce(json_agg(x.table_name ORDER BY x.table_name), '[]'::json)
FROM (
  SELECT c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND (c.relname LIKE 'rh_%' OR c.relname='catalogo_configuracion')
) x;
""",
    ) or []
    columns = {}
    if tables:
        columns = qjson(
            client,
            db,
            """
SELECT coalesce(json_object_agg(table_name, cols), '{}'::json)
FROM (
  SELECT table_name, json_agg(column_name ORDER BY ordinal_position) AS cols
  FROM information_schema.columns
  WHERE table_schema='public'
    AND (table_name LIKE 'rh_%' OR table_name='catalogo_configuracion')
  GROUP BY table_name
) t;
""",
        ) or {}
    functions = qjson(
        client,
        db,
        """
SELECT coalesce(json_agg(DISTINCT p.proname ORDER BY p.proname), '[]'::json)
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'rh_%';
""",
    ) or []
    empresas = qjson(
        client,
        db,
        """
SELECT coalesce(json_agg(json_build_object('id', e.id, 'nombre', e.nombre)), '[]'::json)
FROM empresas e
WHERE e.nombre ILIKE '%Royal Holiday%'
   OR e.id = '0aee9ad0-5a5e-4532-8b86-95b801f8ee88';
""",
    ) or []
    workspaces = qjson(
        client,
        db,
        """
SELECT coalesce(json_agg(json_build_object('id', w.id, 'nombre', w.nombre, 'empresa_id', w.empresa_id, 'tipo', w.tipo)), '[]'::json)
FROM workspaces w
WHERE w.empresa_id = '0aee9ad0-5a5e-4532-8b86-95b801f8ee88'
   OR w.id = 'b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815'
   OR w.nombre ILIKE '%Royal Holiday%';
""",
    ) or []
    flags = qjson(
        client,
        db,
        """
SELECT coalesce(json_agg(json_build_object('clave', f.clave, 'empresa_id', f.empresa_id) ORDER BY f.clave), '[]'::json)
FROM flags f
WHERE f.clave LIKE 'rh.tool%'
   OR f.clave LIKE 'worksheet.royal_holiday%';
""",
    ) or []

    def exists(rel):
        return psql(client, db, f"SELECT to_regclass('public.{rel}') IS NOT NULL;") in ("t", "true")

    ola = {"exists": exists("rh_premanifiesto_ola_config")}
    if ola["exists"]:
        ola["count"] = int(psql(client, db, "SELECT count(*) FROM rh_premanifiesto_ola_config;"))
        ola["by_empresa"] = qjson(
            client,
            db,
            """
SELECT coalesce(json_agg(json_build_object('empresa_id', empresa_id, 'n', n, 'etiquetas', etiquetas)), '[]'::json)
FROM (
  SELECT empresa_id, count(*) AS n, json_agg(etiqueta ORDER BY orden) AS etiquetas
  FROM rh_premanifiesto_ola_config
  GROUP BY empresa_id
) s;
""",
        )
    pm_rows = None
    if exists("rh_premanifiesto"):
        pm_rows = int(psql(client, db, "SELECT count(*) FROM rh_premanifiesto;"))
    catalogo = {"exists": exists("catalogo_configuracion")}
    if catalogo["exists"]:
        catalogo["count"] = int(psql(client, db, "SELECT count(*) FROM catalogo_configuracion;"))
    money = {"exists": exists("rh_money_box_config")}
    if money["exists"]:
        money["count"] = int(psql(client, db, "SELECT count(*) FROM rh_money_box_config;"))
    return {
        "tables": tables,
        "columns": columns,
        "functions": functions,
        "empresas_rh": empresas,
        "workspaces_rh": workspaces,
        "flags_rh": flags,
        "ola_config": ola,
        "pm_rows": pm_rows,
        "catalogo_vigente": catalogo,
        "money_box": money,
    }


def main():
    client = ssh_connect(load_env())
    report = {"startedAt": datetime.now(timezone.utc).isoformat()}
    try:
        staging = snapshot(client, "supabase-db")
        prod = snapshot(client, "saletse-prod-db")
        st_tables = set(staging.get("tables") or [])
        pr_tables = set(prod.get("tables") or [])
        st_fns = set(staging.get("functions") or [])
        pr_fns = set(prod.get("functions") or [])
        report["staging"] = staging
        report["prod"] = prod
        report["tablesOnlyInProd"] = sorted(pr_tables - st_tables)
        report["tablesOnlyInStaging"] = sorted(st_tables - pr_tables)
        report["functionsOnlyInProd"] = sorted(pr_fns - st_fns)
        report["functionsOnlyInStaging"] = sorted(st_fns - pr_fns)
        col_diff = {}
        pr_cols = prod.get("columns") or {}
        st_cols = staging.get("columns") or {}
        for table, cols in pr_cols.items():
            if table not in st_cols:
                continue
            missing = [c for c in cols if c not in (st_cols.get(table) or [])]
            extra = [c for c in (st_cols.get(table) or []) if c not in cols]
            if missing or extra:
                col_diff[table] = {"missingInStaging": missing, "extraInStaging": extra}
        report["columnDiff"] = col_diff
    finally:
        client.close()
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({
        "tablesOnlyInProd": report["tablesOnlyInProd"],
        "functionsOnlyInProd": report["functionsOnlyInProd"][:80],
        "functionsOnlyInProdCount": len(report["functionsOnlyInProd"]),
        "columnDiff": report["columnDiff"],
        "stagingTables": report["staging"].get("tables"),
        "prodTables": report["prod"].get("tables"),
        "stagingEmpresas": report["staging"].get("empresas_rh"),
        "prodEmpresas": report["prod"].get("empresas_rh"),
        "stagingWorkspaces": report["staging"].get("workspaces_rh"),
        "stagingOla": report["staging"].get("ola_config"),
        "prodOla": report["prod"].get("ola_config"),
        "stagingCatalogo": report["staging"].get("catalogo_vigente"),
        "stagingMoneyBox": report["staging"].get("money_box"),
        "prodCatalogo": report["prod"].get("catalogo_vigente"),
        "prodMoneyBox": report["prod"].get("money_box"),
        "stagingFlags": report["staging"].get("flags_rh"),
        "prodFlagsCount": len(report["prod"].get("flags_rh") or []),
        "out": str(OUT),
    }, indent=2, default=str))


if __name__ == "__main__":
    main()
