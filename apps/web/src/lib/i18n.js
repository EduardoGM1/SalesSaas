const ES = {
  "nav.agenda": "Agenda",
  "nav.dashboard": "Dashboard",
  "nav.goals": "Metas",
  "nav.clients": "Clientes",
  "nav.tools": "Herramientas",
  "nav.admin": "Admin",
  "nav.settings": "Configuración",
  "settings.title": "Configuración",
  "settings.loading": "Cargando...",
  "sync.disabled": "Solo local",
  "sync.loading": "Cargando...",
  "sync.syncing": "Guardando...",
  "sync.saved": "Sincronizado",
  "sync.offline": "Sin conexión (se guardará al reconectar)",
  "sync.error": "Error de sincronización",
};

const EN = {
  "nav.agenda": "Agenda",
  "nav.dashboard": "Dashboard",
  "nav.goals": "Goals",
  "nav.clients": "Clients",
  "nav.tools": "Tools",
  "nav.admin": "Admin",
  "nav.settings": "Settings",
  "settings.title": "Settings",
  "settings.loading": "Loading...",
  "sync.disabled": "Local only",
  "sync.loading": "Loading...",
  "sync.syncing": "Saving...",
  "sync.saved": "Synced",
  "sync.offline": "Offline (will sync when reconnected)",
  "sync.error": "Sync error",
};

export function t(key, lang = "es") {
  const table = lang === "en" ? EN : ES;
  return table[key] ?? ES[key] ?? key;
}

export function navLabel(label, lang = "es") {
  const map = {
    Agenda: "nav.agenda",
    Dashboard: "nav.dashboard",
    Metas: "nav.goals",
    Clientes: "nav.clients",
    Herramientas: "nav.tools",
    Admin: "nav.admin",
  };
  const k = map[label];
  return k ? t(k, lang) : label;
}
