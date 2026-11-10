import { useI18n } from "@/hooks/use-i18n.js";

/**
 * Interruptor grande para encender/apagar un módulo para todos.
 */
export function ModulePowerToggle({
  checked,
  disabled = false,
  onChange,
  id,
}) {
  const { t } = useI18n();
  return (
    <label className={`module-power-toggle${disabled ? " is-disabled" : ""}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={onChange}
      />
      <span className="module-power-toggle-track" aria-hidden="true">
        <span className="module-power-toggle-thumb" />
      </span>
      <span className={`module-power-toggle-label ${checked ? "is-on" : "is-off"}`}>
        {checked ? t("admin.modules.toggle.onAll") : t("admin.modules.toggle.offAll")}
      </span>
    </label>
  );
}

/** Etiqueta de estado para partes de un módulo (sin vocabulario técnico). */
export function modulePartStatusLabel(defaultGlobal, empresasDistintas, t) {
  const n = Number(empresasDistintas) || 0;
  if (defaultGlobal && n === 0) return t("admin.modules.status.onAll");
  if (!defaultGlobal && n === 0) return t("admin.modules.status.offAll");
  if (!defaultGlobal && n > 0) return t("admin.modules.status.onInCompanies", { count: n });
  return t("admin.modules.status.offInCompanies", { count: n });
}
