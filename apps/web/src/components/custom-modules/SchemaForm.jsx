/**
 * Renderer genérico de schema_ui. Sin lógica de negocio: solo UI declarativa.
 */
import { useMemo, useState } from "react";
import {
  emptyValuesFromSchema,
  normalizeSchema,
  validateAgainstSchema,
} from "@/lib/custom-modules/schema-engine.js";

function FieldControl({ field, value, error, disabled, onChange }) {
  const id = `schema-field-${field.key}`;
  const common = {
    id,
    name: field.key,
    disabled,
    "aria-invalid": error ? "true" : undefined,
  };

  if (field.type === "textarea") {
    return (
      <textarea
        {...common}
        className="input"
        rows={4}
        placeholder={field.placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "number" || field.type === "currency") {
    return (
      <input
        {...common}
        className="input"
        type="number"
        inputMode="decimal"
        min={field.min}
        max={field.max}
        step={field.step ?? (field.type === "currency" ? "0.01" : "any")}
        placeholder={field.placeholder}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
      />
    );
  }

  if (field.type === "date") {
    return (
      <input
        {...common}
        className="input"
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.type === "checkbox" || field.type === "switch") {
    return (
      <label className="schema-form-check">
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <select
        {...common}
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar…</option>
        {(field.options || []).map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="schema-form-radio-group" role="radiogroup" aria-labelledby={`${id}-label`}>
        {(field.options || []).map((opt) => (
          <label key={opt.value} className="schema-form-check">
            <input
              type="radio"
              name={field.key}
              disabled={disabled}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "autocomplete") {
    const listId = `${id}-list`;
    return (
      <>
        <input
          {...common}
          className="input"
          type="text"
          list={listId}
          placeholder={field.placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={listId}>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </datalist>
      </>
    );
  }

  if (field.type === "file") {
    return (
      <input
        {...common}
        className="input"
        type="file"
        accept={field.accept}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          onChange(file ? { name: file.name, size: file.size, type: file.type } : null);
        }}
      />
    );
  }

  return (
    <input
      {...common}
      className="input"
      type="text"
      placeholder={field.placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FieldsBlock({ fields, values, errors, disabled, onChange }) {
  return (
    <div className="schema-form-fields">
      {fields.map((field) => {
        if (field.type === "section") {
          return (
            <fieldset key={field.key} className="schema-form-section">
              {field.label ? <legend>{field.label}</legend> : null}
              <FieldsBlock
                fields={field.fields}
                values={values}
                errors={errors}
                disabled={disabled}
                onChange={onChange}
              />
            </fieldset>
          );
        }
        if (field.type === "tabs") {
          return (
            <SchemaTabs
              key={field.key}
              field={field}
              values={values}
              errors={errors}
              disabled={disabled}
              onChange={onChange}
            />
          );
        }

        const hideLabel = field.type === "checkbox" || field.type === "switch";
        return (
          <div key={field.key} className="schema-form-field">
            {!hideLabel && (
              <label htmlFor={`schema-field-${field.key}`} id={`schema-field-${field.key}-label`}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
            )}
            <FieldControl
              field={field}
              value={values[field.key]}
              error={errors[field.key]}
              disabled={disabled}
              onChange={(next) => onChange(field.key, next)}
            />
            {field.help ? <p className="schema-form-help">{field.help}</p> : null}
            {errors[field.key] ? <p className="schema-form-error">{errors[field.key]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function SchemaTabs({ field, values, errors, disabled, onChange }) {
  const [active, setActive] = useState(field.tabs?.[0]?.key || "");
  const tab = (field.tabs || []).find((t) => t.key === active) || field.tabs?.[0];
  return (
    <div className="schema-form-tabs">
      <div className="schema-form-tablist" role="tablist">
        {(field.tabs || []).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className={t.key === (tab?.key) ? "is-active" : ""}
            aria-selected={t.key === tab?.key}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab ? (
        <FieldsBlock
          fields={tab.fields}
          values={values}
          errors={errors}
          disabled={disabled}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   schemaUi: object,
 *   values?: Record<string, unknown>,
 *   onChange?: (values: Record<string, unknown>) => void,
 *   onSubmit?: (values: Record<string, unknown>) => void|Promise<void>,
 *   disabled?: boolean,
 *   submitLabel?: string,
 *   showSubmit?: boolean,
 * }} props
 */
export function SchemaForm({
  schemaUi,
  values: controlledValues,
  onChange,
  onSubmit,
  disabled = false,
  submitLabel = "Guardar",
  showSubmit = true,
}) {
  const schema = useMemo(() => normalizeSchema(schemaUi), [schemaUi]);
  const [internal, setInternal] = useState(() => emptyValuesFromSchema(schemaUi));
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const values = controlledValues ?? internal;

  const setValues = (next) => {
    if (controlledValues == null) setInternal(next);
    onChange?.(next);
  };

  const handleField = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = validateAgainstSchema(schemaUi, values);
    setErrors(result.errors);
    if (!result.ok || !onSubmit) return;
    setPending(true);
    try {
      await onSubmit(values);
    } finally {
      setPending(false);
    }
  };

  if (!schema.fields.length) {
    return <div className="schema-form-empty">Este módulo no tiene campos configurados.</div>;
  }

  return (
    <form className={`schema-form schema-form--${schema.layout}`} onSubmit={handleSubmit}>
      {schema.title ? <h3 className="schema-form-title">{schema.title}</h3> : null}
      {schema.description ? <p className="schema-form-desc">{schema.description}</p> : null}
      <FieldsBlock
        fields={schema.fields}
        values={values}
        errors={errors}
        disabled={disabled || pending}
        onChange={handleField}
      />
      {showSubmit && onSubmit ? (
        <div className="schema-form-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={disabled || pending}>
            {pending ? "Guardando…" : submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  );
}
