
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, Code2, Database, DollarSign, Download, Globe2, LogOut, ShieldAlert, Smartphone, Trash2, Upload, User, WalletCards } from "lucide-react";
import { canOfferPwaInstall, isStandaloneApp, openInstallPrompt } from "@/lib/pwa-install.js";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { CURRENCIES, WS_DEFAULTS } from "@/lib/constants";
import { hasAnyAdminAccess, type AdminAccessProfile } from "@/lib/auth/permissions";
import { exportDatabase, importDatabaseFile } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase, UserSettings } from "@/lib/storage/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile } from "@/lib/session-api.js";
import { t } from "@/lib/i18n.js";
import { saveProfileRemote } from "@/actions/settings.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

const SYNC_LABEL: Record<string, string> = {
  disabled: "Solo local",
  loading: "Cargando...",
  syncing: "Guardando...",
  saved: "Sincronizado",
  offline: "Sin conexión (se guardará al reconectar)",
  error: "Error de sincronización",
};

type SettingsSection = "user" | "worksheet" | "money" | "language" | "apis" | "backup" | "account" | null;

const CURRENCY_LABEL: Record<string, string> = {
  USD: "USD - US Dollar",
  MXN: "MXN - Peso mexicano",
  CAD: "CAD - Canadian Dollar",
  EUR: "EUR - Euro",
};

export function SettingsPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const db = useDbStore((s) => s.db);
  const replaceDb = useDbStore((s) => s.replaceDb);
  const fileRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [settings, setSettings] = useState<UserSettings>(db.settings || {});
  const [activeSection, setActiveSection] = useState<SettingsSection>(null);
  const [canSeeTechnical, setCanSeeTechnical] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState(null);
  const [fxDate, setFxDate] = useState(null);
  const syncStatus = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.lastError);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    fetchProfile().then((data) => {
      if (!data) return;
      setEmail(data.email ?? null);
      setFullName(data.full_name ?? "");
      setPhone(data.phone ?? "");
      setAvatarUrl(data.avatar_url ?? "");
      setCanSeeTechnical(hasAnyAdminAccess({
        id: data.id,
        role: data.role ?? "user",
        is_super_admin: data.is_super_admin === true,
        admin_permissions: Array.isArray(data.admin_permissions) ? data.admin_permissions : [],
      } satisfies AdminAccessProfile));
      if (data.settings && typeof data.settings === "object") {
        const incoming = data.settings as UserSettings;
        setSettings({ ...db.settings, ...incoming });
        replaceDb({ ...db, settings: { ...db.settings, ...incoming } });
      }
    });
    // Carga inicial del perfil remoto; incluir `db` aquí reescribiría el store en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSettings(db.settings || {});
  }, [db.settings]);

  const clientCount = Object.keys(db.clients).length;
  const sales = Object.values(db.clients).flatMap((c) => c.sales || []);
  const salesVol = sales.reduce((a, s) => a + (s.vol || 0), 0);
  const entriesCount = Object.values(db.cal).reduce(
    (a, m) => a + Object.values(m.days || {}).reduce((b, arr) => b + arr.length, 0),
    0
  );

  const onImport = async (file: File) => {
    if (!await confirmDialog("Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?")) return;
    importDatabaseFile(
      file,
      (incoming) => { replaceDb(incoming); toast.success("Respaldo importado correctamente."); },
      () => toast.error("No se pudo importar el respaldo. Verifica el archivo.")
    );
  };

  const saveProfile = async (e?: FormEvent) => {
    e?.preventDefault();
    setProfilePending(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const result = await saveProfileRemote({ fullName, phone, avatarUrl, settings });
      setProfileMsg(result.localOnly ? "Configuración guardada localmente." : "Perfil actualizado.");
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setProfilePending(false);
    }
  };

  const setSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const fetchAutoExchangeRate = async (currency = settings.currency || "USD") => {
    if (currency === "USD") {
      setFxError(null);
      setFxDate(new Date().toISOString().slice(0, 10));
      setSetting("exchangeRate", 1);
      return;
    }
    setFxLoading(true);
    setFxError(null);
    try {
      const res = await fetch(`/api/v1/exchange-rates?to=${encodeURIComponent(currency)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo obtener el tipo de cambio.");
      const rate = Number(body.data?.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Tipo de cambio inválido.");
      setSetting("exchangeRate", rate);
      setFxDate(body.data?.date ?? null);
    } catch (err) {
      setFxError(err instanceof Error ? err.message : "Error al actualizar.");
    } finally {
      setFxLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection !== "money" || settings.exchangeMode !== "auto") return;
    fetchAutoExchangeRate(settings.currency || "USD");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, settings.exchangeMode, settings.currency]);

  const setWorksheetSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      worksheetConfig: { ...(current.worksheetConfig || {}), [key]: value },
    }));
  };

  if (!hydrated) return <Topbar title="Configuración" subtitle="Cargando..." />;

  const renderHub = () => (
    <div className="settings-hub">
      <div className="exp-tool-list">
        <SettingsEntry icon={<User size={18} />} tone="blue" title="Usuario" desc="Nombre, iniciales y avatar del perfil" onClick={() => setActiveSection("user")} />
        <SettingsEntry icon={<WalletCards size={18} />} tone="purple" title="Worksheet" desc="Meses, intereses y opciones de financiamiento" onClick={() => setActiveSection("worksheet")} />
        <SettingsEntry icon={<DollarSign size={18} />} tone="green" title="Moneda y tipo de cambio" desc="Moneda visual y tipo de cambio manual" onClick={() => setActiveSection("money")} />
        <SettingsEntry icon={<Globe2 size={18} />} tone="blue" title="Idioma" desc="Español / English" onClick={() => setActiveSection("language")} />
        {canSeeTechnical && (
          <SettingsEntry icon={<Code2 size={18} />} tone="green" title="APIs / Preparación técnica" desc="Integraciones futuras documentadas" onClick={() => setActiveSection("apis")} />
        )}
        <SettingsEntry icon={<Database size={18} />} tone="teal" title="Datos y respaldo" desc="Exporta tu información a JSON o restaura desde un respaldo previo" onClick={() => setActiveSection("backup")} />
        {canOfferPwaInstall() && !isStandaloneApp() && (
          <SettingsEntry icon={<Smartphone size={18} />} tone="blue" title="Instalar aplicación" desc="Acceso rápido desde tu pantalla de inicio, sin buscar en el navegador" onClick={openInstallPrompt} />
        )}
        <SettingsEntry icon={<ShieldAlert size={18} />} tone="purple" title="Cuenta y zona de riesgo" desc={isSupabaseConfigured() ? `Sesión ${email ? `iniciada como ${email}` : "activa"}` : "Acciones sobre los datos locales de este dispositivo"} onClick={() => setActiveSection("account")} />
      </div>
    </div>
  );

  return (
    <>
      <Topbar title="Configuración" subtitle="Preferencias generales" />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">Configuración</div>
            <div className="page-sub">Panel de control de ajustes disponibles</div>
          </div>
          <button type="button" className="btn btn-primary" disabled={profilePending} onClick={() => saveProfile()}>
            {profilePending ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>

        {!activeSection ? renderHub() : (
          <div className="settings-detail">
            <PageBack onClick={() => setActiveSection(null)} />

            {activeSection === "user" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Usuario</div>
                  <div className="card-sub">Datos visuales del perfil dentro de la app.</div>
                  <div className="settings-row">
                    <div><div className="settings-label">Nombre del usuario</div><div className="settings-help">Se usa para el avatar del menú lateral.</div></div>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Michell Ruiz" style={{ width: "100%" }} />
                  </div>
                  <div className="settings-row">
                    <div><div className="settings-label">Iniciales</div><div className="settings-help">Texto del avatar cuando no hay foto.</div></div>
                    <input type="text" maxLength={3} value={settings.userInitials || ""} onChange={(e) => setSetting("userInitials", e.target.value.toUpperCase())} placeholder="M" style={{ width: 110, textAlign: "center", fontWeight: 800 }} />
                  </div>
                  {isSupabaseConfigured() && (
                    <>
                      <div className="settings-row">
                        <div><div className="settings-label">URL de avatar</div><div className="settings-help">Enlace público a tu foto de perfil.</div></div>
                        <input type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." style={{ width: "100%" }} />
                      </div>
                      <div className="settings-row">
                        <div><div className="settings-label">Subir imagen</div><div className="settings-help">Se guarda como URL de datos en tu perfil (máx. ~500 KB).</div></div>
                        <input type="file" accept="image/*" onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 512000) {
                            toast.error("La imagen debe pesar menos de 500 KB.");
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => setAvatarUrl(String(reader.result ?? ""));
                          reader.readAsDataURL(file);
                        }} />
                      </div>
                    </>
                  )}
                  {isSupabaseConfigured() && (
                    <form onSubmit={saveProfile} className="settings-row">
                      <div><div className="settings-label">Teléfono</div><div className="settings-help">Dato opcional del perfil de cuenta.</div></div>
                      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 ..." autoComplete="tel" />
                    </form>
                  )}
                </div>
              </div>
            )}

            {activeSection === "worksheet" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Worksheet</div>
                  <div className="card-sub">Opciones de financiamiento existentes. También se mantienen como atajo dentro de Worksheet.</div>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="settings-row">
                      <div><div className="settings-label">Opción {n}</div><div className="settings-help">Meses e interés anual.</div></div>
                      <div className="settings-mini-grid">
                        <input type="number" min={1} value={settings.worksheetConfig?.[`wo${n}m`] || WS_DEFAULTS[`wo${n}m`]} onChange={(e) => setWorksheetSetting(`wo${n}m`, e.target.value)} />
                        <input type="number" min={0} step={0.01} value={settings.worksheetConfig?.[`wo${n}r`] || WS_DEFAULTS[`wo${n}r`]} onChange={(e) => setWorksheetSetting(`wo${n}r`, e.target.value)} />
                      </div>
                    </div>
                  ))}
                  <div className="hint" style={{ marginTop: 14 }}><strong>Nota:</strong> esta configuración usa la misma fuente que el engrane local de Worksheet.</div>
                </div>
              </div>
            )}

            {activeSection === "money" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Moneda y tipo de cambio</div>
                  <div className="card-sub">La base interna recomendada sigue siendo USD; la moneda seleccionada es visual.</div>
                  <div className="settings-row">
                    <div><div className="settings-label">Moneda visual</div><div className="settings-help">Cómo quieres ver montos en la app.</div></div>
                    <select
                      value={settings.currency || "USD"}
                      onChange={(e) => {
                        const currency = e.target.value;
                        setSetting("currency", currency);
                        if (currency === "USD") setSetting("exchangeRate", 1);
                      }}
                      style={{ width: "100%" }}
                    >
                      {CURRENCIES.map((currency) => <option key={currency} value={currency}>{CURRENCY_LABEL[currency]}</option>)}
                    </select>
                  </div>
                  <div className="settings-row">
                    <div><div className="settings-label">Modo de tipo de cambio</div><div className="settings-help">Manual: tú defines el valor. Automático: se consulta vía API (Frankfurter / ECB).</div></div>
                    <select
                      value={settings.exchangeMode || "manual"}
                      onChange={(e) => setSetting("exchangeMode", e.target.value)}
                      style={{ width: "100%" }}
                      disabled={settings.currency === "USD"}
                    >
                      <option value="manual">Manual</option>
                      <option value="auto">Automático</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div><div className="settings-label">Tipo de cambio manual</div><div className="settings-help">Valor de 1 USD en la moneda visual seleccionada.</div></div>
                    <input
                      type="number"
                      min={0}
                      step={0.0001}
                      value={settings.currency === "USD" ? 1 : settings.exchangeRate || 1}
                      disabled={settings.currency === "USD" || settings.exchangeMode === "auto"}
                      onChange={(e) => setSetting("exchangeRate", Number(e.target.value) || 1)}
                      style={{ width: 160, textAlign: "right" }}
                    />
                  </div>
                  <div className="settings-row">
                    <div>
                      <div className="settings-label">Tipo de cambio automático</div>
                      <div className="settings-help">
                        {settings.exchangeMode === "auto"
                          ? "1 USD en la moneda visual, actualizado desde el backend."
                          : "Activa el modo automático para consultar la tasa del día."}
                      </div>
                    </div>
                    {settings.exchangeMode === "auto" ? (
                      <div className="settings-fx-auto">
                        {fxError ? (
                          <div className="settings-fx-error">{fxError}</div>
                        ) : (
                          <>
                            <div className="settings-fx-rate">
                              1 USD = {(settings.exchangeRate || 1).toLocaleString("es-MX", { maximumFractionDigits: 4 })} {settings.currency}
                            </div>
                            {fxDate && <div className="settings-fx-meta">Referencia del {fxDate} (Frankfurter)</div>}
                            <span className="settings-fx-ok">API conectada</span>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={fxLoading || settings.currency === "USD"}
                          onClick={() => fetchAutoExchangeRate(settings.currency || "USD")}
                        >
                          {fxLoading ? "Actualizando…" : "Actualizar ahora"}
                        </button>
                      </div>
                    ) : (
                      <span className="api-pill">Modo manual</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === "language" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Idioma</div>
                  <div className="card-sub">Preparación para leer la app en español o inglés.</div>
                  <div className="settings-row">
                    <div><div className="settings-label">Idioma visual</div><div className="settings-help">Cambia los textos principales conectados al catálogo i18n.</div></div>
                    <select value={settings.language || "es"} onChange={(e) => setSetting("language", e.target.value as "es" | "en")} style={{ width: "100%" }}>
                      <option value="es">Español</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div className="hint" style={{ marginTop: 14 }}><strong>Preparado para i18n:</strong> todo texto nuevo debe agregarse al catálogo ES/EN, no escribirse suelto en el código.</div>
                </div>
              </div>
            )}

            {activeSection === "apis" && canSeeTechnical && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">APIs / Preparación técnica</div>
                  <div className="card-sub">Endpoints REST disponibles en Express (:4000).</div>
                  <div className="api-list">
                    <ApiItem name="Exchange Rate API" desc="GET /api/v1/exchange-rates?to=MXN — Frankfurter (ECB), cache 12h en backend." done />
                    <ApiItem name="Catálogo País / Estado / Ciudad" desc="GET /api/v1/geo/countries y /geo/countries/:país/cities con ISO y banderas." done />
                    <ApiItem name="User Settings API" desc="GET/PATCH /api/v1/profile — idioma, moneda, avatar y preferencias." done />
                    <ApiItem name="Reminder / Notification API" desc="GET /api/v1/reminders — follow-up y procesamiento desde datos sincronizados." done />
                  </div>
                </div>
              </div>
            )}

            {activeSection === "backup" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Datos y respaldo</div>
                  <div className="card-sub">Exporta tu información a JSON o restaura desde un respaldo previo.</div>
                  <div className="g2" style={{ marginBottom: 16 }}>
                    <div className="vbox blue"><div className="vbox-val">{clientCount}</div><div className="vbox-label">Expedientes</div></div>
                    <div className="vbox green"><div className="vbox-val">{sales.length}</div><div className="vbox-label">Ventas registradas</div></div>
                    <div className="vbox yellow"><div className="vbox-val">{entriesCount}</div><div className="vbox-label">Registros de agenda</div></div>
                    <div className="vbox blue"><div className="vbox-val" style={{ fontSize: 16 }}>${salesVol.toLocaleString("en-US")}</div><div className="vbox-label">Volumen acumulado</div></div>
                  </div>
                  <div className="btn-row" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => exportDatabase(db)}><Download size={15} /> Exportar respaldo</button>
                    <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Importar respaldo</button>
                  </div>
                  <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImport(file);
                    e.target.value = "";
                  }} />
                </div>
              </div>
            )}

            {activeSection === "account" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">Cuenta y zona de riesgo</div>
                  <div className="card-sub">{isSupabaseConfigured() ? `Sesión ${email ? `iniciada como ${email}` : "activa"}.` : "Acciones sobre los datos locales de este dispositivo."}</div>
                  <div className="hint" style={{ marginBottom: 12 }}>
                    Sincronización: {t(`sync.${syncStatus}`, settings.language || "es") || syncStatus}
                    {syncStatus === "error" && syncError ? ` - ${syncError}` : ""}
                  </div>
                  {profileErr && <div className="auth-error" style={{ marginBottom: 12 }}>{profileErr}</div>}
                  {profileMsg && <div className="auth-ok" style={{ marginBottom: 12 }}>{profileMsg}</div>}
                  <div className="ethic-box" style={{ marginBottom: 16 }}>
                    <strong>Código ético:</strong> la información personal de los expedientes es temporal. Exporta un respaldo antes de borrar.
                  </div>
                  <div className="btn-row" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-danger" onClick={async () => {
                      if (await confirmDialog("Esto eliminará TODOS los datos locales (expedientes, ventas, agenda y metas). Esta acción no se puede deshacer. ¿Continuar?")) {
                        replaceDb(emptyDatabase());
                        toast.success("Todos los datos locales fueron eliminados.");
                      }
                    }}><Trash2 size={15} /> Borrar datos</button>
                    {isSupabaseConfigured() && (
                      <form action="/auth/signout" method="POST">
                        <button type="submit" className="btn btn-ghost"><LogOut size={15} /> Cerrar sesión</button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function SettingsEntry({
  icon,
  tone,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "purple" | "teal";
  title;
  desc;
  onClick: () => void;
}) {
  return (
    <button type="button" className="tool-card settings-entry" onClick={onClick}>
      <div className={`tool-icon ${tone}`}>{icon}</div>
      <div style={{ textAlign: "left" }}>
        <div className="tool-name">{title}</div>
        <div className="tool-desc">{desc}</div>
      </div>
      <ChevronRight size={18} style={{ color: "var(--muted2)", marginLeft: "auto" }} />
    </button>
  );
}

function ApiItem({ name, desc, done }) {
  return (
    <div className="api-item">
      <div className="api-name">
        {name}
        {done && <span className="settings-fx-ok" style={{ marginLeft: 8 }}>Activa</span>}
      </div>
      <div className="api-desc">{desc}</div>
    </div>
  );
}
