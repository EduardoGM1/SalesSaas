"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Topbar } from "@/components/layout/topbar";
import { clientDisplayName } from "@/lib/clients";
import { computeSurvey, fmt, fmtD, surveyHasData } from "@/lib/calculations/survey";
import { useDbStore } from "@/stores/db-store";

export function AnalysisPage({ clientId }: { clientId: string }) {
  const getClient = useDbStore((s) => s.getClient);
  const c = getClient(clientId);
  const survey = useMemo(
    () => (c?.data?.survey || {}) as Record<string, string>,
    [c?.data?.survey]
  );
  const result = useMemo(() => computeSurvey(survey, String(survey.stype || "hotel")), [survey]);
  const hasData = surveyHasData(survey);

  const rows: { label: string; vac: string; night: string; dp: string; mi: string }[] = [
    { label: "Viaje actual", vac: String(result.current.vac), night: fmtD(result.current.night), dp: fmt(result.current.dp), mi: fmt(result.current.mi) },
    { label: "Histórico", vac: fmtD(result.hist.vac), night: fmtD(result.hist.night), dp: fmt(result.hist.dp), mi: fmt(result.hist.mi) },
    { label: "Viajes futuros", vac: fmtD(result.future.vac), night: fmtD(result.future.night), dp: fmt(result.future.dp), mi: fmt(result.future.mi) },
    { label: "Patrones", vac: fmtD(result.pattern.vac), night: fmtD(result.pattern.night), dp: fmt(result.pattern.dp), mi: fmt(result.pattern.mi) },
  ];

  return (
    <>
      <Topbar title="Análisis" subtitle="Patrón de vacaciones" />
      <div className="sales-page">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <Link href={`/clients/${clientId}`} className="btn btn-ghost btn-sm">← Volver</Link>
          <div>
            <div className="page-title">Análisis</div>
            <div className="page-sub">Patrón de vacaciones{c ? ` · ${clientDisplayName(c)}` : ""}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-heading">Patrón de vacaciones</div>
          <div className="card-sub">Calculado con la información guardada en el Survey de este expediente.</div>
          {!hasData && (
            <div className="analysis-empty">Este expediente todavía no tiene Survey guardado. Captura y guarda el Survey del cliente para ver su patrón de vacaciones.</div>
          )}
          <table className="dtbl pattern-table">
            <thead>
              <tr>
                <th>Fuente</th>
                <th className="td-r">Vacaciones al año</th>
                <th className="td-r">Noches al año</th>
                <th className="td-r">Enganche</th>
                <th className="td-r">Mensualidad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} style={i === rows.length - 1 ? { borderTop: "2px solid var(--border)", fontWeight: 700 } : undefined}>
                  <td>{r.label}</td>
                  <td className="td-r td-blue">{r.vac}</td>
                  <td className="td-r td-blue">{r.night}</td>
                  <td className="td-r td-blue">{r.dp}</td>
                  <td className="td-r td-green">{r.mi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
