"""Conexión SSH al VPS: clave si existe, si no password."""
from __future__ import annotations

import os
from pathlib import Path

import paramiko

DEFAULT_KEY = Path.home() / ".ssh" / "saletse_vps_ed25519"


def load_env_file(root: Path) -> dict:
    data = {}
    for path in (root / ".env.local", root / ".env"):
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            data[k.strip()] = v.strip().strip('"').strip("'")
    return data


def connect_vps(env: dict | None = None) -> paramiko.SSHClient:
    env = env or {}
    host = env.get("VPS_HOST") or os.environ.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER") or os.environ.get("VPS_USER", "root")
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD", "")
    key_path = Path(env.get("VPS_SSH_KEY") or os.environ.get("VPS_SSH_KEY") or DEFAULT_KEY)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_err = None
    if key_path.is_file():
        try:
            client.connect(
                host,
                username=user,
                key_filename=str(key_path),
                timeout=30,
                allow_agent=False,
                look_for_keys=False,
            )
            return client
        except Exception as exc:
            last_err = exc
            client.close()
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if password:
        client.connect(
            host,
            username=user,
            password=password,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )
        return client
    raise RuntimeError(f"No se pudo conectar al VPS (clave/password). Último error: {last_err}")
