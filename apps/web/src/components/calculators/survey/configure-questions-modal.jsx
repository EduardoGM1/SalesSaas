import { useEffect, useMemo, useState } from "react";
import { SalesModal } from "@/components/ui/sales-modal";
import { saveSurveyUserOverrides } from "@/lib/survey/survey-questions-api.js";

const SECTIONS = [
  { id: "motivaciones", label: "Motivaciones" },
  { id: "timeshare", label: "Timeshare Information" },
];

/**
 * Nivel A: activar/desactivar y reordenar preguntas del banco estándar (por usuario).
 */
export function ConfigureQuestionsModal({
  open,
  onOpenChange,
  section: initialSection = "motivaciones",
  mergedAll = [],
  userId,
  onSaved,
}) {
  const [section, setSection] = useState(initialSection);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    setError("");
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const list = (mergedAll || [])
      .filter((r) => r.seccion === section)
      .map((r) => ({ ...r }));
    list.sort((a, b) => a.orden - b.orden || String(a.clave).localeCompare(String(b.clave)));
    setRows(list);
  }, [open, section, mergedAll]);

  const title = useMemo(
    () => `Configurar preguntas · ${SECTIONS.find((s) => s.id === section)?.label || section}`,
    [section],
  );

  const move = (index, dir) => {
    setRows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j];
      next[j] = tmp;
      return next.map((r, i) => ({ ...r, orden: (i + 1) * 10 }));
    });
  };

  const toggle = (clave) => {
    setRows((prev) =>
      prev.map((r) => (r.clave === clave ? { ...r, activa: !r.activa } : r)),
    );
  };

  const handleSave = async () => {
    if (!userId) {
      setError("Debes iniciar sesión para guardar tu configuración.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = rows.map((r, i) => ({
        pregunta_id: r.id,
        activa: r.activa !== false,
        orden: (i + 1) * 10,
      }));
      // No persistir filas fallback-* (sin UUID real)
      const persistable = payload.filter((p) => p.pregunta_id && !String(p.pregunta_id).startsWith("fallback-"));
      if (!persistable.length) {
        setError("El banco de preguntas aún no está disponible en el servidor. Aplica la migración 0043.");
        return;
      }
      await saveSurveyUserOverrides(userId, persistable);
      await onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub="Activa, desactiva u ordena las preguntas del banco estándar. Solo aplica a tu cuenta."
      maxWidth={640}
    >
      <div className="seg" style={{ marginBottom: 14, width: "100%" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`seg-btn${section === s.id ? " on" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="disc-config-list">
        {rows.map((row, index) => (
          <div key={row.clave} className={`disc-config-row${row.activa === false ? " off" : ""}`}>
            <label className="disc-config-toggle">
              <input
                type="checkbox"
                checked={row.activa !== false}
                onChange={() => toggle(row.clave)}
              />
              <span className="flabel" style={{ flex: 1 }}>
                {row.bloque === "style" || row.bloque === "has_ts"
                  ? (row.label_corto || row.texto)
                  : row.texto}
              </span>
            </label>
            <div className="disc-config-order">
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir">↑</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label="Bajar">↓</button>
            </div>
          </div>
        ))}
        {!rows.length && <p className="card-sub">No hay preguntas en esta sección.</p>}
      </div>

      {error ? <div className="hint" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </SalesModal>
  );
}
