#!/usr/bin/env python3
"""Mediciones de solo lectura desde la VPS (loopback) + HTTPS local. No escribe datos."""
import json
import os
import statistics
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]


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


def run(client, cmd, timeout=90):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


REMOTE_SCRIPT = r"""
set -e
python3 - <<'PY'
import json, subprocess, time, urllib.request, ssl

ctx = ssl._create_unverified_context()

def curl_times(url, n=20, insecure=False):
    samples = []
    for _ in range(n):
        cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total} %{size_download}", url]
        if insecure:
            cmd.insert(1, "-k")
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        parts = p.stdout.strip().split()
        if len(parts) >= 3:
            samples.append({"status": int(parts[0]), "s": float(parts[1]), "bytes": int(float(parts[2]))})
    return samples

def pct(vals, p):
    if not vals:
        return None
    s = sorted(vals)
    idx = min(len(s)-1, max(0, int((p/100)*len(s)+0.999)-1))
    return s[idx]

def summarize(samples):
    ms = [round(x["s"]*1000) for x in samples]
    return {
        "n": len(samples),
        "status": samples[0]["status"] if samples else None,
        "bytes": samples[0]["bytes"] if samples else None,
        "p50": pct(ms, 50),
        "p95": pct(ms, 95),
        "p99": pct(ms, 99),
        "min": min(ms) if ms else None,
        "max": max(ms) if ms else None,
    }

endpoints = [
    ("loopback-health", "http://127.0.0.1:4000/health", False, 20),
    ("loopback-api-v1", "http://127.0.0.1:4000/api/v1", False, 20),
    ("loopback-geo", "http://127.0.0.1:4000/api/v1/geo/countries", False, 20),
    ("loopback-sync-unauth", "http://127.0.0.1:4000/api/v1/sync", False, 20),
    ("loopback-prospects-unauth", "http://127.0.0.1:4000/api/v1/prospects", False, 20),
    ("nginx-https-root", "https://127.0.0.1/", True, 20),
    ("nginx-https-login", "https://127.0.0.1/login", True, 20),
    ("nginx-https-clients", "https://127.0.0.1/clients", True, 20),
    ("nginx-https-health", "https://127.0.0.1/health", True, 20),
]

out = {}
for name, url, insecure, n in endpoints:
    samples = curl_times(url, n, insecure)
    out[name] = {"url": url, **summarize(samples)}

# headers
def headers(url):
    p = subprocess.run(["curl", "-skI", url], capture_output=True, text=True, timeout=15)
    return p.stdout

out["headers_https_root"] = headers("https://127.0.0.1/")
out["headers_https_login"] = headers("https://127.0.0.1/login")
out["headers_https_api"] = headers("https://127.0.0.1/api/v1")
out["headers_https_health"] = headers("https://127.0.0.1/health")

# process on :3000
p = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True)
pid = None
for line in p.stdout.splitlines():
    if ":3000" in line and "pid=" in line:
        import re
        m = re.search(r"pid=(\d+)", line)
        if m:
            pid = m.group(1)
            break
info = {"pid": pid}
if pid:
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            info["cmdline"] = f.read().replace(b"\x00", b" ").decode("utf-8", "replace")
        info["cwd"] = subprocess.run(["readlink", f"/proc/{pid}/cwd"], capture_output=True, text=True).stdout.strip()
    except Exception as e:
        info["err"] = str(e)
out["port3000"] = info

print(json.dumps(out))
PY
"""


def main():
    env = load_env()
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD")
    host = env.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER", "root")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30, allow_agent=False, look_for_keys=False)

    code, out, err = run(client, REMOTE_SCRIPT, timeout=180)
    if code != 0:
        print(err or out, file=sys.stderr)
        sys.exit(code)

    # strip possible noise
    start = out.find("{")
    payload = json.loads(out[start:]) if start >= 0 else {"raw": out}

    code2, policies, _ = run(
        client,
        "docker exec saletse-prod-db psql -U postgres -d postgres -c "
        "\"select count(*) as n from pg_policies where schemaname='public';\" "
        "-c \"select tablename, count(*) as n from pg_policies where schemaname='public' group by 1 order by 1;\"",
        timeout=40,
    )
    payload["pg_policies"] = policies
    payload["pg_policies_exit"] = code2

    client.close()
    dest = ROOT / "scripts" / ".audit-perf-loopback.json"
    dest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in payload if k not in ("headers_https_root", "headers_https_login", "headers_https_api", "headers_https_health", "pg_policies")}, indent=2))
    print("\n--- headers root ---\n", payload.get("headers_https_root", "")[:1200])
    print("\n--- policies ---\n", (payload.get("pg_policies") or "")[:2500])
    print("wrote", dest)


if __name__ == "__main__":
    main()
