import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";

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
