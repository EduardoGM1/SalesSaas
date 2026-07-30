import { useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "@/components/ui/collapsible-section.jsx";
import { SelectorMonedaCaptura } from "@/components/currency/selector-moneda-captura.jsx";
import { saveSettingsPatchRemote } from "@/actions/settings.js";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { resolveUsdToMxnRate } from "@/lib/currency/moneda-service";
import { selectOnFocus } from "@/lib/focus-select.js";
import { toast } from "@/lib/toast";

function formatRateDate(iso, language = "es") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(language === "en" ? "en-US" : "es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Panel colapsable de tipo de cambio manual (mismo patrón visual que
 * Restricciones de Money Box). Una sola fuente en profiles.settings
 * compartida por Vacaciones, Survey y Worksheet.
 */
export function PanelTipoCambio({ disabled = false, className = "" }) {
  const settings = useDbStore((s) => s.db.settings, shallow);
  const [open, setOpen] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [quoteCurrency, setQuoteCurrency] = useState("MXN");
  const [baseAmount, setBaseAmount] = useState("1");
  const [quoteAmount, setQuoteAmount] = useState("18");
  const [saving, setSaving] = useState(false);

  const savedRate = Number(settings?.usdToMxnRate || settings?.exchangeRate || 18);
  const savedAt = settings?.exchangeRateUpdatedAt || null;
  const language = settings?.language === "en" ? "en" : "es";

  useEffect(() => {
    if (open) return;
    setBaseCurrency("USD");
    setQuoteCurrency("MXN");
    setBaseAmount("1");
    setQuoteAmount(String(Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 18));
  }, [open, savedRate]);

  const summary = useMemo(() => {
    const rate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 18;
    const dateLabel = formatRateDate(savedAt, language);
    const rateText = `1 USD = ${rate.toLocaleString(language === "en" ? "en-US" : "es-MX", {
      maximumFractionDigits: 4,
    })} MXN`;
    return dateLabel ? `${rateText} · ${dateLabel}` : rateText;
  }, [savedRate, savedAt, language]);

  const handleSave = async () => {
    if (disabled || saving) return;
    if (baseCurrency === quoteCurrency) {
      toast.error("Elige dos monedas distintas para el tipo de cambio.");
      return;
    }
    const usdToMxnRate = resolveUsdToMxnRate(
      baseCurrency,
      quoteCurrency,
      Number(baseAmount),
      Number(quoteAmount),
    );
    if (!Number.isFinite(usdToMxnRate) || usdToMxnRate <= 0) {
      toast.error("Captura un tipo de cambio válido.");
      return;
    }
    setSaving(true);
    try {
      await saveSettingsPatchRemote({
        exchangeMode: "manual",
        usdToMxnRate,
        // Si la moneda visual es MXN, alinear exchangeRate; si es USD se mantiene 1.
        exchangeRate: settings?.currency === "MXN" ? usdToMxnRate : (settings?.exchangeRate || 1),
        exchangeRateUpdatedAt: new Date().toISOString(),
      });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el tipo de cambio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsibleSection
      className={`card panel-tipo-cambio${className ? ` ${className}` : ""}`}
      title={<div className="card-heading">Configurar tipo de cambio</div>}
      subtitle={summary}
      open={open}
      onOpenChange={setOpen}
      defaultOpen={false}
    >
      <p className="panel-tipo-cambio-hint">
        Tipo de cambio interno de tu sala (manual). No usa mercado ni APIs externas.
      </p>
      <div className="panel-tipo-cambio-grid">
        <div className="panel-tipo-cambio-side">
          <div className="flabel">Moneda base</div>
          <SelectorMonedaCaptura
            value={baseCurrency}
            onChange={setBaseCurrency}
            disabled={disabled || saving}
            className="panel-tipo-cambio-selector"
          />
          <div className="mfield">
            <span className="mpfx mpfx--code">{baseCurrency}</span>
            <input
              type="text"
              inputMode="decimal"
              value={baseAmount}
              disabled={disabled || saving}
              onFocus={selectOnFocus}
              onChange={(e) => setBaseAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        </div>
        <div className="panel-tipo-cambio-equals" aria-hidden>=</div>
        <div className="panel-tipo-cambio-side">
          <div className="flabel">Equivalente</div>
          <SelectorMonedaCaptura
            value={quoteCurrency}
            onChange={setQuoteCurrency}
            disabled={disabled || saving}
            className="panel-tipo-cambio-selector"
          />
          <div className="mfield">
            <span className="mpfx mpfx--code">{quoteCurrency}</span>
            <input
              type="text"
              inputMode="decimal"
              value={quoteAmount}
              disabled={disabled || saving}
              onFocus={selectOnFocus}
              onChange={(e) => setQuoteAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        </div>
      </div>
      <div className="panel-tipo-cambio-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || saving}
          onClick={() => void handleSave()}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </CollapsibleSection>
  );
}
