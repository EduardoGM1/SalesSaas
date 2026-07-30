import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { prospectFilesApi } from "@/lib/prospect-files-api.js";
import { toast } from "@/lib/toast";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt";

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Sección de archivos del expediente: listado, subida y borrado.
 * Todos los adjuntos viven en el mismo expediente (sin copias).
 */
export function ProspectFilesPanel({ prospectId, enabled = true, canUpload = true }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async (signal) => {
    if (!enabled || !prospectId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await prospectFilesApi.list(prospectId);
      if (signal?.aborted) return;
      setFiles(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (signal?.aborted) return;
      if (err?.status === 503 || /0058|prospect-files|does not exist|schema cache/i.test(err?.message || "")) {
        setError("Archivos no disponibles. Aplica la migración 0058 en Supabase.");
      } else {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los archivos.");
      }
      setFiles([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, prospectId]);

  useEffect(() => {
    const controller = { aborted: false };
    void load(controller);
    return () => { controller.aborted = true; };
  }, [load]);

  const onPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo supera el máximo de 10 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      await prospectFilesApi.upload(prospectId, file);
      toast.success("Archivo subido");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo subir el archivo.";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async (file) => {
    if (!window.confirm(`¿Eliminar «${file.nombre}»?`)) return;
    try {
      await prospectFilesApi.remove(prospectId, file.id);
      toast.success("Archivo eliminado");
      setFiles((prev) => prev.filter((row) => row.id !== file.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  };

  if (!enabled) return null;

  return (
    <section className="card prospect-files-panel" aria-labelledby="prospect-files-title">
      <div className="prospect-files-head">
        <div>
          <span className="section-label">Archivos</span>
          <h2 id="prospect-files-title">Adjuntos del expediente</h2>
          <p>Contratos, identificaciones y documentos quedan en este mismo registro.</p>
        </div>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(event) => void onPick(event)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={15} /> {uploading ? "Subiendo…" : "Subir archivo"}
            </button>
          </>
        ) : null}
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      {loading ? <p className="admin-cell-muted">Cargando archivos…</p> : null}

      {!loading && !files.length ? (
        <div className="prospect-files-empty">
          <Paperclip size={18} aria-hidden />
          <span>Aún no hay archivos. Sube el primero para dejarlo en el expediente.</span>
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul className="prospect-files-list">
          {files.map((file) => (
            <li key={file.id}>
              <FileText size={16} aria-hidden />
              <div className="prospect-files-meta">
                {file.url ? (
                  <a href={file.url} target="_blank" rel="noreferrer">{file.nombre}</a>
                ) : (
                  <strong>{file.nombre}</strong>
                )}
                <span>
                  {formatSize(file.size_bytes)}
                  {file.uploader_name ? ` · ${file.uploader_name}` : ""}
                  {file.created_at ? ` · ${new Date(file.created_at).toLocaleString()}` : ""}
                </span>
              </div>
              {canUpload ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  title="Eliminar"
                  onClick={() => void onRemove(file)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
