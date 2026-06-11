
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Code2, Database, DollarSign, Download, Globe2, LogOut, ShieldAlert, Smartphone, Trash2, Upload, User, WalletCards } from "lucide-react";
import { canOfferPwaInstall, isStandaloneApp, openInstallPrompt } from "@/lib/pwa-install.js";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { CURRENCIES, WS_DEFAULTS } from "@/lib/constants";
import { hasAnyAdminAccess, type AdminAccessProfile } from "@/lib/auth/permissions";
import { exportDatabase, importDatabaseFile } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase, UserSettings } from "@/lib/storage/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchProfile, signOut } from "@/lib/session-api.js";
import { t } from "@/lib/i18n.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { saveProfileRemote } from "@/actions/settings.js";
import { selectOnFocus } from "@/lib/focus-select.js";
import { fetchExchangeRate } from "@/lib/exchange-rate-sync.js";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

const LIVE_PREVIEW_KEYS = new Set(["language", "currency", "exchangeRate", "exchangeMode"]);

type SettingsSection = "user" | "worksheet" | "money" | "language" | "apis" | "backup" | "account" | null;

const CURRENCY_LABEL: Record<string, string> = {
  USD: "USD - US Dollar",
  MXN: "MXN - Peso mexicano",
  CAD: "CAD - Canadian Dollar",
  EUR: "EUR - Euro",
};

export function SettingsPage() {
  const { t: ti } = useI18n();
  const navigate = useNavigate();
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
  const [signOutPending, setSignOutPending] = useState(false);
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
    if (!await confirmDialog(ti("settings.account.importConfirm"))) return;
    importDatabaseFile(
      file,
      (incoming) => { replaceDb(incoming); toast.success(ti("toast.settings.importOk")); },
      () => toast.error(ti("toast.settings.importFail"))
    );
  };

  const saveProfile = async (e?: FormEvent) => {
    e?.preventDefault();
    setProfilePending(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const result = await saveProfileRemote({ fullName, phone, avatarUrl, settings });
      setProfileMsg(result.localOnly ? ti("settings.savedLocal") : ti("settings.savedRemote"));
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : ti("settings.saveError"));
    } finally {
      setProfilePending(false);
    }
  };

  const setSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      if (LIVE_PREVIEW_KEYS.has(key)) {
        const currentDb = useDbStore.getState().db;
        replaceDb({ ...currentDb, settings: { ...currentDb.settings, ...next } });
      }
      return next;
    });
  };

  const fetchAutoExchangeRate = async (currency = settings.currency || "USD") => {
    setFxLoading(true);
    setFxError(null);
    try {
      const { rate, date } = await fetchExchangeRate(currency);
      setSetting("exchangeRate", rate);
      setFxDate(date ?? new Date().toISOString().slice(0, 10));
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

  if (!hydrated) return <Topbar title={ti("settings.title")} subtitle={ti("common.loading")} />;

  const renderHub = () => (
    <div className="settings-hub">
      <div className="exp-tool-list">
        <SettingsEntry icon={<User size={18} />} tone="blue" title={ti("settings.hub.user")} desc={ti("settings.hub.userDesc")} onClick={() => setActiveSection("user")} />
        <SettingsEntry icon={<WalletCards size={18} />} tone="purple" title={ti("settings.hub.worksheet")} desc={ti("settings.hub.worksheetDesc")} onClick={() => setActiveSection("worksheet")} />
        <SettingsEntry icon={<DollarSign size={18} />} tone="green" title={ti("settings.hub.money")} desc={ti("settings.hub.moneyDesc")} onClick={() => setActiveSection("money")} />
        <SettingsEntry icon={<Globe2 size={18} />} tone="blue" title={ti("settings.hub.language")} desc={ti("settings.hub.languageDesc")} onClick={() => setActiveSection("language")} />
        {canSeeTechnical && (
          <SettingsEntry icon={<Code2 size={18} />} tone="green" title={ti("settings.hub.apis")} desc={ti("settings.hub.apisDesc")} onClick={() => setActiveSection("apis")} />
        )}
        <SettingsEntry icon={<Database size={18} />} tone="teal" title={ti("settings.hub.backup")} desc={ti("settings.hub.backupDesc")} onClick={() => setActiveSection("backup")} />
        {canOfferPwaInstall() && !isStandaloneApp() && (
          <SettingsEntry icon={<Smartphone size={18} />} tone="blue" title={ti("settings.hub.pwa")} desc={ti("settings.hub.pwaDesc")} onClick={openInstallPrompt} />
        )}
        <SettingsEntry icon={<ShieldAlert size={18} />} tone="purple" title={ti("settings.hub.account")} desc={isSupabaseConfigured() ? (email ? ti("settings.hub.accountSession", { email }) : ti("settings.hub.accountActive")) : ti("settings.hub.accountLocal")} onClick={() => setActiveSection("account")} />
      </div>
    </div>
  );

  return (
    <>
      <Topbar title={ti("settings.title")} subtitle={ti("settings.subtitle")} />
      <div className="sales-page">
        {!activeSection && <PageBack />}
        <div className="page-head">
          <div>
            <div className="page-title">{ti("settings.title")}</div>
            <div className="page-sub">{ti("settings.hubTitle")}</div>
          </div>
          <button type="button" className="btn btn-primary" disabled={profilePending} onClick={() => saveProfile()}>
            {profilePending ? ti("settings.saving") : ti("settings.save")}
          </button>
        </div>

        {!activeSection ? renderHub() : (
          <div className="settings-detail">
            <PageBack onClick={() => setActiveSection(null)} />

            {activeSection === "user" && (
              <div className="settings-section">
                <div className="settings-card">
                  <div className="card-heading">{ti("settings.user.title")}</div>
                  <div className="card-sub">{ti("settings.user.sub")}</div>
                  <div className="settings-row">
                    <div><div className="settings-label">{ti("settings.user.name")}</div><div className="settings-help">{ti("settings.user.nameHelp")}</div></div>
                    <input type="text" value={fullName} onFocus={selectOnFocus} onChange={(e) => setFullName(e.target.value)} placeholder={ti("settings.user.namePlaceholder")} style={{ width: "100%" }} />
                  </div>
                  <div className="settings-row">
                    <div><div className="settings-label">{ti("settings.user.initials")}</div><div className="settings-help">{ti("settings.user.initialsHelp")}</div></div>
                    <input type="text" maxLength={3} value={settings.userInitials || ""} onFocus={selectOnFocus} onChange={(e) => setSetting("userInitials", e.target.value.toUpperCase())} placeholder="M" style={{ width: 110, textAlign: "center", fontWeight: 800 }} />
                  </div>
                  {isSupabaseConfigured() && (
                    <div className="settings-row">
                      <div><div className="settings-label">{ti("settings.user.avatarUrl")}</div><div className="settings-help">{ti("settings.user.avatarUrlHelp")}</div></div>
                      <input type="url" value={avatarUrl} onFocus={selectOnFocus} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." style={{ width: "100%" }} />
                    </div>
                  )}
                  {isSupabaseConfigured() && (
                    <form onSubmit={saveProfile} className="settings-row">
                      <div><div className="settings-label">Teléfono</div><div className="settings-help">Dato opcional del perfil de cuenta.</div></div>
                      <input type="tel" value={phone} onFocus={selectOnFocus} onChange={(e) => setPhone(e.target.value)} placeholder="+52 ..." autoComplete="tel" />
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
                  <div className="card-heading">{ti("settings.money.title")}</div>
                  <div className="card-sub">{ti("settings.money.sub")}</div>
                  <div className="settings-row">
                    <div><div className="settings-label">{ti("settings.money.visual")}</div><div className="settings-help">{ti("settings.money.visualHelp")}</div></div>
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
                    <div><div className="settings-label">{ti("settings.money.mode")}</div><div className="settings-help">{ti("settings.money.modeHelp")}</div></div>
                    <select
                      value={settings.exchangeMode || "auto"}
                      onChange={(e) => setSetting("exchangeMode", e.target.value)}
                      style={{ width: "100%" }}
                      disabled={settings.currency === "USD"}
                    >
                      <option value="manual">{ti("settings.money.manual")}</option>
                      <option value="auto">{ti("settings.money.auto")}</option>
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
                          ? "1 USD en la moneda visual."
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
                  <div className="card-heading">{ti("settings.language.title")}</div>
                  <div className="card-sub">{ti("settings.language.sub")}</div>
                  <div className="settings-row">
                    <div><div className="settings-label">{ti("settings.language.visual")}</div><div className="settings-help">{ti("settings.language.visualHelp")}</div></div>
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
                    <ApiItem name="Exchange Rate API" desc="GET /api/v1/exchange-rates?to=MXN — Frankfurter (ECB), cache 12h en backend." done activeLabel={ti("settings.apis.active")} />
                    <ApiItem name="Catálogo País / Estado / Ciudad" desc="GET /api/v1/geo/countries y /geo/countries/:país/cities con ISO y banderas." done activeLabel={ti("settings.apis.active")} />
                    <ApiItem name="User Settings API" desc="GET/PATCH /api/v1/profile — idioma, moneda, avatar y preferencias." done activeLabel={ti("settings.apis.active")} />
                    <ApiItem name="Reminder / Notification API" desc="GET /api/v1/reminders — follow-up y procesamiento desde datos sincronizados." done activeLabel={ti("settings.apis.active")} />
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
                  <div className="card-heading">{ti("settings.account.title")}</div>
                  <div className="card-sub">{isSupabaseConfigured() ? (email ? ti("settings.account.subSession", { email }) : ti("settings.account.subActive")) : ti("settings.account.subLocal")}</div>
                  <div className="hint" style={{ marginBottom: 12 }}>
                    {ti("settings.account.sync")} {t(`sync.${syncStatus}`, settings.language || "es") || syncStatus}
                    {syncStatus === "error" && syncError ? ` - ${syncError}` : ""}
                  </div>
                  {profileErr && <div className="auth-error" style={{ marginBottom: 12 }}>{profileErr}</div>}
                  {profileMsg && <div className="auth-ok" style={{ marginBottom: 12 }}>{profileMsg}</div>}
                  <div className="ethic-box" style={{ marginBottom: 16 }}>
                    <strong>Código ético:</strong> la información personal de los expedientes es temporal. Exporta un respaldo antes de borrar.
                  </div>
                  <div className="btn-row" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-danger" onClick={async () => {
                      if (await confirmDialog(ti("settings.account.deleteConfirm"))) {
                        replaceDb(emptyDatabase());
                        toast.success(ti("toast.settings.deleted"));
                      }
                    }}><Trash2 size={15} /> Borrar datos</button>
                    {isSupabaseConfigured() && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={signOutPending}
                        onClick={async () => {
                          setSignOutPending(true);
                          try {
                            await signOut();
                            navigate("/login", { replace: true });
                          } catch {
                            toast.error(ti("toast.settings.signOutFail"));
                          } finally {
                            setSignOutPending(false);
                          }
                        }}
                      >
                        <LogOut size={15} /> {signOutPending ? ti("settings.account.signingOut") : ti("settings.account.signOut")}
                      </button>
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

function ApiItem({ name, desc, done, activeLabel = "Activa" }) {
  return (
    <div className="api-item">
      <div className="api-name">
        {name}
        {done && <span className="settings-fx-ok" style={{ marginLeft: 8 }}>{activeLabel}</span>}
      </div>
      <div className="api-desc">{desc}</div>
    </div>
  );
}
