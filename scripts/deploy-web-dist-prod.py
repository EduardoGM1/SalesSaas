#!/usr/bin/env python3
"""Sube apps/web/dist al VPS (backup + reemplazo). No reinicia Express."""
import io
import os
import sys
import tarfile
import time
from datetime import datetime
from pathlib import Path

import paramiko

LOCAL_ROOT = Path(__file__).resolve().parents[1]
DIST = LOCAL_ROOT / "apps" / "web" / "dist"
REMOTE_DIST = "/var/www/Saletse/apps/web/dist"
BACKUP_ROOT = "/opt/saletse-backups"

# Hashes de entry ya retirados. Un 404 hacía que el SW viejo (NetworkFirst)
# rehidratara el JS de Cloud cacheado; un 200 de recuperación fuerza purge+reload.
RETIRED_ENTRY_CHUNKS = ("index-DS5s4Hkv.js",)
RETIRED_ENTRY_STUB = (
    "(function(){"
    'console.warn("[pwa] retired entry chunk, recovering");'
    "var go=function(){location.reload();};"
    "var chain=Promise.resolve();"
    'if("serviceWorker" in navigator){'
    "chain=chain.then(function(){return navigator.serviceWorker.getRegistrations();})"
    ".then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));});"
    "}"
    'if("caches" in window){'
    "chain=chain.then(function(){return caches.keys();})"
    ".then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));});"
    "}"
    "chain.then(go).catch(go);"
    "})();"
)

sys.path.insert(0, str(LOCAL_ROOT / "scripts"))
from spa_selfhosted_guard import assert_dist_selfhosted  # noqa: E402


def load_env():
    data = {}
    for path in (LOCAL_ROOT / ".env.local", LOCAL_ROOT / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


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


def main():
    if not DIST.is_dir() or not (DIST / "index.html").is_file():
        print(f"Falta build: {DIST}", file=sys.stderr)
        sys.exit(1)

    assert_dist_selfhosted(DIST)

    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = env.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER", "root")
    if not password:
        print("Define VPS_PASSWORD en .env.local", file=sys.stderr)
        sys.exit(1)

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    tar_path = LOCAL_ROOT / f".web-dist-{stamp}.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(DIST, arcname="dist")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Conectando a {host}...")
    client.connect(host, username=user, password=password, timeout=30)

    backup = f"{BACKUP_ROOT}/web-dist-pre-rh-moneybox-{stamp}"
    run(client, f"mkdir -p {BACKUP_ROOT}")
    run(client, f"test -d {REMOTE_DIST} && cp -a {REMOTE_DIST} {backup} || echo 'sin dist previo'")

    sftp = client.open_sftp()
    remote_tar = f"/tmp/web-dist-{stamp}.tar.gz"
    sftp.put(str(tar_path), remote_tar)
    sftp.close()

    run(client, f"mkdir -p /var/www/Saletse/apps/web")
    run(client, f"rm -rf {REMOTE_DIST}.next {REMOTE_DIST}.bak 2>/dev/null; rm -rf {REMOTE_DIST} && mkdir -p {REMOTE_DIST}")
    run(client, f"tar xzf {remote_tar} -C /var/www/Saletse/apps/web --strip-components=0")
    run(client, f"rm -f {remote_tar}")
    run(client, f"test -f {REMOTE_DIST}/index.html && echo DIST_OK")

    sftp = client.open_sftp()
    for name in RETIRED_ENTRY_CHUNKS:
        remote_stub = f"{REMOTE_DIST}/assets/{name}"
        with sftp.file(remote_stub, "w") as fh:
            fh.write(RETIRED_ENTRY_STUB)
        print(f"Stub recuperacion: {remote_stub}")
    sftp.close()

    grep = run(
        client,
        "grep -l 'worksheet.royal_holiday.money_box\\|WorksheetRhMoneyBox\\|moneybox' "
        f"{REMOTE_DIST}/assets/*.js 2>/dev/null | head -5 || true",
    )
    matches = [ln for ln in grep.splitlines() if ln.strip().endswith(".js")]
    print(f"\nGrep assets: {len(matches)} archivo(s) con match")
    for ln in matches[:3]:
        print(f"  {ln}")

    run(client, "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1/ && echo")

    client.close()
    tar_path.unlink(missing_ok=True)
    print("\n=== DEPLOY SPA OK (sin reinicio Express) ===")
    print(f"Backup: {backup}")
    if not matches:
        print("WARN: grep no encontró strings — revisar bundle", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
