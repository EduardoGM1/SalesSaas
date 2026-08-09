#!/usr/bin/env python3
import os
import paramiko

HOST = os.environ.get("VPS_HOST", "187.77.14.148")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")

CMDS = [
    "lsb_release -a 2>/dev/null || cat /etc/os-release",
    "node -v; npm -v",
    "nginx -v 2>&1",
    "pm2 -v 2>/dev/null || echo no-pm2",
    "systemctl is-active nginx 2>/dev/null",
    "ss -tlnp",
    "ip -4 addr show",
    "ls -la /etc/nginx/sites-enabled/",
    "cat /etc/nginx/sites-enabled/*",
    "ls -la /var/www/ /opt/ 2>/dev/null",
    "pm2 list 2>/dev/null || true",
    "df -h /",
    "free -h",
    "git --version 2>/dev/null || echo no-git",
]

def main():
    if not PASSWORD:
        raise SystemExit("Define VPS_PASSWORD en el entorno.")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=20)
    for cmd in CMDS:
        print("\n=====", cmd, "=====")
        _, stdout, stderr = c.exec_command(cmd, timeout=60)
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out:
            print(out)
        if err:
            print(err)
    c.close()

if __name__ == "__main__":
    main()
