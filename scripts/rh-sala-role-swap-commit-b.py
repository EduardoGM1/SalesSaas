#!/usr/bin/env python3
"""
Cambio de puestos Eduardo (Cerrador→Liner) y Agustín (Marketing→Gerente)
en Sala Royal Holiday + Commit B (0097 + backfill sala).

  python scripts/rh-sala-role-swap-commit-b.py --target staging --dry-run
  python scripts/rh-sala-role-swap-commit-b.py --target prod

Requiere SSH al VPS (scripts/vps_ssh.py).
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / ".rh-sala-role-swap-report.json"

RH_ID = "0aee9ad0-5a5e-4532-8b86-95b801f8ee88"
SALA_ID = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
EDUARDO = "eduardolalito99@hotmail.com"
AGUSTIN = "cuentapremium4minecrafted@gmail.com"

TARGETS = {
    "staging": {"db": "supabase-db"},
    "prod": {"db": "saletse-prod-db"},
}

MEMBER_SNAPSHOT_SQL = f"""
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.email), '[]'::json)
FROM (
  SELECT p.email, p.full_name, wm.usuario_id, wm.role_id, r.nombre AS puesto, r.slug AS puesto_slug,
         wm.rol_en_workspace AS eje, r.paquete_id
  FROM workspace_miembros wm
  JOIN profiles p ON p.id = wm.usuario_id
  LEFT JOIN roles r ON r.id = wm.role_id
  WHERE wm.workspace_id = '{SALA_ID}'
) t;
"""

OVERRIDES_SQL = f"""
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)
FROM (
  SELECT p.email, perm.clave, o.otorgado
  FROM workspace_usuario_permisos_override o
  JOIN permisos perm ON perm.id = o.permiso_id
  JOIN profiles p ON p.id = o.usuario_id
  WHERE o.workspace_id = '{SALA_ID}'
    AND lower(p.email) IN (lower('{AGUSTIN}'), lower('{EDUARDO}'))
) t;
"""

GERENTE_COUNT_SQL = f"""
SELECT count(*)::text FROM workspace_miembros
WHERE workspace_id = '{SALA_ID}' AND rol_en_workspace = 'gerente';
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


def psql(client, db: str, sql: str, timeout=180) -> str:
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1"
    )
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0 or "ERROR:" in out:
        raise RuntimeError(f"psql failed ({code}):\n{out}\n{err}")
    return out


def psql_json(client, db: str, sql: str):
    b64 = base64.b64encode((sql).encode("utf-8")).decode("ascii")
    cmd = (
        f"echo {b64} | base64 -d | docker exec -i {db} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A"
    )
    _, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0 or "ERROR:" in out:
        raise RuntimeError(f"psql failed ({code}):\n{out}\n{err}")
    if not out:
        return []
    return json.loads(out)


def apply_migration(client, db: str):
    local = ROOT / "supabase" / "migrations" / "0097_workspace_eje_desde_puesto.sql"
    remote = "/tmp/0097_workspace_eje_desde_puesto.sql"
    sftp = client.open_sftp()
    sftp.put(str(local), remote)
    sftp.close()
    _, stdout, stderr = client.exec_command(
        f"cat {remote} | docker exec -i {db} psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1",
        timeout=180,
    )
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(out + err)
    return out[-2000:]


def role_changes_sql(dry_run: bool) -> str:
    prefix = "-- dry-run\n" if dry_run else ""
    return prefix + f"""
BEGIN;

-- Respaldo workspace_miembros + paquete_id del rol
INSERT INTO public.migracion_commit_b_eje_puesto_backup (
  workspace_id, usuario_id, email, role_id, rol_slug,
  rol_en_workspace_anterior, rol_en_workspace_nuevo, roles_paquete_id, detalle
)
SELECT
  wm.workspace_id,
  wm.usuario_id,
  p.email,
  wm.role_id,
  r.slug,
  wm.rol_en_workspace,
  public.workspace_rol_en_workspace_desde_slug(r.slug),
  r.paquete_id,
  jsonb_build_object('fase', 'pre_role_swap', 'at', now())
FROM workspace_miembros wm
JOIN profiles p ON p.id = wm.usuario_id
LEFT JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = '{SALA_ID}';

-- 1) Eduardo: Cerrador → Liner (mismo flujo que assignMemberSalaRole)
UPDATE workspace_miembros wm
SET role_id = r_liner.id
FROM roles r_liner
WHERE wm.workspace_id = '{SALA_ID}'
  AND wm.usuario_id = (SELECT id FROM profiles WHERE lower(email) = lower('{EDUARDO}') LIMIT 1)
  AND r_liner.empresa_id = '{RH_ID}'
  AND r_liner.scope = 'workspace'
  AND r_liner.slug = 'liner';

-- 2) Agustín: Marketing → Gerente
UPDATE workspace_miembros wm
SET role_id = r_g.id
FROM roles r_g
WHERE wm.workspace_id = '{SALA_ID}'
  AND wm.usuario_id = (SELECT id FROM profiles WHERE lower(email) = lower('{AGUSTIN}') LIMIT 1)
  AND r_g.empresa_id = '{RH_ID}'
  AND r_g.scope = 'workspace'
  AND r_g.slug = 'gerente';

COMMIT;
"""


def backfill_sala_sql() -> str:
    return f"""
BEGIN;

INSERT INTO public.migracion_commit_b_eje_puesto_backup (
  workspace_id, usuario_id, email, role_id, rol_slug,
  rol_en_workspace_anterior, rol_en_workspace_nuevo, roles_paquete_id, detalle
)
SELECT
  wm.workspace_id,
  wm.usuario_id,
  p.email,
  wm.role_id,
  r.slug,
  wm.rol_en_workspace,
  CASE
    WHEN r.slug = 'gerente' AND public.workspace_es_cuenta_qa_gerente(wm.usuario_id)
      THEN wm.rol_en_workspace
    ELSE public.workspace_rol_en_workspace_desde_slug(r.slug)
  END,
  r.paquete_id,
  jsonb_build_object('fase', 'backfill_sala', 'at', now())
FROM workspace_miembros wm
JOIN profiles p ON p.id = wm.usuario_id
JOIN roles r ON r.id = wm.role_id
WHERE wm.workspace_id = '{SALA_ID}'
  AND wm.rol_en_workspace IS DISTINCT FROM CASE
    WHEN r.slug = 'gerente' AND public.workspace_es_cuenta_qa_gerente(wm.usuario_id)
      THEN wm.rol_en_workspace
    ELSE public.workspace_rol_en_workspace_desde_slug(r.slug)
  END;

UPDATE workspace_miembros wm
SET rol_en_workspace = sub.nuevo
FROM (
  SELECT
    wm2.usuario_id,
    CASE
      WHEN r.slug = 'gerente' AND public.workspace_es_cuenta_qa_gerente(wm2.usuario_id)
        THEN wm2.rol_en_workspace
      ELSE public.workspace_rol_en_workspace_desde_slug(r.slug)
    END AS nuevo
  FROM workspace_miembros wm2
  JOIN roles r ON r.id = wm2.role_id
  WHERE wm2.workspace_id = '{SALA_ID}'
) sub
WHERE wm.workspace_id = '{SALA_ID}'
  AND wm.usuario_id = sub.usuario_id
  AND wm.rol_en_workspace IS DISTINCT FROM sub.nuevo;

COMMIT;
"""


def module_count_sql(email: str) -> str:
    return f"""
SELECT count(DISTINCT f.clave)::text
FROM workspace_miembros wm
JOIN profiles p ON p.id = wm.usuario_id
JOIN roles r ON r.id = wm.role_id
JOIN paquetes_acceso pa ON pa.id = r.paquete_id
JOIN paquete_flags pf ON pf.paquete_id = pa.id AND pf.activo = true
JOIN flags f ON f.id = pf.flag_id
WHERE wm.workspace_id = '{SALA_ID}'
  AND lower(p.email) = lower('{email}');
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=("staging", "prod"), default="prod")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-migration", action="store_true")
    parser.add_argument("--migration-only", action="store_true")
    parser.add_argument("--roles-only", action="store_true")
    args = parser.parse_args()
    db = TARGETS[args.target]["db"]

    sys.path.insert(0, str(ROOT / "scripts"))
    from vps_ssh import connect_vps

    report = {"target": args.target, "db": db, "startedAt": utcnow(), "dryRun": args.dry_run}
    client = connect_vps(load_env())
    try:
        report["before"] = {
            "members": psql_json(client, db, MEMBER_SNAPSHOT_SQL),
            "overrides": psql_json(client, db, OVERRIDES_SQL),
        }
        b64 = base64.b64encode(GERENTE_COUNT_SQL.encode()).decode()
        _, stdout, _ = client.exec_command(
            f"echo {b64} | base64 -d | docker exec -i {db} psql -U supabase_admin -d postgres -t -A",
            timeout=60,
        )
        report["before"]["gerente_count"] = stdout.read().decode().strip()

        if not args.dry_run:
            if not args.skip_migration:
                has_tbl = psql(
                    client,
                    db,
                    "SELECT to_regclass('public.migracion_commit_b_eje_puesto_backup') IS NOT NULL;",
                )
                if "t" not in has_tbl.lower():
                    report["migration_tail"] = apply_migration(client, db)

            if args.migration_only:
                report["finishedAt"] = utcnow()
                OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
                print("Migration-only OK")
                return

            psql(client, db, role_changes_sql(False))
            if not args.roles_only:
                psql(client, db, backfill_sala_sql())

        report["after"] = {
            "members": psql_json(client, db, MEMBER_SNAPSHOT_SQL),
            "overrides": psql_json(client, db, OVERRIDES_SQL),
        }
        _, stdout, _ = client.exec_command(
            f"echo {base64.b64encode(GERENTE_COUNT_SQL.encode()).decode()} | base64 -d | "
            f"docker exec -i {db} psql -U supabase_admin -d postgres -t -A",
            timeout=60,
        )
        report["after"]["gerente_count"] = stdout.read().decode().strip()
        _, stdout, _ = client.exec_command(
            f"echo {base64.b64encode(module_count_sql(AGUSTIN).encode()).decode()} | base64 -d | "
            f"docker exec -i {db} psql -U supabase_admin -d postgres -t -A",
            timeout=60,
        )
        report["agustin_module_flags"] = stdout.read().decode().strip()
        report["finishedAt"] = utcnow()
        report["pass"] = report["after"]["gerente_count"] == "1"
        ag = next(
            (m for m in report["after"]["members"] if (m.get("email") or "").lower() == AGUSTIN.lower()),
            None,
        )
        ed = next(
            (m for m in report["after"]["members"] if (m.get("email") or "").lower() == EDUARDO.lower()),
            None,
        )
        if ag:
            report["pass"] = report["pass"] and ag.get("puesto_slug") == "gerente" and ag.get("eje") == "gerente"
        if ed:
            report["pass"] = report["pass"] and ed.get("puesto_slug") == "liner" and ed.get("eje") == "vendedor"
    finally:
        client.close()

    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nWrote {OUT}")
    if args.dry_run:
        print("DRY-RUN snapshot only (no DB writes)")
        return
    if not report.get("pass"):
        raise SystemExit("VERIFY FAIL")
    print("VERIFY PASS")


if __name__ == "__main__":
    main()
