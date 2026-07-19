import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useI18n } from "@/hooks/use-i18n.js";
import { questionLabelKey, questionTitleKey } from "@/lib/survey/discovery-questions.js";
import { saveSurveyUserOverrides } from "@/lib/survey/survey-questions-api.js";

const SECTION_IDS = ["motivaciones", "timeshare"];
const MOVE_FLASH_MS = 900;

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

/** Orden provisional durante el drag (sin mutar el estado persistible). */
export function projectRowsOrder(rows, activeId, overId) {
  if (!activeId || overId == null || activeId === overId) return rows || [];
  const list = rows || [];
  const oldIndex = list.findIndex((r) => r.clave === activeId);
  const newIndex = list.findIndex((r) => r.clave === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return list;
  return arrayMove(list, oldIndex, newIndex);
}

function numbersByClave(rows) {
  const nums = computeDisplayNumbers(rows);
  const map = new Map();
  (rows || []).forEach((r, i) => map.set(r.clave, nums[i]));
  return map;
}

function questionLabel(row, t) {
  if (row.bloque === "style") return t(questionLabelKey(row.clave));
  return t(questionTitleKey(row.clave));
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
  isDropTarget = false,
  insertEdge = null,
  numberLive = false,
  isJustMoved = false,
  moveFlashToken = 0,
  onToggle,
  onMove,
  isFirst,
  isLast,
  t,
}) {
  const active = row.activa !== false;
  const label = questionLabel(row, t);
  const localRef = useRef(null);

  const setRefs = (node) => {
    localRef.current = node;
    setNodeRef?.(node);
  };

  // Reinicia la animación en movimientos consecutivos de la misma fila.
  useLayoutEffect(() => {
    if (!isJustMoved || !localRef.current) return;
    const el = localRef.current;
    el.classList.remove("disc-config-row--just-moved");
    void el.offsetWidth;
    el.classList.add("disc-config-row--just-moved");
  }, [isJustMoved, moveFlashToken]);

  return (
    <div
      ref={setRefs}
      data-disc-clave={row.clave}
      style={style}
      className={[
        "disc-config-row",
        !active ? "off" : "",
        isDragging ? "disc-config-row--dragging" : "",
        isDropTarget ? "disc-config-row--drop-target" : "",
        insertEdge === "before" ? "disc-config-row--insert-before" : "",
        insertEdge === "after" ? "disc-config-row--insert-after" : "",
        isJustMoved ? "disc-config-row--just-moved" : "",
      ].filter(Boolean).join(" ")}
    >
      {showGrip && (
        <button
          type="button"
          className="disc-config-grip"
          aria-label={`${t("survey.disc.config.drag")}: ${label}`}
          {...(dragHandleProps || {})}
        >
          ⠿
        </button>
      )}

      <span
        className={[
          "disc-config-num",
          !active ? "disc-config-num--off" : "",
          numberLive ? "disc-config-num--live" : "",
        ].filter(Boolean).join(" ")}
      >
        {displayNumber != null ? `${displayNumber}.` : "—"}
      </span>

      <label className="disc-config-toggle">
        <input
          type="checkbox"
          checked={active}
          onChange={() => onToggle(row.clave)}
        />
        <span className="flabel">{label}</span>
      </label>

      <div className="disc-config-order">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isFirst}
          onClick={() => onMove(index, -1)}
          aria-label={`${t("survey.disc.config.moveUp")}: ${label}`}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isLast}
          onClick={() => onMove(index, 1)}
          aria-label={`${t("survey.disc.config.moveDown")}: ${label}`}
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

function RowPreview({ row, displayNumber, t }) {
  return (
    <div className="disc-config-row disc-config-row--overlay">
      <span className="disc-config-grip" aria-hidden>⠿</span>
      <span className="disc-config-num disc-config-num--live">
        {displayNumber != null ? `${displayNumber}.` : "—"}
      </span>
      <span className="flabel" style={{ flex: 1 }}>{questionLabel(row, t)}</span>
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
  const { t } = useI18n();
  const [section, setSection] = useState(initialSection);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [liveMessage, setLiveMessage] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [moveFlash, setMoveFlash] = useState({ clave: null, token: 0 });
  const moveFlashTimerRef = useRef(null);
  const listRef = useRef(null);
  const canDrag = useDesktopDnD();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const clearMoveFlash = () => {
    if (moveFlashTimerRef.current) {
      clearTimeout(moveFlashTimerRef.current);
      moveFlashTimerRef.current = null;
    }
    setMoveFlash((prev) => (prev.clave == null ? prev : { clave: null, token: prev.token }));
  };

  const pulseMovedRow = (clave) => {
    if (!clave) return;
    setMoveFlash((prev) => ({ clave, token: prev.token + 1 }));
    if (moveFlashTimerRef.current) clearTimeout(moveFlashTimerRef.current);
    moveFlashTimerRef.current = setTimeout(() => {
      setMoveFlash((prev) => (prev.clave === clave ? { clave: null, token: prev.token } : prev));
      moveFlashTimerRef.current = null;
    }, MOVE_FLASH_MS);
  };

  useEffect(() => () => {
    if (moveFlashTimerRef.current) clearTimeout(moveFlashTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    setSection(initialSection);
    setError("");
    setLiveMessage("");
    setActiveId(null);
    setOverId(null);
    clearMoveFlash();
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const list = (mergedAll || [])
      .filter((r) => r.seccion === section)
      .map((r) => ({ ...r }));
    list.sort((a, b) => a.orden - b.orden || String(a.clave).localeCompare(String(b.clave)));
    setRows(list);
    clearMoveFlash();
  }, [open, section, mergedAll]);

  useLayoutEffect(() => {
    if (!moveFlash.clave || !listRef.current) return;
    const list = listRef.current;
    const el = list.querySelector(`[data-disc-clave="${CSS.escape(moveFlash.clave)}"]`);
    if (!el) return;
    const listRect = list.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const outOfView = elRect.top < listRect.top + 4 || elRect.bottom > listRect.bottom - 4;
    if (outOfView) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [moveFlash.clave, moveFlash.token]);

  const sectionLabel = section === "timeshare"
    ? t("tools.survey.tab.timeshare")
    : t("tools.survey.tab.motivaciones");

  const title = `${t("survey.disc.config.title")} · ${sectionLabel}`;

  const previewRows = useMemo(
    () => projectRowsOrder(rows, activeId, overId),
    [rows, activeId, overId],
  );
  const displayNumberMap = useMemo(() => numbersByClave(previewRows), [previewRows]);
  const sortableIds = useMemo(() => rows.map((r) => r.clave), [rows]);
  const isDraggingList = activeId != null;

  const activeIndex = activeId ? rows.findIndex((r) => r.clave === activeId) : -1;
  const overIndex = overId ? rows.findIndex((r) => r.clave === overId) : -1;

  const announceOrder = (nextRows, movedClave) => {
    const nums = computeDisplayNumbers(nextRows);
    const idx = nextRows.findIndex((r) => r.clave === movedClave);
    if (idx < 0) return;
    const label = questionLabel(nextRows[idx], t);
    const num = nums[idx];
    if (nextRows[idx].activa === false) {
      setLiveMessage(t("survey.disc.config.liveOff", { label }));
    } else {
      setLiveMessage(t("survey.disc.config.liveNum", { label, n: num }));
    }
  };

  const clearDragState = () => {
    setActiveId(null);
    setOverId(null);
  };

  const move = (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const movedClave = rows[index]?.clave;
    if (!movedClave) return;
    setRows((prev) => {
      if (index + dir < 0 || index + dir >= prev.length) return prev;
      const next = arrayMove(prev, index, index + dir).map((r, i) => ({ ...r, orden: (i + 1) * 10 }));
      announceOrder(next, movedClave);
      return next;
    });
    pulseMovedRow(movedClave);
  };

  const toggle = (clave) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.clave === clave ? { ...r, activa: !r.activa } : r));
      announceOrder(next, clave);
      return next;
    });
  };

  const handleDragStart = (event) => {
    const id = event.active.id;
    setActiveId(id);
    setOverId(id);
  };

  const handleDragOver = (event) => {
    const nextOver = event.over?.id ?? null;
    setOverId((prev) => (prev === nextOver ? prev : nextOver));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    clearDragState();
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
  const activeDisplayNumber = activeId ? (displayNumberMap.get(activeId) ?? null) : null;

  const handleSave = async () => {
    if (!userId) {
      setError(t("survey.disc.config.needLogin"));
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
        setError(t("survey.disc.config.bankMissing"));
        return;
      }
      await saveSurveyUserOverrides(userId, persistable, section);
      await onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e?.message || t("survey.disc.config.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const rowProps = (row, index) => {
    let insertEdge = null;
    if (isDraggingList && overId === row.clave && activeId !== row.clave && activeIndex >= 0 && overIndex >= 0) {
      insertEdge = activeIndex < overIndex ? "after" : "before";
    }
    return {
      row,
      index,
      displayNumber: displayNumberMap.get(row.clave) ?? null,
      isDropTarget: isDraggingList && overId === row.clave && activeId !== row.clave,
      insertEdge,
      numberLive: isDraggingList,
      isJustMoved: moveFlash.clave === row.clave,
      moveFlashToken: moveFlash.token,
      onToggle: toggle,
      onMove: move,
      isFirst: index === 0,
      isLast: index === rows.length - 1,
      t,
    };
  };

  return (
    <SalesModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      sub={t("survey.disc.config.sub")}
      maxWidth={640}
    >
      <div className="seg" style={{ marginBottom: 14, width: "100%" }}>
        {SECTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`seg-btn${section === id ? " on" : ""}`}
            onClick={() => setSection(id)}
          >
            {id === "timeshare"
              ? t("tools.survey.tab.timeshare")
              : t("tools.survey.tab.motivaciones")}
          </button>
        ))}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>

      {canDrag ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={clearDragState}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="disc-config-list" ref={listRef}>
              {rows.map((row, index) => (
                <SortableQuestionRow key={row.clave} {...rowProps(row, index)} />
              ))}
              {!rows.length && <p className="card-sub">{t("survey.disc.config.empty")}</p>}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeRow ? (
              <RowPreview row={activeRow} displayNumber={activeDisplayNumber} t={t} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="disc-config-list" ref={listRef}>
          {rows.map((row, index) => (
            <QuestionRow key={row.clave} {...rowProps(row, index)} showGrip={false} />
          ))}
          {!rows.length && <p className="card-sub">{t("survey.disc.config.empty")}</p>}
        </div>
      )}

      {error ? <div className="hint" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={saving}>
          {t("survey.disc.config.cancel")}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t("survey.disc.config.saving") : t("survey.disc.config.save")}
        </button>
      </div>
    </SalesModal>
  );
}
