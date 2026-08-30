#!/usr/bin/env python3
"""Confirma en prod: código fail-closed + flag RH money_box intacto."""
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"


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


def sh(client, cmd, timeout=60):
    _, o, e = client.exec_command(cmd, timeout=timeout)
    return o.read().decode("utf-8", errors="replace"), e.read().decode("utf-8", errors="replace")


def main():
    env = load_env()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("VPS_HOST", "187.77.14.148"),
        username=env.get("VPS_USER", "root"),
        password=env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD"),
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )

    checks = [
        ("CODE_FLAGS_UNAVAILABLE", f"grep -c WORKSPACE_FLAGS_UNAVAILABLE {REMOTE}/apps/api/src/lib/workspace-permission-rpc.js"),
        ("CODE_SESSION_UNAVAILABLE", f"grep -c flags_status {REMOTE}/apps/api/src/services/session-service.js"),
        ("CODE_NO_GLOBAL_SALA", f"grep -n 'allowGlobalCatalog' {REMOTE}/apps/api/src/services/flags-service.js"),
        ("HEALTH", "curl -sf http://127.0.0.1:4000/health"),
    ]
    for label, cmd in checks:
        out, err = sh(client, cmd)
        print(f"===== {label} =====")
        print((out or err).strip()[:800])

    q = (
        "SELECT r.slug, f.clave, pf.activo "
        "FROM paquete_flags pf "
        "JOIN paquetes_acceso p ON p.id=pf.paquete_id "
        "JOIN flags f ON f.id=pf.flag_id "
        "JOIN empresas e ON e.id=p.empresa_id "
        "JOIN roles r ON r.paquete_id=p.id "
        "WHERE e.nombre ILIKE '%Royal Holiday%' "
        "AND f.clave IN ('worksheet.royal_holiday.money_box','worksheet.royal_holiday','worksheet.money_box') "
        "AND r.slug IN ('liner','cerrador','gerente') "
        "ORDER BY f.clave, r.slug;"
    )
    out, err = sh(
        client,
        "docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -c " + json.dumps(q),
        timeout=45,
    )
    print("===== RH_MONEY_BOX_RESOLVER =====")
    print(out or err)

    print("===== SPA_FLAGS_UNAVAILABLE =====")
    out, _ = sh(
        client,
        "grep -l flagsUnavailable /var/www/Saletse/apps/web/dist/assets/*.js 2>/dev/null | head -5",
    )
    print(out.strip() or "(no match)")
    out, _ = sh(client, "cat /var/www/Saletse/apps/web/dist/build-id.txt 2>/dev/null || echo no-build-id")
    print("BUILD_ID", out.strip())


if __name__ == "__main__":
    main()
