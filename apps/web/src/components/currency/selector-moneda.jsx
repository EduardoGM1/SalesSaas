import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { saveSettingsPatchRemote } from "@/actions/settings.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import {
  CAPTURE_CURRENCIES,
  normalizeCaptureCurrency,
  resolveUsdToMxnRate,
} from "@/lib/currency/moneda-service";
import { selectOnFocus } from "@/lib/focus-select.js";
import { toast } from "@/lib/toast";

const CURRENCY_OPTIONS = [
  { id: "USD", flag: "🇺🇸", label: "USD" },
  { id: "MXN", flag: "🇲🇽", label: "MXN" },
];

/**
 * Selector unificado de moneda: dropdown USD/MXN + edición inline del TC manual.
 * La moneda activa es GLOBAL (profiles.settings.activeCaptureCurrency).
 * Extensible: agregar divisas a CURRENCY_OPTIONS / CAPTURE_CURRENCIES.
 */
export function SelectorMoneda({
  value = "USD",
  onChange,
  onRateSaved,
  disabled = false,
  className = "",
}) {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const current = normalizeCaptureCurrency(value);
  const [rateOpen, setRateOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState("18");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef(null);

  const savedRate = resolveUsdToMxnRate(settings);
  const language = settings?.language === "en" ? "en" : "es";

  useEffect(() => {
    if (!rateOpen) return;
    setRateDraft(String(Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 18));
  }, [rateOpen, savedRate]);

  useEffect(() => {
    if (!rateOpen) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setRateOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [rateOpen]);

  const rateHint = useMemo(() => {
    const rate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 18;
    return `1 USD = ${rate.toLocaleString(language === "en" ? "en-US" : "es-MX", {
      maximumFractionDigits: 4,
    })} MXN`;
  }, [savedRate, language]);

  const handleCurrencyChange = (event) => {
    const next = normalizeCaptureCurrency(event.target.value);
    if (next === current) return;
    onChange?.(next);
  };

  const handleSaveRate = async () => {
    if (disabled || saving) return;
    const usdToMxnRate = Number(rateDraft);
    if (!Number.isFinite(usdToMxnRate) || usdToMxnRate <= 0) {
      toast.error("Captura un tipo de cambio válido.");
      return;
    }
    setSaving(true);
    try {
      await saveSettingsPatchRemote({
        exchangeMode: "manual",
        usdToMxnRate,
        exchangeRate: settings?.currency === "MXN" ? usdToMxnRate : (settings?.exchangeRate || 1),
        exchangeRateUpdatedAt: new Date().toISOString(),
      });
      onRateSaved?.(usdToMxnRate);
      setRateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el tipo de cambio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`selector-moneda${className ? ` ${className}` : ""}`}
    >
      <div className="selector-moneda-row">
        <label className="selector-moneda-select-wrap">
          <span className="sr-only">Moneda</span>
          <select
            className="selector-moneda-select"
            value={current}
            disabled={disabled}
            onChange={handleCurrencyChange}
            aria-label="Seleccionar moneda"
          >
            {CURRENCY_OPTIONS.filter((opt) => CAPTURE_CURRENCIES.includes(opt.id)).map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.flag} {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="selector-moneda-rate-btn"
          disabled={disabled}
          aria-expanded={rateOpen}
          aria-label="Editar tipo de cambio"
          title={rateHint}
          onClick={() => setRateOpen((v) => !v)}
        >
          <Pencil size={14} aria-hidden />
        </button>
      </div>

      <p className="selector-moneda-hint">{rateHint}</p>

      {rateOpen ? (
        <div className="selector-moneda-popover" role="dialog" aria-label="Tipo de cambio">
          <div className="flabel">Tipo de cambio manual (1 USD = ? MXN)</div>
          <div className="selector-moneda-popover-row">
            <div className="mfield">
              <span className="mpfx mpfx--code">MXN</span>
              <input
                type="text"
                inputMode="decimal"
                value={rateDraft}
                disabled={disabled || saving}
                onFocus={selectOnFocus}
                onChange={(e) => setRateDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveRate();
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={disabled || saving}
              onClick={() => void handleSaveRate()}
            >
              {saving ? "…" : "Guardar"}
            </button>
          </div>
          <p className="selector-moneda-popover-note">
            Interno de tu sala. No usa APIs de mercado. No recalcula históricos ya guardados.
          </p>
        </div>
      ) : null}
    </div>
  );
}
