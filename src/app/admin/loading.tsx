export default function AdminLoading() {
  return (
    <div className="admin-page admin-loading" aria-busy="true" aria-label="Cargando">
      <div className="admin-page-head">
        <div className="admin-skeleton admin-skeleton-title" />
        <div className="admin-skeleton admin-skeleton-sub" />
      </div>
      <div className="admin-kpis">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="admin-kpi" key={i}>
            <div className="admin-skeleton admin-skeleton-label" />
            <div className="admin-skeleton admin-skeleton-value" />
          </div>
        ))}
      </div>
      <div className="client-table-card">
        <div className="admin-skeleton admin-skeleton-block" />
      </div>
    </div>
  );
}
