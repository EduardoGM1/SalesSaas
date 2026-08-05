/**
 * Checklist de permisos del delegante (techo) para Asistentes.
 */
import { useEffect, useState } from "react";

export function DelegacionChecklist({
  ceiling = [],
  selected = [],
  onChange,
  loading = false,
  emptyLabel = "No hay permisos que puedas delegar.",
}) {
  const [local, setLocal] = useState(() => new Set(selected));

  useEffect(() => {
    setLocal(new Set(selected));
  }, [selected]);

  const toggle = (clave) => {
    const next = new Set(local);
    if (next.has(clave)) next.delete(clave);
    else next.add(clave);
    setLocal(next);
    onChange?.([...next]);
  };

  if (loading) return <p className="team-hint">Cargando permisos…</p>;
  if (!ceiling.length) return <p className="team-empty">{emptyLabel}</p>;

  return (
    <ul className="team-extras-list">
      {ceiling.map((clave) => (
        <li key={clave}>
          <label className="team-extras-item">
            <input
              type="checkbox"
              checked={local.has(clave)}
              onChange={() => toggle(clave)}
            />
            <span>{clave}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
