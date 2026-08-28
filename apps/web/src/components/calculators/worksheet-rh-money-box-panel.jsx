import { useEffect, useMemo, useState } from "react";
import { MoneyBoxCalculator } from "@/components/calculators/money-box-calculator.jsx";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { termsFromRhFinanciamiento } from "@/lib/calculations/money-box";
import { toast } from "@/lib/toast";

/**
 * Money Box RH embebido en pestaña del Worksheet Royal Holiday.
 * Plazos y mensualidades: Catálogo RH (Financiamiento), misma fuente que Datos Financiamiento.
 * Restricciones (min/max enganche, etc.) siguen en rh_money_box_config por empresa.
 */
export function WorksheetRhMoneyBoxPanel({ empresaId, financiamiento, nacionalidad }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!empresaId) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const data = await royalHolidayApi.getMoneyBoxConfig(empresaId);
        if (!cancelled) setConfig(data);
      } catch (e) {
        if (!cancelled) {
          setErr(e.message || "No se pudo cargar la configuración Money Box.");
          setConfig(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [empresaId]);

  const terms = useMemo(
    () => termsFromRhFinanciamiento(financiamiento, nacionalidad || "mexicano"),
    [financiamiento, nacionalidad],
  );

  async function handleSaveRestrictions(restrictions) {
    if (!empresaId) throw new Error("Empresa requerida.");
    const data = await royalHolidayApi.saveMoneyBoxRestrictions(empresaId, restrictions);
    setConfig(data);
    toast.success("Restricciones Money Box guardadas para la empresa.");
  }

  if (!empresaId) {
    return <p className="muted">Activa un workspace de sala Royal Holiday para usar Money Box.</p>;
  }

  if (err) {
    return <p className="auth-error">{err}</p>;
  }

  return (
    <MoneyBoxCalculator
      embedded
      loading={loading}
      terms={terms}
      savedRestrictions={config?.restrictions}
      onSaveRestrictions={handleSaveRestrictions}
      termsHintKey="moneyBox.termsFromRhConfig"
      showCurrencySelector={false}
    />
  );
}
