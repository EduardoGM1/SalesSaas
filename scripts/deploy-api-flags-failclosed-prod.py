#!/usr/bin/env python3
"""Sube el fail-closed de flags (+ helper de permisos del que depende) a prod y reinicia pm2."""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
BACKUP_ROOT = "/opt/saletse-backups"
API_FILES = [
    "apps/api/src/lib/service-error.js",
    "apps/api/src/lib/workspace-permission-rpc.js",
    "apps/api/src/lib/workspace-scope.js",
    "apps/api/src/routes/route-utils.js",
    "apps/api/src/routes/v1.js",
    "apps/api/src/services/session-service.js",
    "apps/api/src/services/flags-service.js",
    "apps/api/src/services/modulos-custom-service.js",
    "apps/api/src/services/prospects-service.js",
    "apps/api/src/services/prospect-participants-service.js",
    "apps/api/src/services/workspace-service.js",
    "apps/api/src/services/delegacion-service.js",
]


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


def run(client, cmd, timeout=120):
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        sys.stdout.buffer.write((out.rstrip() + "\n").encode("utf-8", errors="replace"))
    if err.strip():
        sys.stderr.buffer.write((err.rstrip() + "\n").encode("utf-8", errors="replace"))
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return out


def main():
    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = env.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER", "root")
    if not password:
        print("Define VPS_PASSWORD en .env.local", file=sys.stderr)
        sys.exit(1)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup = f"{BACKUP_ROOT}/api-flags-failclosed-{stamp}"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)

    run(client, f"mkdir -p {backup} {REMOTE}/apps/api/src/lib")
    for rel in API_FILES:
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        run(client, f"test -f {remote} && cp -a {remote} {backup}/ || echo 'nuevo:{rel}'")

    sftp = client.open_sftp()
    for rel in API_FILES:
        local = ROOT / rel
        if not local.is_file():
            raise SystemExit(f"Falta archivo local: {local}")
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"upload {rel}")
        sftp.put(str(local), remote)
    sftp.close()

    run(client, f"grep -n WORKSPACE_FLAGS_UNAVAILABLE {REMOTE}/apps/api/src/lib/workspace-permission-rpc.js | head")
    run(client, f"grep -n resolver_flag {REMOTE}/apps/api/src/lib/workspace-scope.js | head")
    run(client, f"cd {REMOTE} && pm2 restart saletse-api")
    run(client, "sleep 2 && curl -sf http://127.0.0.1:4000/health")
    client.close()
    print(f"\nAPI flags fail-closed desplegado. Backup: {backup}")


if __name__ == "__main__":
    main()
