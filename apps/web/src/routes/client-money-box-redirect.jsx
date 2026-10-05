import { useLayoutEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAppStore } from "@/stores/app-store.js";

/** Legacy /clients/:id/money-box → herramientas con contexto de expediente. */
export function ClientMoneyBoxRedirect() {
  const { id } = useParams();
  const setToolMode = useAppStore((s) => s.setToolMode);

  useLayoutEffect(() => {
    if (id) setToolMode("client", id);
  }, [id, setToolMode]);

  return <Navigate to="/tools/money-box" replace />;
}
