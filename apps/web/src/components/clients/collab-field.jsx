import { cloneElement, isValidElement } from "react";
import { useFieldLock } from "@/hooks/use-expediente-collab.js";
import { useI18n } from "@/hooks/use-i18n.js";

/** ID estable entre clientes: `{tool}:{fieldKey}` */
export function collabFieldId(tool, fieldKey) {
  return `${tool}:${fieldKey}`;
}

function fieldKeyFromId(fieldId) {
  if (!fieldId || typeof fieldId !== "string") return null;
  const i = fieldId.indexOf(":");
  return i >= 0 ? fieldId.slice(i + 1) : fieldId;
}

/**
 * Envuelve un input/select con bloqueo por campo vía Presence.
 * Si se pasa dirtyKeysRef, marca dirty al enfocar (protege contra apply remoto al Guardar).
 */
export function CollabField({
  collab,
  fieldId,
  disabled = false,
  dirtyKeysRef = null,
  children,
  className = "",
}) {
  const { t } = useI18n();
  const { locked, locker, lockProps } = useFieldLock(collab, fieldId, {
    disabled,
    onEditStart: () => {
      const key = fieldKeyFromId(fieldId);
      if (key && dirtyKeysRef?.current) dirtyKeysRef.current.add(key);
    },
  });
  const hint = locked && locker
    ? t("collab.fieldLockedBy", { name: locker.name || t("collab.someone") })
    : null;

  let content;
  if (typeof children === "function") {
    content = children(lockProps, { locked, locker });
  } else if (isValidElement(children)) {
    content = cloneElement(children, {
      onFocus: (e) => {
        lockProps.onFocus?.(e);
        children.props?.onFocus?.(e);
      },
      onBlur: (e) => {
        lockProps.onBlur?.(e);
        children.props?.onBlur?.(e);
      },
      disabled: !!(children.props?.disabled || lockProps.disabled),
      readOnly: !!(children.props?.readOnly || lockProps.readOnly),
      className: [children.props?.className, lockProps.className].filter(Boolean).join(" ") || undefined,
      title: hint || children.props?.title,
      "aria-disabled": lockProps["aria-disabled"] || children.props?.["aria-disabled"],
    });
  } else {
    content = children;
  }

  return (
    <div className={`collab-field-wrap ${locked ? "is-locked" : ""} ${className}`.trim()}>
      {content}
      {hint && (
        <span className="collab-field-lock-badge" title={hint}>
          {locker?.avatar_url ? (
            <img src={locker.avatar_url} alt="" className="collab-field-lock-avatar" />
          ) : (
            <span className="collab-field-lock-initial">
              {(locker?.name || "?").trim().charAt(0).toUpperCase()}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
