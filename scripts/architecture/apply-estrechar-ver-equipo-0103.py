#!/usr/bin/env python3
"""
RO + apply 0103 estrechar *:ver_equipo en puestos no-gerente.

Uso:
  python scripts/architecture/apply-estrechar-ver-equipo-0103.py ro
  python scripts/architecture/apply-estrechar-ver-equipo-0103.py apply

No toca predicado RLS / 0101 / 0102. Reportes en ~/.saletse-ops (agregados).
"""
from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

DB = "saletse-prod-db"
MIG = ROOT / "supabase" / "migrations" / "0103_estrechar_ver_equipo_puestos.sql"
SALA = "b0b1c8b0-ddaf-49a3-a3c4-ef92a2507815"
OPS = Path.home() / ".saletse-ops"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def run(client, cmd: str, timeout: int = 180) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def psql(client, sql: str, timeout: int = 180) -> str:
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    code, out, err = run(
        client,
        f"echo {b64} | base64 -d | docker exec -i {DB} "
        f"psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A",
        timeout=timeout,
    )
    if code != 0:
        raise SystemExit(f"psql falló ({code}): {err or out}")
    return out.strip()


def apply_file(client, path: Path) -> str:
    sql = path.read_text(encoding="utf-8")
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    print(f"\n=== APPLY {path.name} ===")
    code, out, err = run(
        client,
        f"echo {b64} | base64 -d | docker exec -i {DB} "
        f"psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1",
        timeout=300,
    )
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if code != 0:
        raise SystemExit(f"apply falló ({code})")
    return out


SQL_FLEET = """
SELECT r.slug
  || '|' || coalesce(r.es_sistema::text,'')
  || '|' || CASE WHEN r.empresa_id IS NULL THEN 'plat' ELSE 'emp' END
  || '|' || count(*)::text
FROM public.rol_permisos rp
JOIN public.roles r ON r.id = rp.rol_id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE p.clave IN (
  'expedientes:ver_equipo','ventas:ver_equipo','dashboard:ver_equipo','metas:ver_equipo'
)
GROUP BY r.slug, r.es_sistema, (r.empresa_id IS NULL)
ORDER BY 1;
"""

SQL_DRIFT_COUNT = """
SELECT count(*)::text
FROM public.rol_permisos rp
JOIN public.roles r ON r.id = rp.rol_id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE p.clave IN (
  'expedientes:ver_equipo','ventas:ver_equipo','dashboard:ver_equipo','metas:ver_equipo'
)
AND NOT (
  r.slug = 'superadmin'
  OR (r.slug = 'gerente' AND r.scope = 'workspace' AND r.empresa_id IS NOT NULL)
);
"""

SQL_SALA_A = f"""
SELECT coalesce(r.slug,'null')
  || '|' || coalesce(wm.rol_en_workspace::text,'')
  || '|' || coalesce(string_agg(DISTINCT p.clave, ',' ORDER BY p.clave), '')
FROM public.workspace_miembros wm
LEFT JOIN public.roles r ON r.id = wm.role_id
LEFT JOIN public.rol_permisos rp ON rp.rol_id = r.id
LEFT JOIN public.permisos p ON p.id = rp.permiso_id
  AND p.clave IN (
    'expedientes:ver_equipo','ventas:ver_equipo','dashboard:ver_equipo','metas:ver_equipo'
  )
WHERE wm.workspace_id = '{SALA}'::uuid
GROUP BY r.slug, wm.rol_en_workspace, wm.usuario_id
ORDER BY r.slug NULLS LAST, wm.rol_en_workspace, wm.usuario_id;
"""

SQL_SALA_C = f"""
SELECT r.slug || '|' || coalesce(string_agg(p.clave, ',' ORDER BY p.clave), '')
FROM public.roles r
JOIN public.workspaces w ON w.empresa_id = r.empresa_id AND w.id = '{SALA}'::uuid
JOIN public.rol_permisos rp ON rp.rol_id = r.id
JOIN public.permisos p ON p.id = rp.permiso_id
WHERE p.clave LIKE '%:ver_equipo'
GROUP BY r.slug
ORDER BY 1;
"""

SQL_DELEG_B = f"""
SELECT count(*)::text
FROM public.permisos_delegados d
JOIN public.permisos p ON p.id = d.permiso_id
JOIN public.workspaces w ON w.id = '{SALA}'::uuid
WHERE p.clave LIKE '%:ver_equipo'
  AND (d.sala_id = w.id OR d.empresa_id = w.empresa_id);
"""

SQL_OVERRIDE = f"""
SELECT count(*)::text
FROM public.workspace_usuario_permisos_override o
JOIN public.permisos p ON p.id = o.permiso_id
WHERE o.otorgado = true
  AND p.clave LIKE '%:ver_equipo'
  AND o.workspace_id = '{SALA}'::uuid;
"""


def parse_pipe_rows(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def inventory(client) -> dict:
    fleet = parse_pipe_rows(psql(client, SQL_FLEET))
    drift = int(psql(client, SQL_DRIFT_COUNT) or "0")
    sala_a = parse_pipe_rows(psql(client, SQL_SALA_A))
    sala_c = parse_pipe_rows(psql(client, SQL_SALA_C))
    deleg = int(psql(client, SQL_DELEG_B) or "0")
    overrides = int(psql(client, SQL_OVERRIDE) or "0")
    return {
        "stamp": STAMP,
        "drift_rol_permisos_rows": drift,
        "fleet_by_slug": fleet,
        "sala_rh_miembros_agg": sala_a,
        "sala_rh_puestos_ver_equipo": sala_c,
        "delegaciones_ver_equipo_count": deleg,
        "overrides_sala_ver_equipo_count": overrides,
    }


def save_report(name: str, data: dict) -> Path:
    OPS.mkdir(parents=True, exist_ok=True)
    path = OPS / name
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"reporte: {path}")
    return path


def main() -> None:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "ro").lower()
    if mode not in ("ro", "apply"):
        raise SystemExit("uso: …py [ro|apply]")
    if mode == "apply" and not MIG.is_file():
        raise SystemExit(f"falta migración: {MIG}")

    client = connect_vps(load_env_file(ROOT))
    try:
        before = inventory(client)
        print(json.dumps(before, indent=2, ensure_ascii=False))
        save_report(f"ver-equipo-ro-before-{STAMP}.json", before)

        if mode == "ro":
            print("\n=== RO OK (sin mutate) ===")
            return

        if before["drift_rol_permisos_rows"] == 0:
            print("\nSin drift en rol_permisos — no apply.")
            save_report(f"ver-equipo-ro-after-{STAMP}.json", before)
            return

        apply_file(client, MIG)
        after = inventory(client)
        print(json.dumps(after, indent=2, ensure_ascii=False))
        save_report(f"ver-equipo-ro-after-{STAMP}.json", after)
        if after["drift_rol_permisos_rows"] != 0:
            raise SystemExit(
                f"post-apply drift={after['drift_rol_permisos_rows']} (esperado 0)"
            )
        print("\n=== APPLY 0103 OK ===")
    finally:
        client.close()


if __name__ == "__main__":
    main()
