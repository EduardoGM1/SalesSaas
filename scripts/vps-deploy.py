#!/usr/bin/env python3
"""Despliegue inicial de Salètse en VPS Hostinger."""
import io
import os
import secrets
import sys
import tarfile
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "187.77.14.148")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
REMOTE_DIR = "/var/www/Saletse"
REPO_URL = "https://github.com/EduardoGM1/SalesSaas.git"
WEB_ORIGIN = "http://187.77.14.148"

LOCAL_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "playwright-report",
    "test-results",
    ".vercel",
}
SKIP_FILES = {".env.local", "scripts/vps-audit.py", "scripts/vps-deploy.py"}


def run(client, cmd, timeout=600):
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return out


def upload_tree(sftp, local_root, remote_root):
    for dirpath, dirnames, filenames in os.walk(local_root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel = os.path.relpath(dirpath, local_root)
        remote_dir = remote_root if rel == "." else f"{remote_root}/{rel.replace(os.sep, '/')}"
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            sftp.mkdir(remote_dir)
        for name in filenames:
            if name in SKIP_FILES:
                continue
            local_path = os.path.join(dirpath, name)
            rel_file = os.path.relpath(local_path, local_root).replace(os.sep, "/")
            remote_path = f"{remote_root}/{rel_file}"
            sftp.put(local_path, remote_path)


def read_env_local():
    path = os.path.join(LOCAL_ROOT, ".env.local")
    data = {}
    if not os.path.isfile(path):
        return data
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            data[k.strip()] = v.strip().strip('"')
    return data


def build_env_content(local_env, cron_secret):
    keys = [
        ("NODE_ENV", "production"),
        ("API_PORT", "4000"),
        ("WEB_ORIGIN", WEB_ORIGIN),
        ("COOKIE_SECURE", "false"),
        ("NODE_OPTIONS", "--dns-result-order=ipv4first"),
        ("SUPABASE_URL", local_env.get("SUPABASE_URL", "")),
        ("SUPABASE_ANON_KEY", local_env.get("SUPABASE_ANON_KEY", "")),
        ("SUPABASE_SERVICE_ROLE_KEY", local_env.get("SUPABASE_SERVICE_ROLE_KEY", "")),
        # El SPA se sirve en WEB_ORIGIN; nunca bakear Supabase Cloud aquí.
        ("NEXT_PUBLIC_SUPABASE_URL", WEB_ORIGIN),
        ("NEXT_PUBLIC_SUPABASE_ANON_KEY", local_env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", local_env.get("SUPABASE_ANON_KEY", ""))),
        ("VITE_SUPABASE_URL", WEB_ORIGIN),
        ("VITE_SUPABASE_ANON_KEY", local_env.get("VITE_SUPABASE_ANON_KEY", local_env.get("SUPABASE_ANON_KEY", ""))),
        ("ONESIGNAL_APP_ID", local_env.get("ONESIGNAL_APP_ID", "")),
        ("ONESIGNAL_REST_API_KEY", local_env.get("ONESIGNAL_REST_API_KEY", "")),
        ("VITE_ONESIGNAL_APP_ID", local_env.get("VITE_ONESIGNAL_APP_ID", local_env.get("ONESIGNAL_APP_ID", ""))),
        ("ONESIGNAL_SAFARI_WEB_ID", local_env.get("ONESIGNAL_SAFARI_WEB_ID", "")),
        ("VITE_ONESIGNAL_SAFARI_WEB_ID", local_env.get("VITE_ONESIGNAL_SAFARI_WEB_ID", local_env.get("ONESIGNAL_SAFARI_WEB_ID", ""))),
        ("DATABASE_URL", local_env.get("DATABASE_URL", "")),
        ("CRON_SECRET", cron_secret),
    ]
    lines = ["# Salètse producción VPS — generado por vps-deploy.py", ""]
    for k, v in keys:
        if v:
            lines.append(f"{k}={v}")
    lines.append("")
    return "\n".join(lines)


def main():
    if not PASSWORD:
        print("Define VPS_PASSWORD en el entorno.", file=sys.stderr)
        sys.exit(1)
    local_env = read_env_local()
    cron_secret = secrets.token_urlsafe(32)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Conectando a {HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(client, "apt-get update -qq && apt-get install -y -qq git curl >/dev/null 2>&1 || true")
    run(client, f"mkdir -p {REMOTE_DIR}")

    sftp = client.open_sftp()
    print("Subiendo código (sin node_modules)...")
    upload_tree(sftp, LOCAL_ROOT, REMOTE_DIR)

    env_content = build_env_content(local_env, cron_secret)
    with sftp.file(f"{REMOTE_DIR}/.env", "w") as f:
        f.write(env_content)
    sftp.close()

    run(client, f"cd {REMOTE_DIR} && npm ci", timeout=900)
    run(client, f"cd {REMOTE_DIR} && npm run build", timeout=900)

    run(client, f"cd {REMOTE_DIR} && pm2 delete saletse-api 2>/dev/null || true")
    run(client, f"cd {REMOTE_DIR} && pm2 start deploy/ecosystem.config.cjs")
    run(client, "pm2 save")

    run(client, f"cp {REMOTE_DIR}/deploy/nginx-saletse.conf /etc/nginx/sites-enabled/saletse")
    run(client, "nginx -t")
    run(client, "systemctl reload nginx")

    cron_lines = "\n".join([
        f"CRON_SECRET={cron_secret}",
        f"WEB_ORIGIN={WEB_ORIGIN}",
        f'0 9 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" "$WEB_ORIGIN/api/v1/cron/flush-reminders" >/dev/null 2>&1',
        f'0 10 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" "$WEB_ORIGIN/api/v1/cron/cleanup-support-attachments" >/dev/null 2>&1',
        f'15 8 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" "$WEB_ORIGIN/api/v1/cron/rh-extra-dp" >/dev/null 2>&1',
        "",
    ])
    run(client, f"cat > /etc/cron.d/saletse << 'CRONEOF'\n{cron_lines}CRONEOF")
    run(client, "chmod 644 /etc/cron.d/saletse")

    time.sleep(3)
    health = run(client, f"curl -sf {WEB_ORIGIN}/health")
    pm2 = run(client, "pm2 jlist 2>/dev/null | head -c 500 || pm2 list")

    client.close()
    print("\n=== DESPLIEGUE OK ===")
    print(f"URL: {WEB_ORIGIN}")
    print(f"Health: {health.strip()}")
    print(f"CRON_SECRET guardado en {REMOTE_DIR}/.env y /etc/cron.d/saletse")
    print("\nPendiente en Supabase Dashboard:")
    print(f"  - Site URL / Redirect: {WEB_ORIGIN}")
    print(f"  - Callback: {WEB_ORIGIN}/auth/callback")


if __name__ == "__main__":
    main()
