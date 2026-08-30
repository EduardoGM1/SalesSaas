#!/usr/bin/env python3
"""Aplica migración 0086 rh_money_box_config en prod VPS."""
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
MIG = ROOT / "supabase" / "migrations" / "0086_rh_money_box_config.sql"


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
    sftp.put(str(MIG), "/tmp/0086_rh_money_box_config.sql")
    sftp.close()

    cmd = "docker exec -i saletse-prod-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < /tmp/0086_rh_money_box_config.sql"
    print(f"$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        sys.exit(code)

    verify = "docker exec saletse-prod-db psql -U supabase_admin -d postgres -t -A -c \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='rh_money_box_config');\""
    _, stdout, _ = client.exec_command(verify, timeout=30)
    exists = stdout.read().decode().strip()
    print(f"rh_money_box_config exists: {exists}")
    client.close()


if __name__ == "__main__":
    main()
