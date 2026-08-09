#!/usr/bin/env python3
import os
import sys
import paramiko

HOST = os.environ.get("VPS_HOST", "187.77.14.148")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")

def run(client, cmd, timeout=600):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write(f"\n$ {cmd}\n".encode())
    sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
    if err.strip():
        sys.stdout.buffer.write(err.encode("utf-8", errors="replace"))
    return code, out

if not PASSWORD:
    raise SystemExit("Define VPS_PASSWORD en el entorno.")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

cmds = [
    "test -f /var/www/Saletse/apps/web/dist/index.html && echo BUILD_OK || echo BUILD_MISSING",
    "ls -la /var/www/Saletse/apps/web/dist/ | head -5",
    "pm2 list",
    "test -f /etc/nginx/sites-enabled/saletse && echo NGINX_OK || echo NGINX_MISSING",
    "curl -sf http://187.77.14.148/health || echo HEALTH_FAIL",
]
for cmd in cmds:
    run(c, cmd)
c.close()
