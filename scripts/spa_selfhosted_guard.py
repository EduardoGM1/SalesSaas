"""Guardas del SPA: el bundle de prod no puede llevar hosts de Supabase Cloud."""
import re
from pathlib import Path

CLOUD_PROJECT_REF = "ihuyisrplbmgxnvkpifm"
# URL real de API Cloud (no el wildcard "*.supabase.co" que trae @supabase/auth-js).
CLOUD_URL_RE = re.compile(r"https?://[a-z0-9-]+\.supabase\.co", re.I)
SELF_HOSTED_HOST = "187.77.14.148"


def scan_dist(dist: Path) -> tuple[list[str], list[str]]:
    """Devuelve (archivos con Cloud, archivos con IP pública)."""
    cloud_files = []
    ip_files = []
    if not dist.is_dir():
        raise FileNotFoundError(f"No existe dist: {dist}")
    for path in dist.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".js", ".html", ".css", ".json", ".webmanifest"} and path.name != "sw.js":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = str(path.relative_to(dist))
        if CLOUD_PROJECT_REF in text or CLOUD_URL_RE.search(text):
            cloud_files.append(rel)
        if SELF_HOSTED_HOST in text:
            ip_files.append(rel)
    return cloud_files, ip_files


def assert_dist_selfhosted(dist: Path) -> None:
    cloud_files, ip_files = scan_dist(dist)
    if cloud_files:
        raise SystemExit(
            "El bundle SPA contiene hosts de Supabase Cloud ("
            + ", ".join(cloud_files)
            + "). Rebuild con VITE_SUPABASE_URL=http://187.77.14.148 (keys de la VPS), "
            "no con .env.local de Cloud."
        )
    html = dist / "index.html"
    if html.is_file():
        html_text = html.read_text(encoding="utf-8", errors="ignore")
        for retired in ("index-DS5s4Hkv.js",):
            if f"assets/{retired}" in html_text:
                raise SystemExit(
                    f"index.html apunta al chunk retirado {retired}. "
                    "Rebuild self-hosted; no desplegar."
                )
    js_ip = [f for f in ip_files if f.endswith(".js")]
    if not js_ip:
        raise SystemExit(
            "El bundle SPA no incrustó http://187.77.14.148. "
            "VITE_SUPABASE_URL no se bakeó; abortando deploy."
        )
