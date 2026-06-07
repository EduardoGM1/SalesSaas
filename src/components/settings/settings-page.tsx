"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Upload, Trash2, LogOut } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { exportDatabase, importDatabaseFile } from "@/lib/storage/local-storage-adapter";
import { emptyDatabase } from "@/lib/storage/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { useSyncStore } from "@/stores/sync-store";
import { toast } from "@/lib/toast";
import { confirmDialog } from "@/lib/confirm";

const SYNC_LABEL: Record<string, string> = {
  disabled: "Solo local",
  loading: "Cargando…",
  syncing: "Guardando…",
  saved: "Sincronizado",
  offline: "Sin conexión (se guardará al reconectar)",
  error: "Error de sincronización",
};

export function SettingsPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const db = useDbStore((s) => s.db);
  const replaceDb = useDbStore((s) => s.replaceDb);
  const fileRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const syncStatus = useSyncStore((s) => s.status);
  const syncError = useSyncStore((s) => s.lastError);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    sb.from("profiles").select("full_name, phone").single().then(({ data }) => {
      if (data) {
        setFullName(data.full_name ?? "");
        setPhone(data.phone ?? "");
      }
    });
  }, []);

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

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfilePending(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar el perfil.");
      setProfileMsg("Perfil actualizado.");
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setProfilePending(false);
    }
  };

  if (!hydrated) return <Topbar title="Ajustes" subtitle="Cargando..." />;

  return (
    <>
      <Topbar title="Ajustes" subtitle="Datos y preferencias" />
      <div className="sales-page">
        <div className="page-head">
          <div>
            <div className="page-title">Ajustes</div>
            <div className="page-sub">Respaldo de datos y configuración de la aplicación</div>
          </div>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">Respaldo de datos</div>
            <div className="card-sub">Exporta tu información a un archivo JSON o restaura desde un respaldo previo. Los datos se guardan en este dispositivo.</div>

            <div className="g2" style={{ marginBottom: 16 }}>
              <div className="vbox blue"><div className="vbox-val">{clientCount}</div><div className="vbox-label">Expedientes</div></div>
              <div className="vbox green"><div className="vbox-val">{sales.length}</div><div className="vbox-label">Ventas registradas</div></div>
              <div className="vbox yellow"><div className="vbox-val">{entriesCount}</div><div className="vbox-label">Registros de agenda</div></div>
              <div className="vbox blue"><div className="vbox-val" style={{ fontSize: 16 }}>${salesVol.toLocaleString("en-US")}</div><div className="vbox-label">Volumen acumulado</div></div>
            </div>

            <div className="btn-row" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => exportDatabase(db)}>
                <Download size={15} /> Exportar respaldo
              </button>
              <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Importar respaldo
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="card">
            <div className="card-heading">Zona de riesgo</div>
            <div className="card-sub">Acciones irreversibles sobre los datos locales de este dispositivo.</div>
            <div className="ethic-box" style={{ marginBottom: 16 }}>
              <strong>Código ético:</strong> la información personal de los expedientes es temporal. Exporta un respaldo antes de borrar y conserva solo lo comercial/estadístico al cerrar operaciones.
            </div>
            <button type="button" className="btn btn-danger" onClick={async () => {
              if (await confirmDialog("Esto eliminará TODOS los datos locales (expedientes, ventas, agenda y metas). Esta acción no se puede deshacer. ¿Continuar?")) {
                replaceDb(emptyDatabase());
                toast.success("Todos los datos locales fueron eliminados.");
              }
            }}>
              <Trash2 size={15} /> Borrar todos los datos
            </button>
          </div>
        </div>

        {isSupabaseConfigured() && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-heading">Cuenta</div>
            <div className="card-sub">Sesión iniciada{email ? ` como ${email}` : ""}.</div>
            <div className="hint" style={{ marginBottom: 10 }}>
              Sincronización: {SYNC_LABEL[syncStatus] ?? syncStatus}
              {syncStatus === "error" && syncError ? ` — ${syncError}` : ""}
            </div>

            {profileErr && <div className="auth-error" style={{ marginBottom: 12 }}>{profileErr}</div>}
            {profileMsg && <div className="auth-ok" style={{ marginBottom: 12 }}>{profileMsg}</div>}

            <form onSubmit={saveProfile} style={{ marginBottom: 16 }}>
              <div className="auth-field">
                <label className="field-label">Nombre completo</label>
                <input className="auth-input" type="text" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
              </div>
              <div className="auth-field">
                <label className="field-label">Teléfono</label>
                <input className="auth-input" type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 …" autoComplete="tel" />
              </div>
              <button type="submit" className="btn btn-primary" disabled={profilePending}>
                {profilePending ? "Guardando…" : "Guardar perfil"}
              </button>
            </form>

            <form action="/auth/signout" method="POST">
              <button type="submit" className="btn btn-ghost">
                <LogOut size={15} /> Cerrar sesión
              </button>
            </form>
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-heading">Acerca de</div>
          <div className="card-sub">Sales Timeshare · versión SaaS</div>
          <div className="hint">Datos sincronizados en la nube con respaldo local opcional. Accede desde cualquier dispositivo con tu cuenta.</div>
        </div>
      </div>
    </>
  );
}
