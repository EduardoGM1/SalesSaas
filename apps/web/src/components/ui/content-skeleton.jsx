/**
 * Placeholders de carga con la geometría del contenido real.
 * Reutiliza el shimmer `admin-skeleton` del sistema.
 */
export function ToolCardSkeleton() {
  return (
    <div className="tool-card-stack">
      <div className="tool-card tool-card-skeleton" aria-hidden="true">
        <div className="tool-skel tool-skel-icon" />
        <div className="tool-skel-copy">
          <div className="tool-skel tool-skel-name" />
          <div className="tool-skel tool-skel-desc" />
        </div>
        <div className="tool-skel tool-skel-chevron" />
      </div>
    </div>
  );
}

export function ContentFade({ children, className = "" }) {
  return <div className={`content-ready ${className}`.trim()}>{children}</div>;
}

export function CalcCardSkeleton({ rows = 4, boxes = 3 }) {
  return (
    <div className="card tool-calc-card" aria-hidden="true">
      <div className="tool-skel tool-skel-heading" />
      <div className="tool-calc-fields">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="frow tool-frow">
            <div className="tool-skel tool-skel-label" />
            <div className="tool-skel tool-skel-input" />
          </div>
        ))}
      </div>
      {boxes > 0 ? (
        <div className="g2 survey-result-pair" style={{ marginTop: 14 }}>
          {Array.from({ length: boxes }, (_, i) => (
            <div key={i} className={`tool-skel tool-skel-vbox${i === boxes - 1 && boxes > 2 ? " span2" : ""}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TableCardSkeleton({ rows = 6 }) {
  return (
    <div className="card tool-calc-card" style={{ marginTop: 12 }} aria-hidden="true">
      <div className="tool-skel tool-skel-heading" />
      <div className="tool-skel-table">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="tool-skel tool-skel-table-row" />
        ))}
      </div>
    </div>
  );
}

export function WorksheetRhSkeleton() {
  return (
    <>
      <div className="admin-subnav worksheet-rh-tabs" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="tool-skel tool-skel-tab" />
        ))}
      </div>
      <CalcCardSkeleton rows={5} boxes={3} />
      <CalcCardSkeleton rows={4} boxes={2} />
    </>
  );
}
