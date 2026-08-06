/**
 * Panel operacional: carga/guarda datos de un módulo custom para una entidad.
 */
import { useEffect, useState } from "react";
import { SchemaForm } from "@/components/custom-modules/SchemaForm.jsx";
import { emptyValuesFromSchema } from "@/lib/custom-modules/schema-engine.js";
import { customModulesApi } from "@/lib/custom-modules-api.js";
import { toast } from "@/lib/toast";

export function CustomModulePanel({
  modulo,
  entidadId,
  canEdit = true,
}) {
  const [values, setValues] = useState(() => emptyValuesFromSchema(modulo?.schema_ui));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!modulo?.id || !entidadId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    customModulesApi.getDatos(modulo.id, entidadId)
      .then((payload) => {
        if (cancelled) return;
        const base = emptyValuesFromSchema(payload?.modulo?.schema_ui || modulo.schema_ui);
        setValues({ ...base, ...(payload?.datos || {}) });
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [modulo?.id, entidadId, modulo?.schema_ui]);

  if (loading) {
    return <div className="schema-form-empty">Cargando módulo…</div>;
  }
  if (error) {
    return <div className="schema-form-error">{error}</div>;
  }

  return (
    <SchemaForm
      schemaUi={modulo.schema_ui}
      values={values}
      onChange={setValues}
      disabled={!canEdit}
      showSubmit={canEdit}
      submitLabel="Guardar"
      onSubmit={async (next) => {
        await customModulesApi.saveDatos(modulo.id, entidadId, next);
        toast.success("Datos guardados");
      }}
    />
  );
}
