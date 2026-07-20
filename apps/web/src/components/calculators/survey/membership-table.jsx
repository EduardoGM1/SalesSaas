import { useI18n } from "@/hooks/use-i18n.js";
import { emptyMembership, MEMBERSHIP_TYPE_KEYS, YES_NO_KEYS } from "@/lib/survey/discovery-questions.js";

/** Tabla dinámica de membresías — labels i18n; valores yes/no/type por clave. */
export function MembershipTable({ rows = [], disabled = false, onChange }) {
  const { t } = useI18n();
  const displayRows = rows.length ? rows : [emptyMembership()];
  const setRows = (next) => onChange?.(next);

  const updateRow = (id, key, value) => {
    setRows(displayRows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const addRow = () => setRows([...displayRows, emptyMembership()]);
  const removeRow = (id) => {
    const next = displayRows.filter((r) => r.id !== id);
    // Conservar siempre la fila base preestablecida.
    setRows(next.length ? next : [emptyMembership()]);
  };

  return (
    <div className="disc-membership">
      <div className="table-scroll">
        <table className="mtbl disc-membership-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("survey.disc.membership.col.hotel")}</th>
              <th>{t("survey.disc.membership.col.place")}</th>
              <th>{t("survey.disc.membership.col.date")}</th>
              <th>{t("survey.disc.membership.col.cost")}</th>
              <th>{t("survey.disc.membership.col.paysMaint")}</th>
              <th>{t("survey.disc.membership.col.maintAmount")}</th>
              <th>{t("survey.disc.membership.col.paidFull")}</th>
              <th>{t("survey.disc.membership.col.type")}</th>
              <th>{t("survey.disc.membership.col.notes")}</th>
              <th aria-label={t("survey.disc.membership.remove")} />
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr key={row.id}>
                <td className="nc">{idx + 1}</td>
                <td>
                  <input
                    type="text"
                    placeholder={t("survey.disc.membership.ph.hotel")}
                    value={row.hotel || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "hotel", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder={t("survey.disc.membership.ph.place")}
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
                    <option value="">{t("survey.disc.membership.select")}</option>
                    {YES_NO_KEYS.map((k) => (
                      <option key={k} value={k}>{t(`survey.disc.${k}`)}</option>
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
                    <option value="">{t("survey.disc.membership.select")}</option>
                    {YES_NO_KEYS.map((k) => (
                      <option key={k} value={k}>{t(`survey.disc.${k}`)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={row.type || ""}
                    disabled={disabled}
                    onChange={(e) => updateRow(row.id, "type", e.target.value)}
                  >
                    <option value="">{t("survey.disc.membership.type.select")}</option>
                    {MEMBERSHIP_TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>{t(`survey.disc.membership.type.${k}`)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    placeholder={t("survey.disc.membership.ph.notes")}
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
                    title={t("survey.disc.membership.remove")}
                    aria-label={`${t("survey.disc.membership.remove")} ${idx + 1}`}
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
          {t("survey.disc.membership.add")}
        </button>
        <span className="card-sub" style={{ marginBottom: 0 }}>
          {t("survey.disc.membership.addHint")}
        </span>
      </div>
    </div>
  );
}
