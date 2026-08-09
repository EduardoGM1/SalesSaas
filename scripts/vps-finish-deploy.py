#!/usr/bin/env python3
import os
import secrets
import sys
import time
import paramiko

HOST = os.environ.get("VPS_HOST", "187.77.14.148")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
REMOTE_DIR = "/var/www/Saletse"
WEB_ORIGIN = "http://187.77.14.148"


def run(client, cmd, timeout=600):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write(f"\n$ {cmd}\n".encode())
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err.strip():
        sys.stdout.buffer.write(err.encode("utf-8", errors="replace"))
    if code != 0:
        raise RuntimeError(f"failed {code}: {cmd}")
    return out


def main():
    if not PASSWORD:
        print("Define VPS_PASSWORD en el entorno.", file=sys.stderr)
        sys.exit(1)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    cron_secret = run(client, f"grep ^CRON_SECRET= {REMOTE_DIR}/.env | cut -d= -f2-").strip()
    if not cron_secret:
        cron_secret = secrets.token_urlsafe(32)
        run(client, f"grep -q ^CRON_SECRET= {REMOTE_DIR}/.env || echo CRON_SECRET={cron_secret} >> {REMOTE_DIR}/.env")

    run(client, f"cd {REMOTE_DIR} && pm2 delete saletse-api 2>/dev/null || true")
    run(client, f"cd {REMOTE_DIR} && pm2 start deploy/ecosystem.config.cjs")
    run(client, "pm2 save")

    run(client, f"cp {REMOTE_DIR}/deploy/nginx-saletse.conf /etc/nginx/sites-enabled/saletse")
    run(client, "nginx -t")
    run(client, "systemctl reload nginx")

    cron_lines = "\n".join([
        f'0 9 * * * root curl -sf -H "Authorization: Bearer {cron_secret}" "{WEB_ORIGIN}/api/v1/cron/flush-reminders" >/dev/null 2>&1',
        f'0 10 * * * root curl -sf -H "Authorization: Bearer {cron_secret}" "{WEB_ORIGIN}/api/v1/cron/cleanup-support-attachments" >/dev/null 2>&1',
        f'15 8 * * * root curl -sf -H "Authorization: Bearer {cron_secret}" "{WEB_ORIGIN}/api/v1/cron/rh-extra-dp" >/dev/null 2>&1',
        "",
    ])
    run(client, f"cat > /etc/cron.d/saletse << 'CRONEOF'\n{cron_lines}CRONEOF")
    run(client, "chmod 644 /etc/cron.d/saletse")

    time.sleep(2)
    run(client, "pm2 list")
    run(client, f"curl -sf {WEB_ORIGIN}/health")
    run(client, f"curl -sfI {WEB_ORIGIN}/ | head -5")
    run(client, f"curl -sf {WEB_ORIGIN}/health/supabase | head -c 400")

    client.close()
    print("\n=== FINISH OK ===")


if __name__ == "__main__":
    main()
