import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SalesModal } from "@/components/ui/sales-modal";
import { saveSurveyUserOverrides } from "@/lib/survey/survey-questions-api.js";

const SECTIONS = [
  { id: "motivaciones", label: "Motivaciones" },
  { id: "timeshare", label: "Timeshare Information" },
];

function useDesktopDnD() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(pointer: fine) and (min-width: 901px)");
    const apply = () => setEnabled(!!mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener?.(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener?.(apply);
    };
  }, []);
  return enabled;
}

/** Números de Survey real: solo activas, en orden visual actual. */
export function computeDisplayNumbers(rows) {
  let n = 0;
  return (rows || []).map((r) => {
    if (r.activa === false) return null;
    n += 1;
    return n;
  });
}

function questionLabel(row) {
  return row.bloque === "style" || row.bloque === "has_ts"
    ? (row.label_corto || row.texto)
    : row.texto;
}

function QuestionRow({
  row,
  index,
  displayNumber,
  showGrip,
  dragHandleProps,
  setNodeRef,
  style,
  isDragging,
  onToggle,
  onMove,
  isFirst,
  isLast,
}) {
  const active = row.activa !== false;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "disc-config-row",
        !active ? "off" : "",
        isDragging ? "disc-config-row--dragging" : "",
      ].filter(Boolean).join(" ")}
    >
      {showGrip && (
        <button
          type="button"
          className="disc-config-grip"
          aria-label={`Arrastrar para reordenar: ${questionLabel(row)}`}
          {...(dragHandleProps || {})}
        >
          ⠿
        </button>
      )}

      <span className={`disc-config-num${!active ? " disc-config-num--off" : ""}`}>
        {displayNumber != null ? `${displayNumber}.` : "—"}
      </span>

      <label className="disc-config-toggle">
        <input
          type="checkbox"
          checked={active}
          onChange={() => onToggle(row.clave)}
        />
        <span className="flabel">{questionLabel(row)}</span>
      </label>

      <div className="disc-config-order">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
          aria-label={`Subir: ${questionLabel(row)}`}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isLast}
          onClick={() => onMove(index, 1)}
          aria-label={`Bajar: ${questionLabel(row)}`}
        >
          ↓
        </button>
      </div>
    </div>
  );
}

function SortableQuestionRow(props) {
  const { row } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.clave });

  return (
    <QuestionRow
      {...props}
      showGrip
      setNodeRef={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

function RowPreview({ row, displayNumber }) {
  return (
    <div className="disc-config-row disc-config-row--overlay">
      <span className="disc-config-grip" aria-hidden>⠿</span>
      <span className="disc-config-num">
        {displayNumber != null ? `${displayNumber}.` : "—"}
      </span>
      <span className="flabel" style={{ flex: 1 }}>{questionLabel(row)}</span>
    </div>
  );
}

/**
 * Nivel A: activar/desactivar y reordenar (flechas + drag desktop).
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
  const [liveMessage, setLiveMessage] = useState("");
  const [activeId, setActiveId] = useState(null);
  const canDrag = useDesktopDnD();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    setError("");
    setLiveMessage("");
    setActiveId(null);
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

  const displayNumbers = useMemo(() => computeDisplayNumbers(rows), [rows]);
  const sortableIds = useMemo(() => rows.map((r) => r.clave), [rows]);

  const announceOrder = (nextRows, movedClave) => {
    const nums = computeDisplayNumbers(nextRows);
    const idx = nextRows.findIndex((r) => r.clave === movedClave);
    if (idx < 0) return;
    const label = questionLabel(nextRows[idx]);
    const num = nums[idx];
    if (nextRows[idx].activa === false) {
      setLiveMessage(`${label} desactivada; no aparece en el Survey.`);
    } else {
      setLiveMessage(`${label} ahora es la pregunta ${num} en esta sección.`);
    }
  };

  const move = (index, dir) => {
    setRows((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const movedClave = prev[index].clave;
      const next = arrayMove(prev, index, j).map((r, i) => ({ ...r, orden: (i + 1) * 10 }));
      announceOrder(next, movedClave);
      return next;
    });
  };

  const toggle = (clave) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.clave === clave ? { ...r, activa: !r.activa } : r));
      announceOrder(next, clave);
      return next;
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.clave === active.id);
      const newIndex = prev.findIndex((r) => r.clave === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, orden: (i + 1) * 10 }));
      announceOrder(next, String(active.id));
      return next;
    });
  };

  const activeRow = activeId ? rows.find((r) => r.clave === activeId) : null;
  const activeDisplayNumber = activeId
    ? displayNumbers[rows.findIndex((r) => r.clave === activeId)]
    : null;

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
      const persistable = payload.filter((p) => p.pregunta_id && !String(p.pregunta_id).startsWith("fallback-"));
      if (!persistable.length) {
        setError("El banco de preguntas aún no está disponible en el servidor. Aplica la migración 0043.");
        return;
      }
      await saveSurveyUserOverrides(userId, persistable, section);
      await onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const rowProps = (row, index) => ({
    row,
    index,
    displayNumber: displayNumbers[index],
    onToggle: toggle,
    onMove: move,
    isFirst: index === 0,
    isLast: index === rows.length - 1,
  });

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

      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>

      {canDrag ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(e.active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="disc-config-list">
              {rows.map((row, index) => (
                <SortableQuestionRow key={row.clave} {...rowProps(row, index)} />
              ))}
              {!rows.length && <p className="card-sub">No hay preguntas en esta sección.</p>}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeRow ? <RowPreview row={activeRow} displayNumber={activeDisplayNumber} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="disc-config-list">
          {rows.map((row, index) => (
            <QuestionRow key={row.clave} {...rowProps(row, index)} showGrip={false} />
          ))}
          {!rows.length && <p className="card-sub">No hay preguntas en esta sección.</p>}
        </div>
      )}

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
