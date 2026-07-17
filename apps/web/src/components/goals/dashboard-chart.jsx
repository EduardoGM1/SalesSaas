
import { useRef, useState } from "react";
import { SaleDetailModal } from "@/components/sales/sale-detail-modal.jsx";
import { useUserFeatures } from "@/hooks/use-user-features.js";
import { useMoney } from "@/hooks/use-money.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { longDate } from "@/lib/format/dates";
import { DashboardWeek } from "@/lib/calculations/calendar";

function saleLabel(item) {
  return item.clientName || item.note?.split(" · ")[0] || item.contract || "—";
}

export function DashboardChart({
  weeks,
  showTarget = true,
  showReal = true,
}: {
  weeks: DashboardWeek[];
  showTarget?: boolean;
  showReal?: boolean;
}) {
  const { fmt, fmtN } = useMoney();
  const { t, lang } = useI18n();
  const { canViewSaleModal, canViewSaleDetail } = useUserFeatures();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [viewSaleId, setViewSaleId] = useState<string | null>(null);

  if (!showTarget && !showReal) {
    return (
      <div className="dash-chart-empty">
        <div>
          <strong>{t("goals.chartSelectSeries")}</strong>
          <br />
          {t("goals.chartSelectSeriesHint")}
        </div>
      </div>
    );
  }

  const values = weeks.flatMap((w) => {
    const v: number[] = [];
    if (showTarget) v.push(w.obj || 0);
    if (showReal) v.push(w.real || 0);
    return v;
  });
  const maxVal = Math.max(0, ...values);

  if (maxVal <= 0) {
    return (
      <div className="dash-chart-empty">
        <div>
          <strong>{t("goals.chartEmpty")}</strong>
          <br />
          {t("goals.chartEmptyHint")}
        </div>
      </div>
    );
  }

  const yMax = Math.ceil((maxVal * 1.12) / 10000) * 10000 || maxVal;
  const W = 760;
  const H = 315;
  const m = { l: 72, r: 26, t: 16, b: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = Math.max(weeks.length, 1);
  const weekNos = weeks.map((w) => w.weekNo);
  const weekFrom = weekNos.length ? Math.min(...weekNos) : 0;
  const weekTo = weekNos.length ? Math.max(...weekNos) : 0;
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => m.t + ih - (Math.max(0, Math.min(yMax, v)) / yMax) * ih;

  const targetPts = showTarget
    ? weeks.map((w, i) => [x(i), y(w.obj || 0)] as [number, number])
    : [];
  const areaPath = targetPts.length
    ? `M ${targetPts[0][0]} ${m.t + ih} L ${targetPts.map((p) => p.join(" ")).join(" L ")} L ${targetPts[targetPts.length - 1][0]} ${m.t + ih} Z`
    : "";
  const linePath = targetPts.length ? `M ${targetPts.map((p) => p.join(" ")).join(" L ")}` : "";
  const ticks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];
  const barW = Math.max(18, Math.min(42, iw / (n * 5)));
  const colW = n > 1 ? iw / (n - 1) : iw;

  const activeWeek = hoverIdx != null ? weeks[hoverIdx] : null;

  const showTip = (i: number, evt: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = ((evt.clientX - rect.left) / rect.width) * W;
    const localY = ((evt.clientY - rect.top) / rect.height) * H;
    setHoverIdx(i);
    setTipPos({
      x: Math.min(Math.max(localX, 120), W - 180),
      y: Math.max(localY - 12, 24),
    });
  };

  const hideTip = () => setHoverIdx(null);

  return (
    <div className="dash-area-chart" ref={wrapRef} onMouseLeave={hideTip}>
      <svg viewBox={`0 0 ${W} ${H}`} className="dash-chart-svg" preserveAspectRatio="xMidYMid meet">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={m.l} x2={W - m.r} y1={y(tick)} y2={y(tick)} className="dash-grid-line" />
            <text x={m.l - 8} y={y(tick) + 4} textAnchor="end" className="dash-axis-label">{fmtN(tick)}</text>
          </g>
        ))}
        {showTarget && areaPath && <path d={areaPath} className="dash-area-fill" />}
        {showTarget && linePath && <path d={linePath} className="dash-target-line" fill="none" />}
        {weeks.map((w, i) => (
          <rect
            key={`hit-${w.weekNo}`}
            x={x(i) - colW / 2}
            y={m.t}
            width={colW}
            height={ih}
            fill="transparent"
            className="dash-col-hit"
            onMouseMove={(e) => showTip(i, e)}
          />
        ))}
        {showReal && weeks.map((w, i) => (
          <rect
            key={w.weekNo}
            x={x(i) - barW / 2}
            y={y(w.real || 0)}
            width={barW}
            height={Math.max(0, m.t + ih - y(w.real || 0))}
            className={`dash-real-bar${hoverIdx === i ? " dash-real-bar-active" : ""}`}
            rx={3}
            onMouseMove={(e) => showTip(i, e)}
          />
        ))}
        {showTarget && weeks.map((w, i) => (
          <circle
            key={`dot-${w.weekNo}`}
            cx={x(i)}
            cy={y(w.obj || 0)}
            r={hoverIdx === i ? 6 : 4}
            className={`dash-target-dot${hoverIdx === i ? " dash-target-dot-active" : ""}`}
            onMouseMove={(e) => showTip(i, e)}
          />
        ))}
        {weeks.map((w, i) => (
          <text key={`lbl-${w.weekNo}`} x={x(i)} y={H - 10} textAnchor="middle" className="dash-week-label">{w.weekNo}</text>
        ))}
      </svg>

      <div className="dash-week-axis-caption">
        <div className="dash-week-axis-caption-title">{t("goals.weekOfYearLabel")}</div>
        <div className="dash-week-axis-caption-range">
          {t("goals.weekOfYearRange", { from: weekFrom, to: weekTo })}
        </div>
      </div>

      {activeWeek && (
        <div
          className="dash-chart-tooltip"
          style={{ left: `${(tipPos.x / W) * 100}%`, top: `${(tipPos.y / H) * 100}%` }}
          onMouseEnter={() => setHoverIdx(hoverIdx)}
          onMouseLeave={hideTip}
        >
          <div className="dash-chart-tooltip-title">
            {t("goals.chartTip.week", { week: activeWeek.weekNo, range: activeWeek.range })}
          </div>
          {showTarget && (
            <div className="dash-chart-tooltip-row">
              <span>{t("goals.objective")}</span>
              <strong>{fmt(activeWeek.obj)}</strong>
            </div>
          )}
          {showReal && (
            <>
              <div className="dash-chart-tooltip-row">
                <span>{t("goals.real")}</span>
                <strong>{fmt(activeWeek.real)}</strong>
              </div>
              <div className="dash-chart-tooltip-row">
                <span>{t("goals.chartTip.sales")}</span>
                <strong>{fmtN(activeWeek.sales)}</strong>
              </div>
              <div className="dash-chart-tooltip-row">
                <span>{t("admin.table.tours")}</span>
                <strong>{fmtN(activeWeek.tours)}</strong>
              </div>
            </>
          )}
          {showReal && activeWeek.saleItems.length > 0 && (
            <div className="dash-chart-tooltip-sales">
              <div className="dash-chart-tooltip-sales-head">{t("goals.chartTip.saleList")}</div>
              {activeWeek.saleItems.map((item, idx) => (
                <div key={item.saleId || `${item.date}-${idx}`} className="dash-chart-tooltip-sale">
                  <div>
                    <div className="dash-chart-tooltip-sale-name">{saleLabel(item)}</div>
                    <div className="dash-chart-tooltip-sale-meta">
                      {[longDate(item.date, lang), item.contract ? t("exp.sales.contract", { contract: item.contract }) : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="dash-chart-tooltip-sale-right">
                    <strong>{fmt(item.vol)}</strong>
                    {canViewSaleModal && item.saleId && (
                      <button
                        type="button"
                        className="dg-link"
                        onClick={() => setViewSaleId(item.saleId || null)}
                      >
                        {t("common.viewSale")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showReal && !activeWeek.saleItems.length && (
            <div className="dash-chart-tooltip-empty">{t("goals.chartTip.noSales")}</div>
          )}
        </div>
      )}

      <SaleDetailModal
        open={!!viewSaleId}
        onOpenChange={(open) => { if (!open) setViewSaleId(null); }}
        saleId={viewSaleId}
        showTools={canViewSaleDetail}
      />
    </div>
  );
}
