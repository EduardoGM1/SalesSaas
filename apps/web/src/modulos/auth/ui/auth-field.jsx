import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { selectOnFocus } from "@/lib/focus-select.js";

export function AuthField({
  label,
  name,
  type = "text",
  placeholder,
  required,
  autoComplete,
  minLength,
  icon: Icon,
  showToggle,
}) {
  const [visible, setVisible] = useState(false);
  const inputType = showToggle ? (visible ? "text" : "password") : type;

  return (
    <div className="auth-field auth-landing-field">
      <label className="field-label" htmlFor={name}>{label}</label>
      <div className="auth-landing-input-wrap">
        {Icon && <Icon size={18} className="auth-landing-input-icon" aria-hidden />}
        <input
          id={name}
          className="auth-input auth-landing-input"
          type={inputType}
          name={name}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          onFocus={selectOnFocus}
        />
        {showToggle && (
          <button
            type="button"
            className="auth-landing-pw-toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
