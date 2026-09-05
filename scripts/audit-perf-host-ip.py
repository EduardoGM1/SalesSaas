#!/usr/bin/env python3
import json, os
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
env = {}
for raw in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
    if "=" in raw and not raw.strip().startswith("#"):
        k, v = raw.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env.get("VPS_HOST", "187.77.14.148"), username=env.get("VPS_USER", "root"), password=env["VPS_PASSWORD"], timeout=30, allow_agent=False, look_for_keys=False)

cmd = r"""
python3 - <<'PY'
import subprocess, json

def times(args, n=20):
    samples=[]
    for _ in range(n):
        p=subprocess.run(args, capture_output=True, text=True, timeout=20)
        parts=p.stdout.strip().split()
        if len(parts)>=3:
            samples.append({"status":int(parts[0]),"s":float(parts[1]),"bytes":int(float(parts[2]))})
    ms=[round(x["s"]*1000) for x in samples]
    def pct(p):
        if not ms: return None
        s=sorted(ms)
        idx=min(len(s)-1, max(0, int((p/100)*len(s)+0.999)-1))
        return s[idx]
    return {"n":len(ms),"status":samples[0]["status"] if samples else None,"bytes":samples[0]["bytes"] if samples else None,
            "p50":pct(50),"p95":pct(95),"p99":pct(99),"min":min(ms) if ms else None,"max":max(ms) if ms else None}

def head(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=15).stdout

out={}
out["http_ip_root"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/"])
out["http_ip_login"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/login"])
out["http_ip_health"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/health"])
out["http_ip_api"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/api/v1"])
out["http_ip_geo"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/api/v1/geo/countries"])
out["http_ip_sync401"]=times(["curl","-s","-o","/dev/null","-w","%{http_code} %{time_total} %{size_download}","-H","Host: 187.77.14.148","http://127.0.0.1/api/v1/sync"])
out["headers_http_ip"]=head(["curl","-sI","-H","Host: 187.77.14.148","http://127.0.0.1/"])
out["headers_http_login"]=head(["curl","-sI","-H","Host: 187.77.14.148","http://127.0.0.1/login"])
out["headers_http_api"]=head(["curl","-sI","-H","Host: 187.77.14.148","http://127.0.0.1/api/v1"])
print(json.dumps(out, indent=2))
PY
"""
_, stdout, _ = c.exec_command(cmd, timeout=120)
text = stdout.read().decode("utf-8", "replace")
c.close()
start = text.find("{")
print(text[start:] if start>=0 else text)
(ROOT / "scripts" / ".audit-perf-host-ip.json").write_text(text[start:] if start>=0 else text, encoding="utf-8")
