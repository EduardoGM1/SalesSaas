#!/usr/bin/env python3
"""
Borra workspaces personales huérfanos (0 miembros, 0 prospects, 0 sales).
Staging primero; prod solo si staging queda limpio.
Si el conteo pre-delete no es 91/29, aborta sin borrar.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "scripts"
LIST_STAGING = OUT_DIR / ".orphan-personal-ws-staging.json"
LIST_PROD = OUT_DIR / ".orphan-personal-ws-prod.json"
RESULTS = OUT_DIR / ".orphan-personal-ws-delete-results.json"

EXPECTED = {"staging": 29, "prod": 91}
DB = {"staging": "supabase-db", "prod": "saletse-prod-db"}

# Los 7 reales (prod = staging, mismos UUID en este entorno). Nunca están en el DELETE
# porque tienen miembros; se re-verifican antes/después.
PROTECTED_EMAILS = (
    "azaheljared@hotmail.com",
    "santvalero8@gmail.com",
    "ela.ruizm@gmail.com",
    "michell.ruiz.t@gmail.com",
    "eduardolalito99@hotmail.com",
    "chriissua@gmail.com",
    "cuentapremium4minecrafted@gmail.com",
)
PROTECTED_NOMBRES = (
    "azahel alcocer",
    "Santiago Valero",
    "Ela RM",
    "Michell Ruiz",
    "Eduardo",
    "Christian suarez gaona",
    "Agustin alberto abinadi",
)

SQL_BREAKDOWN = r"""
WITH personal AS (
  SELECT w.id, w.nombre, w.created_at, w.estado
  FROM workspaces w
  WHERE w.tipo = 'personal'
),
agg AS (
  SELECT
    p.id,
    p.nombre,
    p.created_at,
    p.estado,
    COUNT(wm.usuario_id) AS member_rows,
    COUNT(pr.id) AS profile_rows,
    COUNT(u.id) AS auth_rows,
    (SELECT COUNT(*) FROM prospects prs WHERE prs.workspace_id = p.id) AS prospects,
    (SELECT COUNT(*) FROM sales s WHERE s.workspace_id = p.id) AS sales
  FROM personal p
  LEFT JOIN workspace_miembros wm ON wm.workspace_id = p.id
  LEFT JOIN profiles pr ON pr.id = wm.usuario_id
  LEFT JOIN auth.users u ON u.id = wm.usuario_id
  GROUP BY p.id, p.nombre, p.created_at, p.estado
)
SELECT json_build_object(
  'personal_total', (SELECT COUNT(*) FROM personal),
  'orphan_no_members', COUNT(*) FILTER (WHERE member_rows = 0),
  'orphan_no_members_with_prospects', COUNT(*) FILTER (WHERE member_rows = 0 AND prospects > 0),
  'orphan_no_members_with_sales', COUNT(*) FILTER (WHERE member_rows = 0 AND sales > 0),
  'delete_eligible', COUNT(*) FILTER (WHERE member_rows = 0 AND prospects = 0 AND sales = 0),
  'real_user_live', COUNT(*) FILTER (WHERE auth_rows > 0)
) FROM agg;
"""

SQL_ELIGIBLE = r"""
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY created_at, id), '[]'::json)
FROM (
  SELECT w.id, w.nombre, w.created_at
  FROM workspaces w
  WHERE w.tipo = 'personal'
    AND NOT EXISTS (SELECT 1 FROM workspace_miembros wm WHERE wm.workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM prospects p WHERE p.workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.workspace_id = w.id)
) t;
"""

SQL_REALS = r"""
SELECT COALESCE(json_agg(row_to_json(t) ORDER BY email), '[]'::json)
FROM (
  SELECT w.id, w.nombre, p.email,
         (SELECT COUNT(*) FROM workspace_miembros wm WHERE wm.workspace_id = w.id)::int AS members,
         (SELECT COUNT(*) FROM prospects pr WHERE pr.workspace_id = w.id)::int AS prospects,
         (SELECT COUNT(*) FROM sales s WHERE s.workspace_id = w.id)::int AS sales,
         (SELECT COUNT(*) FROM auth.users u WHERE u.id = p.id)::int AS auth_rows
  FROM workspaces w
  JOIN workspace_miembros wm ON wm.workspace_id = w.id
  JOIN profiles p ON p.id = wm.usuario_id
  WHERE w.tipo = 'personal'
    AND lower(p.email) IN ({emails})
) t;
"""

SQL_FKS = r"""
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT n.nspname AS schema,
         c.relname AS table_name,
         a.attname AS column_name,
         pg_get_constraintdef(con.oid) AS defn
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = cols.attnum
  WHERE con.contype = 'f'
    AND con.confrelid = 'public.workspaces'::regclass
    AND cols.ord = 1
  ORDER BY 1, 2
) t;
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
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)
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
    return code, out, err


def psql(client, db, sql, timeout=180):
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    code, out, err = run(client, cmd, timeout=timeout)
    if code != 0 or "ERROR:" in out or "ERROR:" in err:
        raise RuntimeError(f"psql fail ({code}): {out[-2500:]}\n{err[-800:]}")
    return out.strip()


def emails_sql():
    return ", ".join(f"'{e}'" for e in PROTECTED_EMAILS)


def snapshot_reals(client, db):
    return json.loads(psql(client, db, SQL_REALS.format(emails=emails_sql())))


def child_counts(client, db, ids):
    if not ids:
        return {}
    id_sql = ", ".join(f"'{i}'" for i in ids)
    fks = json.loads(psql(client, db, SQL_FKS))
    counts = {}
    for fk in fks:
        schema = fk["schema"]
        table = fk["table_name"]
        col = fk["column_name"]
        if schema != "public":
            fq = f'{schema}.{table}'
        else:
            fq = table
        key = f"{fq}.{col}"
        raw = psql(
            client,
            db,
            f"SELECT COUNT(*) FROM {fq} WHERE {col} IN ({id_sql});",
        )
        n = int(raw.splitlines()[-1].strip() or "0")
        if n:
            counts[key] = {"n": n, "defn": fk.get("defn")}
    extra_tables = (
        ("flag_reglas", "alcance_id", "alcance = 'workspace'"),
        ("profiles", "workspace_activo_id", None),
    )
    for table, col, extra in extra_tables:
        where = f"{col} IN ({id_sql})"
        if extra:
            where = f"({where}) AND {extra}"
        raw = psql(client, db, f"SELECT COUNT(*) FROM {table} WHERE {where};")
        n = int(raw.splitlines()[-1].strip() or "0")
        key = f"{table}.{col}"
        if n and key not in counts:
            counts[key] = {"n": n, "defn": extra or "no-fk-scan"}
    return counts


def precheck(client, label):
    db = DB[label]
    expected = EXPECTED[label]
    breakdown = json.loads(psql(client, db, SQL_BREAKDOWN))
    eligible = json.loads(psql(client, db, SQL_ELIGIBLE))
    reals = snapshot_reals(client, db)
    ids = [row["id"] for row in eligible]
    names = {row["nombre"] for row in eligible}
    real_emails = {r["email"].lower() for r in reals}
    real_ids = {r["id"] for r in reals}

    problems = []
    if breakdown.get("orphan_no_members") != expected:
        problems.append(
            f"orphan_no_members={breakdown.get('orphan_no_members')} esperado={expected}"
        )
    if breakdown.get("delete_eligible") != expected:
        problems.append(
            f"delete_eligible={breakdown.get('delete_eligible')} esperado={expected}"
        )
    if len(eligible) != expected:
        problems.append(f"lista IDs={len(eligible)} esperado={expected}")
    if breakdown.get("orphan_no_members_with_prospects"):
        problems.append("hay huérfanos con prospects")
    if breakdown.get("orphan_no_members_with_sales"):
        problems.append("hay huérfanos con sales")
    overlap = real_ids.intersection(ids)
    if overlap:
        problems.append(f"IDs reales en lista de borrado: {sorted(overlap)}")
    missing_emails = set(PROTECTED_EMAILS) - real_emails
    if missing_emails:
        problems.append(f"faltan usuarios reales: {sorted(missing_emails)}")
    hit_nombres = names.intersection(PROTECTED_NOMBRES)
    if hit_nombres:
        problems.append(f"nombres reales en lista de borrado: {sorted(hit_nombres)}")

    children = child_counts(client, db, ids)
    blocking = {}
    for key, meta in children.items():
        if key.startswith("workspace_miembros.") or key.startswith("prospects.") or key.startswith("sales."):
            blocking[key] = meta
    if blocking:
        problems.append(f"FK bloqueantes inesperadas: {blocking}")

    return {
        "label": label,
        "db": db,
        "breakdown": breakdown,
        "eligible": eligible,
        "reals_before": reals,
        "children": children,
        "problems": problems,
        "ok": not problems,
    }


def delete_sql(ids, children):
    id_sql = ", ".join(f"'{i}'" for i in ids)
    child_deletes = [
        "UPDATE profiles SET workspace_activo_id = NULL WHERE workspace_activo_id IN (SELECT id FROM _orphan_ws);",
    ]
    skip_prefix = (
        "workspace_miembros.",
        "prospects.",
        "sales.",
        "workspaces.",
        "profiles.",
    )
    seen = {"profiles"}
    for key, _meta in (children or {}).items():
        if any(key.startswith(p) for p in skip_prefix):
            continue
        table, col = key.rsplit(".", 1)
        if table in seen:
            continue
        seen.add(table)
        extra = ""
        if table.endswith("flag_reglas") and col == "alcance_id":
            extra = " AND alcance = 'workspace'"
        child_deletes.append(
            f"DELETE FROM {table} WHERE {col} IN (SELECT id FROM _orphan_ws){extra};"
        )
    child_sql = "\n".join(child_deletes)
    n = len(ids)
    return f"""
BEGIN;
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE _orphan_ws (id uuid PRIMARY KEY);
INSERT INTO _orphan_ws (id)
SELECT w.id
FROM workspaces w
WHERE w.id IN ({id_sql})
  AND w.tipo = 'personal'
  AND NOT EXISTS (SELECT 1 FROM workspace_miembros wm WHERE wm.workspace_id = w.id)
  AND NOT EXISTS (SELECT 1 FROM prospects p WHERE p.workspace_id = w.id)
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.workspace_id = w.id);
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM _orphan_ws;
  IF n <> {n} THEN
    RAISE EXCEPTION 'delete set mismatch: % vs {n}', n;
  END IF;
END $$;
{child_sql}
DELETE FROM workspaces
WHERE id IN (SELECT id FROM _orphan_ws)
  AND tipo = 'personal'
  AND NOT EXISTS (SELECT 1 FROM workspace_miembros wm WHERE wm.workspace_id = workspaces.id)
  AND NOT EXISTS (SELECT 1 FROM prospects p WHERE p.workspace_id = workspaces.id)
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.workspace_id = workspaces.id);
SET LOCAL session_replication_role = origin;
SELECT 'remaining_in_set', COUNT(*) FROM workspaces WHERE id IN ({id_sql});
COMMIT;
"""


def postcheck(client, label, ids, reals_before):
    db = DB[label]
    id_sql = ", ".join(f"'{i}'" for i in ids)
    remaining = int(
        psql(client, db, f"SELECT COUNT(*) FROM workspaces WHERE id IN ({id_sql});").splitlines()[-1]
    )
    still_orphan = json.loads(psql(client, db, SQL_BREAKDOWN))
    reals_after = snapshot_reals(client, db)
    return {
        "remaining_deleted_ids": remaining,
        "breakdown_after": still_orphan,
        "reals_after": reals_after,
        "reals_unchanged": reals_before == reals_after,
        "ok": remaining == 0
        and still_orphan.get("orphan_no_members") == 0
        and still_orphan.get("delete_eligible") == 0
        and reals_before == reals_after,
    }


def main():
    env = load_env()
    client = ssh_connect(env)
    report = {"startedAt": utcnow(), "pre": {}, "delete": {}}
    try:
        print("=== PRE-CHECK staging + prod (sin DELETE) ===")
        for label in ("staging", "prod"):
            pre = precheck(client, label)
            report["pre"][label] = {
                "breakdown": pre["breakdown"],
                "eligible_count": len(pre["eligible"]),
                "children": pre["children"],
                "reals_before": pre["reals_before"],
                "problems": pre["problems"],
                "ok": pre["ok"],
            }
            path = LIST_STAGING if label == "staging" else LIST_PROD
            path.write_text(
                json.dumps(
                    {
                        "savedAt": utcnow(),
                        "env": label,
                        "count": len(pre["eligible"]),
                        "ids": [r["id"] for r in pre["eligible"]],
                        "rows": pre["eligible"],
                    },
                    indent=2,
                    default=str,
                ),
                encoding="utf-8",
            )
            print(
                f"  {label}: orphan_no_members={pre['breakdown'].get('orphan_no_members')} "
                f"delete_eligible={pre['breakdown'].get('delete_eligible')} "
                f"ids={len(pre['eligible'])} reals={len(pre['reals_before'])} "
                f"children={pre['children']} ok={pre['ok']}"
            )
            if pre["problems"]:
                for p in pre["problems"]:
                    print(f"    PROBLEM: {p}")

        if not report["pre"]["staging"]["ok"] or not report["pre"]["prod"]["ok"]:
            RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
            print("CONTEO CAMBIÓ o hay problemas. No se borra nada.")
            print(f"Listas guardadas: {LIST_STAGING} {LIST_PROD}")
            sys.exit(2)

        staging_ids = json.loads(LIST_STAGING.read_text(encoding="utf-8"))["ids"]
        prod_ids = json.loads(LIST_PROD.read_text(encoding="utf-8"))["ids"]
        staging_reals = report["pre"]["staging"]["reals_before"]
        prod_reals = report["pre"]["prod"]["reals_before"]

        print("\n=== DELETE staging ===")
        raw = psql(
            client,
            DB["staging"],
            delete_sql(staging_ids, report["pre"]["staging"]["children"]),
        )
        print(raw[-500:])
        st_after = postcheck(client, "staging", staging_ids, staging_reals)
        report["delete"]["staging"] = st_after
        print(
            f"  leftover_ids={st_after['remaining_deleted_ids']} "
            f"orphan_after={st_after['breakdown_after'].get('orphan_no_members')} "
            f"reals_unchanged={st_after['reals_unchanged']} ok={st_after['ok']}"
        )
        if not st_after["ok"]:
            RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
            print("Staging no quedó limpio. Prod NO se toca.")
            sys.exit(3)

        print("\n=== DELETE prod ===")
        raw = psql(
            client,
            DB["prod"],
            delete_sql(prod_ids, report["pre"]["prod"]["children"]),
        )
        print(raw[-500:])
        pr_after = postcheck(client, "prod", prod_ids, prod_reals)
        report["delete"]["prod"] = pr_after
        print(
            f"  leftover_ids={pr_after['remaining_deleted_ids']} "
            f"orphan_after={pr_after['breakdown_after'].get('orphan_no_members')} "
            f"reals_unchanged={pr_after['reals_unchanged']} ok={pr_after['ok']}"
        )
        if not pr_after["ok"]:
            RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
            print("Prod post-check FALLÓ.")
            sys.exit(4)

        report["finishedAt"] = utcnow()
        report["pass"] = True
        RESULTS.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(f"\nJSON: {RESULTS}")
        print(f"IDs staging: {LIST_STAGING}")
        print(f"IDs prod: {LIST_PROD}")
    finally:
        client.close()


if __name__ == "__main__":
    main()
