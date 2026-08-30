#!/usr/bin/env python3
"""
Rebuild del SPA para el vhost 187.77.14.148.

Vite lee `.env.local` del repo (envDir = raíz). Ese archivo sigue apuntando a
Supabase Cloud (rollback / scripts). Un `npm run build:web` local bakea Cloud
en el JS y, si se sube con deploy-web-dist-prod.py, pisa el dist correcto del
corte (2026-08-22).

Este script toma VITE_/NEXT_PUBLIC_ URL+ANON del `.env` de Express en la VPS
(self-hosted) y las pone en process.env (prioridad sobre `.env.local`) antes
de `npm run build:web`.
"""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import paramiko

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from spa_selfhosted_guard import SELF_HOSTED_HOST, assert_dist_selfhosted  # noqa: E402

VPS_ENV = "/var/www/Saletse/.env"
PUBLIC_URL = f"http://{SELF_HOSTED_HOST}"


def load_local_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def fetch_vps_env(local):
    password = local.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = local.get("VPS_HOST", SELF_HOSTED_HOST)
    user = local.get("VPS_USER", "root")
    if not password:
        raise SystemExit("Define VPS_PASSWORD en .env.local")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)
    _, stdout, _ = client.exec_command(f"cat {VPS_ENV}", timeout=30)
    raw = stdout.read().decode("utf-8", errors="replace")
    client.close()
    data = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def pick_public_url(vps):
    for key in ("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PUBLIC_URL"):
        raw = (vps.get(key) or "").strip()
        if not raw:
            continue
        parsed = urlparse(raw)
        if parsed.hostname == SELF_HOSTED_HOST:
            return raw.rstrip("/")
    return PUBLIC_URL


def pick_anon(vps):
    for key in ("VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"):
        val = (vps.get(key) or "").strip()
        if val:
            return val
    raise SystemExit("La VPS no tiene ANON key en /var/www/Saletse/.env")


def main():
    local = load_local_env()
    vps = fetch_vps_env(local)
    public_url = pick_public_url(vps)
    anon = pick_anon(vps)
    parsed = urlparse(public_url)
    if parsed.hostname != SELF_HOSTED_HOST:
        raise SystemExit(f"URL pública inesperada: host={parsed.hostname}")
    if "supabase.co" in public_url:
        raise SystemExit("La VPS devolvió una URL Cloud; abortando.")

    env = os.environ.copy()
    env["VITE_SUPABASE_URL"] = public_url
    env["NEXT_PUBLIC_SUPABASE_URL"] = public_url
    env["VITE_SUPABASE_ANON_KEY"] = anon
    env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = anon
    # OneSignal sigue siendo el mismo app; se toma del .env.local local si existe.
    for key in (
        "VITE_ONESIGNAL_APP_ID",
        "VITE_ONESIGNAL_SAFARI_WEB_ID",
        "ONESIGNAL_APP_ID",
        "ONESIGNAL_SAFARI_WEB_ID",
    ):
        if local.get(key) and key not in env:
            env[key] = local[key]

    print(f"Build SPA con VITE_SUPABASE_URL={public_url} (anon len={len(anon)})")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    proc = subprocess.run(
        [npm, "run", "build:web"],
        cwd=ROOT,
        env=env,
        timeout=300,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)

    dist = ROOT / "apps" / "web" / "dist"
    assert_dist_selfhosted(dist)
    build_id = (dist / "build-id.txt").read_text(encoding="utf-8").strip() if (dist / "build-id.txt").is_file() else "?"
    print(f"SPA self-hosted OK. build-id={build_id}")


if __name__ == "__main__":
    main()
