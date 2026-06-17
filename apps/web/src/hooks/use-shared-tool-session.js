import { useCallback, useEffect, useMemo, useState } from "react";
import { sharingApi } from "@/lib/network-api.js";
import { prospectRowToClient, canEditShared } from "@/lib/shared-prospect";

export function useSharedToolSession(prospectId, contactId) {
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState("view");
  const [prospect, setProspect] = useState(null);
  const [tools, setTools] = useState({});

  const reload = useCallback(async () => {
    if (!prospectId) return null;
    const data = await sharingApi.getSharedProspect(prospectId);
    setPermission(data.permission);
    setProspect(prospectRowToClient(data.prospect));
    setTools(data.tools || {});
    return data;
  }, [prospectId]);

  useEffect(() => {
    if (!prospectId) return;
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prospectId, reload]);

  const canEdit = canEditShared(permission);
  const readOnly = !canEdit;
  const backHref = contactId
    ? `/red/contacto/${contactId}/expediente/${prospectId}`
    : `/network`;

  const getToolData = useCallback((tool) => tools[tool] || {}, [tools]);

  const saveTool = useCallback(async (tool, data) => {
    const saved = await sharingApi.saveTool(prospectId, tool, data);
    setTools((prev) => ({ ...prev, [tool]: saved }));
    return saved;
  }, [prospectId]);

  return useMemo(() => ({
    ready: !loading && !!prospect,
    loading,
    permission,
    prospect,
    canEdit,
    readOnly,
    backHref,
    getToolData,
    saveTool,
    reload,
  }), [
    loading,
    permission,
    prospect,
    canEdit,
    readOnly,
    backHref,
    getToolData,
    saveTool,
    reload,
  ]);
}
