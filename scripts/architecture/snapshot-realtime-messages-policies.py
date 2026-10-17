#!/usr/bin/env python3
"""Snapshot SOLO LECTURA de políticas pg_policy en realtime.messages (prod vía VPS).

Uso (backup previo a cualquier apply de 0098):
  python scripts/architecture/snapshot-realtime-messages-policies.py

Salida: %USERPROFILE%\\.saletse-ops\\realtime-messages-policies-snapshot-<UTC>.json
         y copia LATEST (fuera del repo; no escribe secretos).

No muta la BD. No aplica migraciones.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

OPS = Path.home() / ".saletse-ops"
DB = "saletse-prod-db"


def run(client, cmd: str, timeout: int = 120) -> str:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise SystemExit(f"cmd failed ({code}): {out}\n{err}")
    return out


def psql(client, sql: str) -> str:
    import base64

    b64 = base64.b64encode(sql.encode()).decode()
    return run(
        client,
        f"echo {b64} | base64 -d | docker exec -i {DB} "
        "psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -t -A",
    )


def main() -> None:
    OPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    client = connect_vps(load_env_file(ROOT))
    try:
        out = psql(
            client,
            """
SELECT pol.polname || E'\\t' ||
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    ELSE pol.polcmd::text
  END || E'\\t' ||
  coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || E'\\t' ||
  coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'realtime' AND c.relname = 'messages'
ORDER BY pol.polname;
""",
        ).strip()
        policies = []
        for line in out.splitlines():
            if not line.strip():
                continue
            name, cmd, qual, wcheck = (line.split("\t") + ["", "", "", ""])[:4]
            policies.append(
                {
                    "schemaname": "realtime",
                    "tablename": "messages",
                    "policyname": name,
                    "cmd": cmd,
                    "permissive": True,
                    "roles": ["authenticated"],
                    "qual": qual or None,
                    "with_check": wcheck or None,
                }
            )
        payload = {
            "captured_at_utc": stamp,
            "database": DB,
            "relation": "realtime.messages",
            "policy_count": len(policies),
            "policies": policies,
            "notes": "Snapshot solo lectura. Incluye broadcast_expediente si está aplicada.",
        }
        path = OPS / f"realtime-messages-policies-snapshot-{stamp}.json"
        latest = OPS / "realtime-messages-policies-snapshot-LATEST.json"
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        latest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(json.dumps({"ok": True, "path": str(path), "policy_count": len(policies), "names": [p["policyname"] for p in policies]}))
    finally:
        client.close()


if __name__ == "__main__":
    main()
