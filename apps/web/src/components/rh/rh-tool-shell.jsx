import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { CalcCardSkeleton, TableCardSkeleton } from "@/components/ui/content-skeleton.jsx";

export function RhToolShell({ title, subtitle, children, backHref = "/tools" }) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle || "Royal Holiday"} />
      <div className="sales-page tool-calc-page">
        <div className="page-toolbar">
          <PageBack inline href={backHref} />
        </div>
        {children}
      </div>
    </>
  );
}

/** Skeleton de herramienta RH: misma geometría que card + tabla. */
export function RhToolLoading({ title, subtitle, backHref = "/tools", variant = "form-table" }) {
  return (
    <RhToolShell title={title} subtitle={subtitle} backHref={backHref}>
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Cargando</span>
        {variant === "kpis" ? (
          <CalcCardSkeleton rows={0} boxes={3} />
        ) : (
          <CalcCardSkeleton rows={variant === "table" ? 1 : 4} boxes={variant === "table" ? 0 : 3} />
        )}
        {variant !== "form" && variant !== "kpis" ? <TableCardSkeleton /> : null}
      </div>
    </RhToolShell>
  );
}
