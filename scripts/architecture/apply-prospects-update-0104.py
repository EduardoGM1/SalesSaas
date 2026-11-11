#!/usr/bin/env python3
"""
RO + apply 0104 — prospects UPDATE RLS (D7 asignado puede editar).

Uso:
  python scripts/architecture/apply-prospects-update-0104.py ro
  python scripts/architecture/apply-prospects-update-0104.py apply

Reportes Markdown en ~/.saletse-ops/apply-0104-*.md
"""
from __future__ import annotations

import base64
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

DB = "saletse-prod-db"
MIG = ROOT / "supabase" / "migrations" / "0104_prospects_update_asignacion.sql"
POLICY = "prospects_update_tenant_role"
OPS = Path.home() / ".saletse-ops"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

REQUIRED_FUNCTIONS = (
    "user_in_workspace",
    "workspace_has_permission",
    "user_assigned_on_prospect_workflow",
    "share_can_edit",
    "es_gerente_asistente_o_admin",
)

SQL_FUNCTIONS = """
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = ANY(ARRAY[
    'user_in_workspace',
    'workspace_has_permission',
    'user_assigned_on_prospect_workflow',
    'share_can_edit',
    'es_gerente_asistente_o_admin'
  ]::text[])
ORDER BY 1;
"""

SQL_PROSPECT_COUNTS = """
SELECT 'prospects_total|' || count(*)::text FROM public.prospects
UNION ALL
SELECT 'prospects_with_workflow|' || count(DISTINCT pw.prospect_id)::text
FROM public.prospect_workflows pw;
"""

SQL_POLICY = f"""
SELECT coalesce(qual::text, '(null)')
  || E'\\n---WITH CHECK---\\n'
  || coalesce(with_check::text, '(null)')
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'prospects'
  AND policyname = '{POLICY}';
"""


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


def parse_policy_checks(policy_text: str) -> dict:
    norm = re.sub(r"\s+", " ", policy_text.lower())
    has_assigned_fn = "user_assigned_on_prospect_workflow" in norm
    has_ver_equipo = "expedientes:ver_equipo" in norm
    ver_equipo_only_shortcut = bool(
        re.search(
            r"or\s+workspace_has_permission\([^)]*'expedientes:ver_equipo'\)",
            norm,
        )
    )
    return {
        "has_user_assigned_on_prospect_workflow": has_assigned_fn,
        "contains_expedientes_ver_equipo": has_ver_equipo,
        "has_bare_ver_equipo_update_shortcut": ver_equipo_only_shortcut,
    }


def collect_state(client) -> dict:
    fn_rows = [ln.strip() for ln in psql(client, SQL_FUNCTIONS).splitlines() if ln.strip()]
    missing_fns = sorted(set(REQUIRED_FUNCTIONS) - set(fn_rows))
    counts = {}
    for ln in psql(client, SQL_PROSPECT_COUNTS).splitlines():
        if "|" in ln:
            k, v = ln.split("|", 1)
            counts[k] = v.strip()
    policy = psql(client, SQL_POLICY)
    checks = parse_policy_checks(policy) if policy else {}
    return {
        "functions_present": fn_rows,
        "functions_missing": missing_fns,
        "prospect_counts": counts,
        "policy_text": policy,
        "policy_checks": checks,
    }


def write_md_report(name: str, mode: str, before: dict, after: dict | None, notes: list[str]) -> Path:
    OPS.mkdir(parents=True, exist_ok=True)
    path = OPS / name
    lines = [
        f"# apply-0104 ({mode})",
        "",
        f"- stamp_utc: `{STAMP}`",
        f"- migration: `{MIG.name}`",
        f"- policy: `{POLICY}`",
        "",
        "## Funciones requeridas (0101 + helpers)",
        "",
    ]
    lines.append(f"- presentes: `{', '.join(before['functions_present']) or '(ninguna)'}`")
    lines.append(f"- faltantes: `{', '.join(before['functions_missing']) or '(ninguna)'}`")
    lines.append("")
    lines.append("## Conteo prospects (muestra)")
    lines.append("")
    for k, v in sorted(before.get("prospect_counts", {}).items()):
        lines.append(f"- {k}: **{v}**")
    lines.append("")
    lines.append("## Policy actual (`pg_policies`) — fragmento USING/WITH CHECK")
    lines.append("")
    lines.append("```sql")
    snippet = (before.get("policy_text") or "(sin fila)")[:12000]
    lines.append(snippet)
    lines.append("```")
    lines.append("")
    lines.append("## Comprobaciones de texto")
    lines.append("")
    for k, v in sorted(before.get("policy_checks", {}).items()):
        lines.append(f"- {k}: **{v}**")

    if after is not None:
        lines.append("")
        lines.append("## Post-apply")
        lines.append("")
        for k, v in sorted(after.get("policy_checks", {}).items()):
            lines.append(f"- {k}: **{v}**")
        lines.append("")
        lines.append("```sql")
        lines.append((after.get("policy_text") or "")[:12000])
        lines.append("```")

    if notes:
        lines.append("")
        lines.append("## Notas")
        lines.append("")
        for n in notes:
            lines.append(f"- {n}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"reporte: {path}")
    return path


def main() -> None:
    mode = (sys.argv[1] if len(sys.argv) > 1 else "ro").lower()
    if mode not in ("ro", "apply"):
        raise SystemExit("uso: …py [ro|apply]")
    if mode == "apply" and not MIG.is_file():
        raise SystemExit(f"falta migración: {MIG}")

    client = connect_vps(load_env_file(ROOT))
    notes: list[str] = []
    try:
        before = collect_state(client)
        if before["functions_missing"]:
            notes.append(
                "Faltan funciones requeridas; no aplicar 0104 hasta tener 0101 en prod."
            )
            write_md_report(f"apply-0104-{mode}-before-{STAMP}.md", mode, before, None, notes)
            raise SystemExit(f"funciones faltantes: {before['functions_missing']}")

        write_md_report(f"apply-0104-{mode}-before-{STAMP}.md", mode, before, None, notes)

        if mode == "ro":
            print("\n=== RO OK (sin mutate) ===")
            return

        apply_file(client, MIG)
        after = collect_state(client)

        if not after["policy_checks"].get("has_user_assigned_on_prospect_workflow"):
            notes.append("POST-APPLY: policy no contiene user_assigned_on_prospect_workflow.")
        if after["policy_checks"].get("has_bare_ver_equipo_update_shortcut"):
            notes.append(
                "POST-APPLY: aún aparece atajo bare expedientes:ver_equipo en USING."
            )
        elif after["policy_checks"].get("contains_expedientes_ver_equipo"):
            notes.append(
                "expedientes:ver_equipo aparece en el texto pero no como atajo OR sole de 0061."
            )
        else:
            notes.append("Sin expedientes:ver_equipo en policy UPDATE (esperado tras 0104).")

        write_md_report(f"apply-0104-apply-after-{STAMP}.md", "apply", before, after, notes)

        if not after["policy_checks"].get("has_user_assigned_on_prospect_workflow"):
            raise SystemExit("verificación fallida: falta user_assigned_on_prospect_workflow")
        if after["policy_checks"].get("has_bare_ver_equipo_update_shortcut"):
            raise SystemExit("verificación fallida: persiste atajo ver_equipo")

        print("\n=== APPLY 0104 OK ===")
    finally:
        client.close()


if __name__ == "__main__":
    main()
