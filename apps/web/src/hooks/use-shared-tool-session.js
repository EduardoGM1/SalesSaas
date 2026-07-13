import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sharingApi } from "@/lib/network-api.js";
import { prospectRowToClient, canEditShared } from "@/lib/shared-prospect";
import { EMPTY_TOOL_BUCKET } from "@/lib/store-empty.js";
import { useExpedienteCollab } from "@/hooks/use-expediente-collab.js";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n.js";

export function useSharedToolSession(prospectId, contactId, section = "detail") {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState("view");
  const [prospect, setProspect] = useState(null);
  const [tools, setTools] = useState({});
  const onDataChangeRef = useRef(null);

  const reload = useCallback(async () => {
    if (!prospectId) return null;
    const data = await sharingApi.getSharedProspect(prospectId);
    setPermission(data.permission);
    setProspect(prospectRowToClient(data.prospect));
    setTools(data.tools || {});
    return data;
  }, [prospectId]);

  const reloadTool = useCallback(async (tool) => {
    if (!prospectId || !tool) return;
    const data = await sharingApi.getTool(prospectId, tool);
    setTools((prev) => ({ ...prev, [tool]: data || {} }));
  }, [prospectId]);

  useEffect(() => {
    if (!prospectId) return;
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [prospectId, reload]);

  const canEdit = canEditShared(permission);

  onDataChangeRef.current = async (payload) => {
    try {
      if (payload?.table === "tool_calculations" && payload.tool) {
        await reloadTool(payload.tool);
        if (payload.tool === section) {
          toast.success(t("collab.remoteUpdated"));
        }
        return;
      }
      if (payload?.table === "prospects") {
        await reload();
      }
    } catch {
      /* ignore */
    }
  };

  const collab = useExpedienteCollab({
    prospectId,
    section,
    wantEdit: canEdit && section !== "detail",
    enabled: !!prospectId,
    onDataChange: (payload) => onDataChangeRef.current?.(payload),
  });

  const readOnly = !canEdit || collab.sectionLocked;
  const backHref = contactId
    ? `/red/contacto/${contactId}/expediente/${prospectId}`
    : `/network`;

  const getToolData = useCallback((tool) => tools[tool] || EMPTY_TOOL_BUCKET, [tools]);

  const saveTool = useCallback(async (tool, data) => {
    if (collab.sectionLocked) {
      throw new Error(t("collab.sectionLocked", { name: collab.lockedBy?.name || t("collab.someone") }));
    }
    const saved = await sharingApi.saveTool(prospectId, tool, data);
    setTools((prev) => ({ ...prev, [tool]: saved }));
    return saved;
  }, [prospectId, collab.sectionLocked, collab.lockedBy, t]);

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
    peers: collab.peers,
    lockedBy: collab.lockedBy,
    sectionLocked: collab.sectionLocked,
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
    collab.peers,
    collab.lockedBy,
    collab.sectionLocked,
  ]);
}
