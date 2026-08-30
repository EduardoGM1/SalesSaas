"""P1–P3: sube API (rate limit, X-Powered-By, JSON 8mb) + headers Nginx. No toca P4/P5/P6."""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
REMOTE = "/var/www/Saletse"
API_FILES = [
    "apps/api/src/app.js",
    "apps/api/src/routes/auth.js",
    "apps/api/src/middleware/rate-limit.js",
    "apps/api/src/lib/http-limits.js",
    "apps/api/src/lib/auth-rate-limits.js",
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
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)

    run(client, "mkdir -p /opt/saletse-backups /etc/nginx/snippets")
    run(
        client,
        f"cp -a /etc/nginx/sites-enabled/saletse /opt/saletse-backups/nginx-saletse-pre-p1p3-{stamp}.conf",
    )

    sftp = client.open_sftp()
    for rel in API_FILES:
        local = ROOT / rel
        remote = f"{REMOTE}/{rel.replace(chr(92), '/')}"
        print(f"upload {rel}")
        sftp.put(str(local), remote)

    print("upload nginx snippet + vhost")
    sftp.put(
        str(ROOT / "deploy/nginx-saletse-security-headers.conf"),
        "/etc/nginx/snippets/saletse-security-headers.conf",
    )
    sftp.put(str(ROOT / "deploy/nginx-saletse.conf"), "/etc/nginx/sites-enabled/saletse")
    sftp.close()

    run(client, "nginx -t")
    run(client, "systemctl reload nginx")
    run(client, f"cd {REMOTE} && pm2 restart saletse-api")
    run(client, "sleep 2 && curl -sf http://127.0.0.1:4000/health")
    client.close()
    print("\nP1–P3 desplegados (nginx reload + pm2 restart).")


if __name__ == "__main__":
    main()
