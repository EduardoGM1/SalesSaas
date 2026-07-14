import { useCallback, useEffect, useMemo, useState } from "react";
import { sharingApi } from "@/lib/network-api.js";
import { prospectRowToClient, canEditShared } from "@/lib/shared-prospect";
import { EMPTY_TOOL_BUCKET } from "@/lib/store-empty.js";
import { useExpedienteRealtime } from "@/hooks/use-expediente-realtime.js";
import { markLocalToolSave } from "@/lib/collab-remote-notify.js";

export function useSharedToolSession(prospectId, contactId, section = "detail") {
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(null);
  const [prospect, setProspect] = useState(null);
  const [tools, setTools] = useState({});
  const [toolsRevision, setToolsRevision] = useState(0);

  const bumpTools = useCallback((updater) => {
    setTools(updater);
    setToolsRevision((n) => n + 1);
  }, []);

  const reload = useCallback(async () => {
    if (!prospectId) return null;
    const data = await sharingApi.getSharedProspect(prospectId);
    setPermission(data.permission);
    setProspect(prospectRowToClient(data.prospect, {
      sales: data.sales,
      activities: data.activities,
      tools: data.tools,
    }));
    bumpTools(() => data.tools || {});
    return data;
  }, [prospectId, bumpTools]);

  const reloadTool = useCallback(async (tool) => {
    if (!prospectId || !tool) return;
    const data = await sharingApi.getTool(prospectId, tool);
    bumpTools((prev) => ({ ...prev, [tool]: data || {} }));
  }, [prospectId, bumpTools]);

  const patchProspect = useCallback((fields) => {
    if (!fields) return;
    setProspect((prev) => (prev ? { ...prev, ...fields } : prev));
  }, []);

  useEffect(() => {
    if (!prospectId) return;
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prospectId, reload]);

  const canEdit = canEditShared(permission);

  const collab = useExpedienteRealtime({
    prospectId,
    section,
    wantEdit: !loading && canEdit && section !== "detail",
    enabled: !!prospectId,
    toastOnToolUpdate: true,
    onToolChange: (payload) => {
      if (payload?.localEcho) return;
      if (payload?.data != null && typeof payload.data === "object") {
        bumpTools((prev) => ({ ...prev, [payload.tool]: payload.data }));
      } else if (payload?.tool) {
        reloadTool(payload.tool).catch(() => {});
      }
    },
    onProspectChange: (payload) => {
      if (payload?.data && typeof payload.data === "object") {
        setProspect(prospectRowToClient(payload.data));
      }
    },
  });

  // Revision de form desde bump local (toast vive solo en el hook realtime)
  const formRevision = toolsRevision;

  const readOnly = loading || !canEdit;
  const backHref = contactId
    ? `/red/contacto/${contactId}/expediente/${prospectId}`
    : `/network`;

  const getToolData = useCallback((tool) => tools[tool] || EMPTY_TOOL_BUCKET, [tools]);

  const saveTool = useCallback(async (tool, data) => {
    markLocalToolSave(prospectId, tool);
    void collab.unlockField?.();
    const saved = await sharingApi.saveTool(prospectId, tool, data);
    bumpTools((prev) => ({ ...prev, [tool]: saved }));
    return saved;
  }, [prospectId, collab.unlockField, bumpTools]);

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
    reloadTool,
    patchProspect,
    toolsRevision: formRevision,
    peers: collab.peers,
    lockedBy: collab.lockedBy,
    sectionLocked: collab.sectionLocked,
    hasOthers: collab.hasOthers,
    collab,
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
    reloadTool,
    patchProspect,
    formRevision,
    collab,
  ]);
}
