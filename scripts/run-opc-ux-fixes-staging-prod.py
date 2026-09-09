#!/usr/bin/env python3
"""
Smoke UX OPC (4 puntos) contra staging (Vite local + API :4001) y, si PASS,
build+deploy SPA prod + mismo smoke en http://187.77.14.148.
"""
from __future__ import annotations

import json
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
PLAY = ROOT / "scripts" / "qa-opc-ux-clickthrough.mjs"
REPORT = ROOT / "scripts" / ".qa-opc-ux-staging-prod.json"
LOCAL_PORT = 14001
VITE_PORT = 5178
PASSWORD = "prueba2020"

ROLES = [
    ("opc", "prueba-opc@saletse-test.com"),
    ("liner", "prueba-liner@saletse-test.com"),
    ("cerrador", "prueba-cerrador@saletse-test.com"),
    ("gerente", "prueba-gerente@saletse-test.com"),
]


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def load_env():
    data = {}
    for path in (ROOT / ".env.local", ROOT / ".env", ROOT / "scripts" / ".env.prueba-rh-lalo"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def ssh_connect(env):
    pwd = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    if not pwd:
        sys.exit("Falta VPS_PASSWORD")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        env.get("VPS_HOST", "187.77.14.148"),
        username=env.get("VPS_USER", "root"),
        password=pwd,
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    return client


def run(client, cmd, timeout=180):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"cmd failed ({code}): {cmd}\n{out}\n{err}")
    return out


class ForwardHandler(socketserver.BaseRequestHandler):
    chain_host = "127.0.0.1"
    chain_port = 4001
    ssh_transport = None

    def handle(self):
        try:
            chan = self.ssh_transport.open_channel(
                "direct-tcpip",
                (self.chain_host, self.chain_port),
                self.request.getpeername(),
            )
        except Exception:
            return
        if chan is None:
            return

        def pump(src, dst):
            try:
                while True:
                    data = src.recv(65536)
                    if not data:
                        break
                    if hasattr(dst, "sendall"):
                        dst.sendall(data)
                    else:
                        view = data
                        while view:
                            sent = dst.send(view)
                            view = view[sent:]
            except Exception:
                pass
            try:
                dst.shutdown(socket.SHUT_WR)
            except Exception:
                pass

        t1 = threading.Thread(target=pump, args=(self.request, chan), daemon=True)
        t2 = threading.Thread(target=pump, args=(chan, self.request), daemon=True)
        t1.start()
        t2.start()
        t1.join()
        t2.join()
        try:
            chan.close()
        except Exception:
            pass
        try:
            self.request.close()
        except Exception:
            pass


def start_tunnel(transport, local_port, remote_port=4001):
    class Fwd(socketserver.ThreadingTCPServer):
        daemon_threads = True
        allow_reuse_address = True

    ForwardHandler.ssh_transport = transport
    ForwardHandler.chain_port = remote_port
    server = Fwd(("127.0.0.1", local_port), ForwardHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def kill_port(port):
    if os.name == "nt":
        subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    f"$conns = Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue "
                    "| Select-Object -ExpandProperty OwningProcess -Unique; "
                    "foreach ($p in $conns) { if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }"
                ),
            ],
            check=False,
            capture_output=True,
        )
        time.sleep(1)
        return
    subprocess.run(["fuser", "-k", f"{port}/tcp"], check=False, capture_output=True)


def start_vite():
    env = os.environ.copy()
    env["VITE_API_PROXY"] = f"http://127.0.0.1:{LOCAL_PORT}"
    kill_port(VITE_PORT)
    cmd = f"npm run dev -w @salesapp/web -- --host 127.0.0.1 --port {VITE_PORT} --strictPort"
    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True,
    )
    started = time.time()
    buf = []
    while time.time() - started < 90:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        buf.append(line)
        if f"localhost:{VITE_PORT}" in line or f"127.0.0.1:{VITE_PORT}" in line:
            return proc
    proc.kill()
    raise RuntimeError("vite no arrancó:\n" + "".join(buf[-40:]))


def smoke_role(base, role, email, shots, results):
    env = os.environ.copy()
    env.update({
        "PLAYWRIGHT_BASE_URL": base,
        "QA_OPC_UX_EMAIL": email,
        "QA_OPC_UX_PASSWORD": PASSWORD,
        "QA_OPC_UX_ROLE": role,
        "QA_OPC_UX_SHOTS": str(shots),
        "QA_OPC_UX_RESULTS": str(results),
    })
    proc = subprocess.run(["node", str(PLAY)], cwd=str(ROOT), env=env)
    payload = {}
    if results.is_file():
        payload = json.loads(results.read_text(encoding="utf-8"))
    return proc.returncode == 0 and payload.get("pass") is True, payload


def main():
    report = {"startedAt": utcnow(), "staging": {}, "prod": {}}
    if os.environ.get("OPC_UX_SKIP_SETUP") != "1":
        print(f"=== SCHEMA SYNC {utcnow()} ===")
        sync = subprocess.run([sys.executable, str(ROOT / "scripts" / "sync-rh-schema-staging.py")], cwd=str(ROOT))
        report["schemaSyncCode"] = sync.returncode
        if sync.returncode != 0:
            raise SystemExit("sync-rh-schema-staging FAIL")

        print(f"=== PROVISION STAGING {utcnow()} ===")
        prov = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "provision-prueba-rh-roles.py"), "--target", "staging"],
            cwd=str(ROOT),
        )
        report["provisionStagingCode"] = prov.returncode
        if prov.returncode != 0:
            raise SystemExit("provision staging FAIL")
    else:
        report["schemaSyncCode"] = "skipped"
        report["provisionStagingCode"] = "skipped"

    env = load_env()
    roles = ROLES
    only = os.environ.get("OPC_UX_ROLES")
    if only:
        wanted = {x.strip() for x in only.split(",") if x.strip()}
        roles = [r for r in ROLES if r[0] in wanted]
    client = ssh_connect(env)
    if os.environ.get("OPC_UX_RESTART_API") == "1":
        run(client, "pm2 restart saletse-api-staging && sleep 5")
    health = run(client, "curl -sf http://127.0.0.1:4001/health")
    report["stagingHealth"] = health.strip()
    if '"ok":true' not in health.replace(" ", ""):
        raise RuntimeError(f"staging health fail {health}")

    kill_port(LOCAL_PORT)
    tunnel = start_tunnel(client.get_transport(), LOCAL_PORT, 4001)
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{LOCAL_PORT}/health", timeout=15) as resp:
            tun_health = resp.read().decode("utf-8", errors="replace")
        report["tunnelHealth"] = tun_health.strip()
        if '"ok":true' not in tun_health.replace(" ", ""):
            raise RuntimeError(f"tunnel health fail {tun_health}")
        print(f"tunnel health ok via :{LOCAL_PORT}")
    except Exception as exc:
        raise RuntimeError(f"túnel SSH no responde en :{LOCAL_PORT}: {exc}") from exc
    vite = None
    try:
        print(f"=== STAGING SMOKE {utcnow()} ===")
        report["stagingStartedAt"] = utcnow()
        vite = start_vite()
        base = f"http://127.0.0.1:{VITE_PORT}"
        stg_ok = True
        for role, email in roles:
            shots = ROOT / "scripts" / f".qa-opc-ux-stg-{role}-shots"
            results = ROOT / "scripts" / f".qa-opc-ux-stg-{role}.json"
            shots.mkdir(parents=True, exist_ok=True)
            ok, payload = smoke_role(base, role, email, shots, results)
            report["staging"][role] = {"pass": ok, "finishedAt": utcnow(), "flow": payload.get("flow")}
            print(f"  staging {role}: {'PASS' if ok else 'FAIL'}")
            stg_ok = stg_ok and ok
        report["stagingPass"] = stg_ok
        report["stagingFinishedAt"] = utcnow()
        if not stg_ok:
            raise SystemExit("staging UX FAIL — no se toca prod")

        print(f"=== PROVISION PROD {utcnow()} ===")
        prov_prod = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "provision-prueba-rh-roles.py"), "--target", "prod"],
            cwd=str(ROOT),
        )
        report["provisionProdCode"] = prov_prod.returncode
        if prov_prod.returncode != 0:
            raise SystemExit("provision prod FAIL")

        print(f"=== PROD BUILD+DEPLOY {utcnow()} ===")
        report["prodBuildStartedAt"] = utcnow()
        b = subprocess.run([sys.executable, str(ROOT / "scripts" / "build-web-vps-prod.py")], cwd=str(ROOT))
        if b.returncode != 0:
            raise SystemExit("build-web FAIL")
        d = subprocess.run([sys.executable, str(ROOT / "scripts" / "deploy-web-dist-prod.py")], cwd=str(ROOT))
        if d.returncode != 0:
            raise SystemExit("deploy-web FAIL")
        report["prodDeployedAt"] = utcnow()

        print(f"=== PROD SMOKE {utcnow()} ===")
        prod_ok = True
        for role, email in roles:
            shots = ROOT / "scripts" / f".qa-opc-ux-prod-{role}-shots"
            results = ROOT / "scripts" / f".qa-opc-ux-prod-{role}.json"
            shots.mkdir(parents=True, exist_ok=True)
            ok, payload = smoke_role("http://187.77.14.148", role, email, shots, results)
            report["prod"][role] = {"pass": ok, "finishedAt": utcnow(), "flow": payload.get("flow")}
            print(f"  prod {role}: {'PASS' if ok else 'FAIL'}")
            prod_ok = prod_ok and ok
        report["prodPass"] = prod_ok
        report["prodFinishedAt"] = utcnow()
        if not prod_ok:
            raise SystemExit("prod UX FAIL")
    finally:
        if vite:
            vite.terminate()
        tunnel.shutdown()
        client.close()
    report["finishedAt"] = utcnow()
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {REPORT} stagingPass={report.get('stagingPass')} prodPass={report.get('prodPass')}")


if __name__ == "__main__":
    main()
