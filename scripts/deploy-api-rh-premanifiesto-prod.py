#!/usr/bin/env python3
"""Sube archivos API Premanifiesto Fase 1 al VPS y reinicia pm2."""
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
FILES = [
    "apps/api/src/services/royal-holiday-service.js",
    "apps/api/src/services/rh-access.js",
    "apps/api/src/services/empresa-roles-seed.js",
    "apps/api/src/routes/v1.js",
    "apps/api/src/routes/admin.js",
]


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
    for rel in FILES:
        local = ROOT / rel
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"upload {rel}")
        sftp.put(str(local), remote)
    sftp.close()

    cmd = f"cd {REMOTE} && pm2 restart saletse-api && sleep 2 && curl -sf http://127.0.0.1:3000/health || curl -sf http://127.0.0.1:3001/health"
    print(f"$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err, file=sys.stderr)
    code = stdout.channel.recv_exit_status()
    client.close()
    if code != 0:
        sys.exit(code)
    print("API reiniciada OK")


if __name__ == "__main__":
    main()
