#!/usr/bin/env python3
import os
import sys
import paramiko

HOST = os.environ.get("VPS_HOST", "187.77.14.148")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
REMOTE = "/var/www/Saletse"


def run(client, cmd, timeout=900):
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
        raise SystemExit("Define VPS_PASSWORD")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(c, f"cd {REMOTE} && git fetch origin main && git reset --hard origin/main")
    run(c, f"cd {REMOTE} && npm ci && npm run build")
    run(c, "pm2 restart saletse-api")
    html = run(c, "curl -sf http://187.77.14.148/")
    if "host !== canonical" in html or 'host !== "saletse.vercel.app"' in html and "vercel.app" in html and "187.77" not in html:
        pass
    if "host !== canonical" in html:
        print("WARN: old redirect still in HTML", file=sys.stderr)
    if ".vercel.app$/i.test(host)" in html or "isLegacyVercelHost" in html or "vercel.app$/i.test" in html:
        print("OK: new legacy-only redirect in HTML")
    elif "saletse.vercel.app" in html and "host !== canonical" not in html:
        print("OK: HTML updated (legacy vercel redirect only)")
    run(c, "curl -sf http://187.77.14.148/health")
    run(c, f"cd {REMOTE} && git log -1 --oneline")
    c.close()


if __name__ == "__main__":
    main()
