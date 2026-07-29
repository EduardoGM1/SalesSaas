import { CollabField } from "@/components/clients/collab-field.jsx";
import { selectOnFocus } from "@/lib/focus-select.js";
import { formatDecimalInput } from "@/lib/format/numeric-input.js";

/** Input monetario con prefijo explícito USD/MXN (moneda de captura activa). */
export function CampoMonedaCaptura({
  currency = "USD",
  value,
  onChange,
  onBlurCapture,
  collab,
  fieldId,
  dirtyKeysRef,
  readOnly,
  inputId,
  placeholder = "0",
  className = "",
}) {
  const code = currency === "MXN" ? "MXN" : "USD";

  return (
    <div className={`mfield mfield--currency${className ? ` ${className}` : ""}`}>
      <span className="mpfx mpfx--code">{code}</span>
      <CollabField collab={collab} fieldId={fieldId} dirtyKeysRef={dirtyKeysRef} disabled={readOnly}>
        {(lp) => (
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            placeholder={placeholder}
            value={value}
            className={lp.className}
            onFocus={(e) => { lp.onFocus?.(e); selectOnFocus(e); }}
            onBlur={(e) => {
              lp.onBlur?.(e);
              onBlurCapture?.(e);
            }}
            disabled={lp.disabled}
            readOnly={lp.readOnly}
            onChange={(e) => onChange?.(formatDecimalInput(e.target.value))}
          />
        )}
      </CollabField>
    </div>
  );
}
