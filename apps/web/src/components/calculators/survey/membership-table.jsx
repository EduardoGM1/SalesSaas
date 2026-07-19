import { emptyMembership, MEMBERSHIP_TYPES, YES_NO } from "@/lib/survey/discovery-questions.js";

/** Tabla dinámica de membresías — tipografía vía `.mtbl` del tema. */
export function MembershipTable({ rows = [], disabled = false, onChange }) {
  const setRows = (next) => onChange?.(next);

  const updateRow = (id, key, value) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addRow = () => setRows([...rows, emptyMembership()]);

  const removeRow = (id) => setRows(rows.filter((r) => r.id !== id));

  return (
    <div className="disc-membership">
      <div className="table-scroll">
        <table className="mtbl disc-membership-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Hotel / programa</th>
              <th>Lugar de compra</th>
              <th>Fecha</th>
              <th>Costo</th>
              <th>¿Paga mantenimiento?</th>
              <th>Monto mantenimiento</th>
              <th>¿Pagado totalmente?</th>
              <th>Tipo</th>
              <th>Notas</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11}>
                  <span className="card-sub" style={{ marginBottom: 0 }}>
                    Sin membresías registradas. Usa “+ Agregar membresía”.
                  </span>
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <tr key={row.id}>
                <td className="nc">{idx + 1}</td>
                <td>
                  <input
                    type="text"
                    placeholder="Hotel o programa"
                    value={row.hotel || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "hotel", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Lugar de compra"
                    value={row.place || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "place", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={row.date || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "date", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    placeholder="USD"
                    value={row.cost ?? ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "cost", e.target.value)}
                  />
                </td>
                <td>
                  <select
                    value={row.paysMaint || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "paysMaint", e.target.value)}
                  >
                    <option value="">Selecciona</option>
                    {YES_NO.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    placeholder="USD"
                    value={row.maintAmount ?? ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "maintAmount", e.target.value)}
                  />
                </td>
                <td>
                  <select
                    value={row.paidFull || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "paidFull", e.target.value)}
                  >
                    <option value="">Selecciona</option>
                    {YES_NO.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={row.type || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "type", e.target.value)}
                  >
                    <option value="">Tipo</option>
                    {MEMBERSHIP_TYPES.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Notas"
                    value={row.notes || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={disabled}
                    title="Eliminar membresía"
                    aria-label={`Eliminar membresía ${idx + 1}`}
                    onClick={() => removeRow(row.id)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="disc-table-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={addRow}>
          + Agregar membresía
        </button>
        <span className="card-sub" style={{ marginBottom: 0 }}>
          Se pueden agregar tantas filas como sean necesarias.
        </span>
      </div>
    </div>
  );
}
