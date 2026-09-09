#!/usr/bin/env python3
"""Edita un pg_hba.conf en disco (host). Quita 0.0.0.0/0 y trust en loopback."""
import shutil
import sys
from pathlib import Path


def transform(text: str) -> str:
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            lines.append(line)
            continue
        if s.startswith("host") and ("0.0.0.0/0" in s or "::0/0" in s or "::/0" in s):
            continue
        if s.startswith("host") and "127.0.0.1/32" in s and "trust" in s:
            lines.append("host all all 127.0.0.1/32 scram-sha-256")
            continue
        if s.startswith("host") and "::1/128" in s and "trust" in s:
            lines.append("host all all ::1/128 scram-sha-256")
            continue
        lines.append(line)
    extra = [
        "host all all 10.0.0.0/8 scram-sha-256",
        "host all all 172.16.0.0/12 scram-sha-256",
        "host all all 192.168.0.0/16 scram-sha-256",
    ]
    joined = "\n".join(lines)
    for e in extra:
        if e not in joined:
            lines.append(e)
    return "\n".join(lines) + "\n"


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/pg_hba.conf")
    bak = path.with_suffix(path.suffix + ".bak.harden")
    if path.exists() and not bak.exists():
        shutil.copy2(path, bak)
    path.write_text(transform(path.read_text()))
    print(path.read_text())


if __name__ == "__main__":
    main()
