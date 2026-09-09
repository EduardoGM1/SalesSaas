"""
Conexión SSH al VPS para los scripts de deploy/QA.

- Autenticación: clave (VPS_SSH_KEY o ~/.ssh/saletse_vps_ed25519). El password
  (VPS_PASSWORD) queda solo como fallback legado; sshd ya no lo acepta.
- Host key: se verifica contra ~/.ssh/known_hosts. La primera vez (host
  desconocido) se acepta y se guarda (TOFU); después, un cambio de huella
  aborta la conexión en vez de aceptarla en silencio (anti-MITM).
"""
from __future__ import annotations

import os
from pathlib import Path

import paramiko

DEFAULT_KEY = Path.home() / ".ssh" / "saletse_vps_ed25519"
KNOWN_HOSTS = Path(os.environ.get("VPS_KNOWN_HOSTS") or Path.home() / ".ssh" / "known_hosts")


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


def _new_client(host: str) -> tuple[paramiko.SSHClient, bool]:
    """Cliente con known_hosts cargado. Devuelve (client, host_era_desconocido)."""
    client = paramiko.SSHClient()
    known = False
    if KNOWN_HOSTS.is_file():
        client.load_host_keys(str(KNOWN_HOSTS))
        known = client.get_host_keys().lookup(host) is not None
    if known:
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
    else:
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    return client, not known


def _remember_host(client: paramiko.SSHClient, first_time: bool) -> None:
    if not first_time:
        return
    try:
        KNOWN_HOSTS.parent.mkdir(parents=True, exist_ok=True)
        client.save_host_keys(str(KNOWN_HOSTS))
    except OSError:
        pass


def connect_vps(env: dict | None = None) -> paramiko.SSHClient:
    env = env or {}
    host = env.get("VPS_HOST") or os.environ.get("VPS_HOST", "187.77.14.148")
    user = env.get("VPS_USER") or os.environ.get("VPS_USER", "root")
    password = env.get("VPS_PASSWORD") or os.environ.get("VPS_PASSWORD", "")
    key_path = Path(env.get("VPS_SSH_KEY") or os.environ.get("VPS_SSH_KEY") or DEFAULT_KEY)

    last_err: Exception | None = None
    if key_path.is_file():
        client, first_time = _new_client(host)
        try:
            client.connect(
                host,
                username=user,
                key_filename=str(key_path),
                timeout=30,
                allow_agent=False,
                look_for_keys=False,
            )
            _remember_host(client, first_time)
            return client
        except paramiko.BadHostKeyException:
            client.close()
            raise
        except Exception as exc:  # noqa: BLE001 - se reporta abajo
            last_err = exc
            client.close()
    if password:
        client, first_time = _new_client(host)
        client.connect(
            host,
            username=user,
            password=password,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )
        _remember_host(client, first_time)
        return client
    raise RuntimeError(f"No se pudo conectar al VPS (clave/password). Último error: {last_err}")
