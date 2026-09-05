#!/usr/bin/env python3
"""Inspección de solo lectura: puertos, nginx headers, conteo RLS. No cambia nada."""
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


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


def run(client, cmd, timeout=45):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def main():
    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = env.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER", "root")
    if not password:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)

    cmds = {
        "listen": "ss -tlnp | grep -E ':(80|443|4000|5432|8000|8001|8443|3000|6379|6543)\\s' || true",
        "ufw": "ufw status verbose 2>/dev/null || echo 'NO_UFW'",
        "nginx_headers_root": "curl -sI http://127.0.0.1/ | tr -d '\\r'",
        "nginx_headers_api": "curl -sI http://127.0.0.1/api/v1 | tr -d '\\r'",
        "nginx_headers_login": "curl -sI http://127.0.0.1/login | tr -d '\\r'",
        "docker": "docker ps --format '{{.Names}}\\t{{.Ports}}' 2>/dev/null | head -40",
        "rls": (
            "docker exec saletse-prod-db psql -U postgres -d postgres -tAc "
            "\"select count(*) from pg_policies where schemaname='public'\" 2>/dev/null "
            "|| docker exec $(docker ps --format '{{.Names}}' | grep -E 'db|postgres' | head -1) "
            "psql -U postgres -d postgres -tAc \"select count(*) from pg_policies where schemaname='public'\" 2>/dev/null "
            "|| echo 'RLS_QUERY_FAIL'"
        ),
        "rls_off": (
            "docker exec saletse-prod-db psql -U postgres -d postgres -tAc "
            "\"select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace "
            "where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false order by 1\" 2>/dev/null "
            "|| echo 'RLS_OFF_QUERY_FAIL'"
        ),
    }

    report = {}
    for key, cmd in cmds.items():
        code, out, err = run(client, cmd)
        report[key] = {"code": code, "out": out.strip(), "err": (err or "").strip()[:500]}
        print(f"\n=== {key} (exit {code}) ===")
        print(out[:4000] if out else err[:1000])

    client.close()
    out_path = ROOT / "scripts" / ".audit-vps-readonly.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nEscrito {out_path}")


if __name__ == "__main__":
    main()
