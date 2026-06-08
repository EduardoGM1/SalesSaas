"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { MONTHS } from "@/lib/constants";
import { computeMetasKpis } from "@/lib/calculations/calendar";
import { fmt, fmtN, onlyDigits } from "@/lib/format/money";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";

export function MetasPage() {
  const hydrated = useAppStore((s) => s.hydrated);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);
  const getCalMonth = useDbStore((s) => s.getCalMonth);
  const getGoalMonth = useDbStore((s) => s.getGoalMonth);
  const saveGoalMonth = useDbStore((s) => s.saveGoalMonth);

  const [vol, setVol] = useState("");
  const [tours, setTours] = useState("");
  const [ventas, setVentas] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const g = getGoalMonth(calYear, calMonth);
    setVol(g.vol ? fmtN(g.vol) : "");
    setTours(g.tours ? String(g.tours) : "");
    setVentas(g.ventas ? String(g.ventas) : "");
  }, [calYear, calMonth, getGoalMonth]);

  const data = getCalMonth(calYear, calMonth);
  const kpis = useMemo(() => computeMetasKpis(
    calYear, calMonth, data,
    Number(onlyDigits(vol)) || 0,
    Number(onlyDigits(tours)) || 0,
    Number(onlyDigits(ventas)) || 0,
  ), [calYear, calMonth, data, vol, tours, ventas]);

  const formatVol = () => {
    const raw = onlyDigits(vol);
    setVol(raw ? Number(raw).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "");
  };

  if (!hydrated) return <Topbar title="Metas" subtitle="Cargando..." />;

  const diasTrab = Math.max(0, kpis.dim - kpis.descDays);

  return (
    <>
      <Topbar title="Metas" subtitle="Objetivos del mes en curso" />
      <div className="sales-page">
        <PageBack />
        <div className="page-head">
          <div>
            <div className="page-title">Metas</div>
            <div className="page-sub">{MONTHS[calMonth]} {calYear}</div>
          </div>
          <div className="local-month-nav">
            <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label="Mes anterior">‹</button>
            <div className="local-month-label">{MONTHS[calMonth]} {calYear}</div>
            <button type="button" className="tb-nav-btn" onClick={calNext} aria-label="Mes siguiente">›</button>
          </div>
        </div>

        <div className="g2">
          <div className="card">
            <div className="card-heading">Meta del mes</div>
            <div className="card-sub">Ingresa tus objetivos para el mes en curso</div>

            <div className="frow" style={{ paddingTop: 0, borderTop: "none" }}>
              <div className="flabel"><strong>Año</strong></div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>{calYear}</div>
            </div>
            <div className="frow">
              <div className="flabel"><strong>Mes</strong></div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 16, fontWeight: 600, color: "var(--blue)" }}>{MONTHS[calMonth]}</div>
            </div>

            <hr style={{ margin: "14px 0 10px" }} />

            <div className="frow" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="flabel">
                <strong>Volumen</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>¿Cuánto quieres vender?</span>
              </div>
              <input type="text" className="goal-plain-input" placeholder="200,000" inputMode="numeric" value={vol} onChange={(e) => setVol(e.target.value)} onBlur={formatVol} />
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>Tours</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Parejas que tendrás este mes</span>
              </div>
              <input type="text" className="goal-plain-input small" placeholder="20" inputMode="numeric" value={tours} onChange={(e) => setTours(e.target.value)} />
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>Ventas</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Ventas que planeas lograr</span>
              </div>
              <input type="text" className="goal-plain-input small" placeholder="5" inputMode="numeric" value={ventas} onChange={(e) => setVentas(e.target.value)} />
            </div>

            <hr style={{ margin: "14px 0 10px" }} />

            <div className="frow" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="flabel">
                <strong>Días de descanso</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Se toma del calendario (tipo Descanso)</span>
              </div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{kpis.descDays}</div>
            </div>
            <div className="frow">
              <div className="flabel">
                <strong>Días trabajados</strong>
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--muted)" }}>Días del mes − días de descanso</span>
              </div>
              <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 18, fontWeight: 700, color: "var(--blue)" }}>{diasTrab}</div>
            </div>

            <div className="hint" style={{ marginTop: 14 }}>
              Registra tus días de descanso en el <strong>Calendario</strong> usando el tipo <strong>&quot;Descanso&quot;</strong> y se actualizará automáticamente aquí.
            </div>

            <button type="button" className="btn btn-primary btn-full" style={{ marginTop: 16 }} onClick={() => {
              saveGoalMonth(calYear, calMonth, {
                vol: Number(onlyDigits(vol)) || 0,
                tours: Number(onlyDigits(tours)) || 0,
                ventas: Number(onlyDigits(ventas)) || 0,
              });
              setSaved(true);
              setTimeout(() => setSaved(false), 1600);
            }}>{saved ? "¡Meta guardada!" : "Guardar meta del mes"}</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card">
              <div className="card-heading">KPIs proyectados</div>
              <div className="card-sub">Calculados automáticamente con tus datos</div>
              <div className="g2" style={{ gap: 12 }}>
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.vprom)}</div>
                  <div className="vbox-label">Venta promedio</div>
                  <div className="vbox-sub">Volumen ÷ Ventas</div>
                </div>
                <div className="vbox green">
                  <div className="vbox-val">{fmt(kpis.efic)}</div>
                  <div className="vbox-label">Eficiencia / VPG</div>
                  <div className="vbox-sub">Volumen ÷ Tours</div>
                </div>
                <div className="vbox yellow">
                  <div className="vbox-val">{kpis.cierre.toFixed(2)}%</div>
                  <div className="vbox-label">% Cierre</div>
                  <div className="vbox-sub">Ventas ÷ Tours</div>
                </div>
                <div className="vbox blue">
                  <div className="vbox-val">{fmt(kpis.prod)}</div>
                  <div className="vbox-label">Producción diaria meta</div>
                  <div className="vbox-sub">Volumen ÷ Días trabajados</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-heading">Desglose del mes</div>
              <div className="card-sub">Cómo se distribuye tu meta</div>
              <table className="dtbl">
                <tbody>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Días del mes</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.dim}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Días de descanso</td><td className="td-r td-red">{kpis.descDays}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Días trabajados</td><td className="td-r td-blue">{diasTrab}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Meta semanal aprox.</td><td className="td-r td-green">{fmt(kpis.semanal)}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Tours por día (aprox.)</td><td className="td-r" style={{ fontFamily: "var(--font-geist-mono), monospace", fontWeight: 600 }}>{kpis.toursDia}</td></tr>
                  <tr><td style={{ color: "var(--muted)", fontSize: 12 }}>Producción diaria approx.</td><td className="td-r td-green">{fmt(kpis.prod)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
