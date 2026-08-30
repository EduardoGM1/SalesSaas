#!/usr/bin/env python3
"""Aplica migración 0087 rh_premanifiesto_olas_flags_rpc en prod VPS."""
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations" / "0087_rh_premanifiesto_olas_flags_rpc.sql"


def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                if "=" in raw and not raw.strip().startswith("#"):
                    k, v = raw.split("=", 1)
                    data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def main():
    if not MIG.is_file():
        print(f"No existe {MIG}", file=sys.stderr)
        sys.exit(1)
    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = env.get("VPS_HOST", "187.77.14.148")
    if not password:
        print("Falta VPS_PASSWORD", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=env.get("VPS_USER", "root"), password=password, timeout=30)
    sftp = client.open_sftp()
    sftp.put(str(MIG), "/tmp/0087_rh_premanifiesto_olas_flags_rpc.sql")
    sftp.close()

    cmd = (
        "docker exec -i saletse-prod-db psql -U supabase_admin -d postgres "
        "-v ON_ERROR_STOP=1 < /tmp/0087_rh_premanifiesto_olas_flags_rpc.sql"
    )
    print(f"$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        sys.exit(code)

    checks = [
        (
            "rh_premanifiesto_ola_config",
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='rh_premanifiesto_ola_config');",
        ),
        (
            "rh_premanifiesto_registrar_pareja",
            "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rh_premanifiesto_registrar_pareja');",
        ),
    ]
    for label, sql in checks:
        _, stdout, _ = client.exec_command(
            f"docker exec saletse-prod-db psql -U supabase_admin -d postgres -t -A -c \"{sql}\"",
            timeout=30,
        )
        exists = stdout.read().decode().strip()
        print(f"{label} exists: {exists}")
    client.close()


if __name__ == "__main__":
    main()
