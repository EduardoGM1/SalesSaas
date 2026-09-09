#!/usr/bin/env python3
"""
Despliega la API en el VPS desde origin/main: git reset, npm ci, nginx, PM2.
Usa clave SSH (scripts/vps_ssh.py). No toca apps/web/dist (ver deploy-web-dist-prod.py).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from vps_ssh import connect_vps, load_env_file  # noqa: E402

REMOTE = "/var/www/Saletse"


def run(client, cmd, timeout=900, check=True):
    print(f"\n$ {cmd}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    enc = sys.stdout.encoding or "utf-8"
    if out.strip():
        print(out.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    if err.strip():
        print(err.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"), file=sys.stderr)
    if check and code != 0:
        raise SystemExit(f"falló ({code}): {cmd}")
    return out


def main():
    client = connect_vps(load_env_file(ROOT))
    try:
        run(client, f"cd {REMOTE} && git fetch -q origin main && git reset -q --hard origin/main && git log -1 --oneline")
        run(client, f"cd {REMOTE} && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3", timeout=900)
        run(
            client,
            f"cp {REMOTE}/deploy/nginx-saletse-security-headers.conf /etc/nginx/snippets/saletse-security-headers.conf"
            f" && cp {REMOTE}/deploy/nginx-saletse-ratelimit.conf /etc/nginx/conf.d/saletse-ratelimit.conf"
            f" && cp {REMOTE}/deploy/nginx-saletse.conf /etc/nginx/sites-enabled/saletse"
            " && nginx -t && systemctl reload nginx",
        )
        run(client, f"pm2 restart saletse-api --update-env >/dev/null && pm2 save >/dev/null && sleep 2 && pm2 jlist | python3 -c \"import json,sys; [print(p['name'], p['pm2_env']['status'], p['pm2_env']['restart_time']) for p in json.load(sys.stdin) if p['name'].startswith('saletse')]\"")
        run(client, "curl -sf http://127.0.0.1:4000/health && echo && curl -s -o /dev/null -w 'public /health %{http_code}\\n' -H 'Host: 187.77.14.148' http://127.0.0.1/health")
        run(client, "pm2 logs saletse-api --lines 15 --nostream 2>/dev/null | tail -20", check=False)
    finally:
        client.close()
    print("\n=== DEPLOY API OK ===")


if __name__ == "__main__":
    main()
