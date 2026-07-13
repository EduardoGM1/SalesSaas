import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sharingApi } from "@/lib/network-api.js";
import { prospectRowToClient, canEditShared } from "@/lib/shared-prospect";
import { EMPTY_TOOL_BUCKET } from "@/lib/store-empty.js";
import { useExpedienteCollab } from "@/hooks/use-expediente-collab.js";
import { markLocalToolSave, notifyRemoteSectionUpdated, wasLocalToolSaveRecent } from "@/lib/collab-remote-notify.js";
import { useI18n } from "@/hooks/use-i18n.js";

export function useSharedToolSession(prospectId, contactId, section = "detail") {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(null);
  const [prospect, setProspect] = useState(null);
  const [tools, setTools] = useState({});
  const [toolsRevision, setToolsRevision] = useState(0);
  const onDataChangeRef = useRef(null);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  const bumpTools = useCallback((updater) => {
    setTools(updater);
    setToolsRevision((n) => n + 1);
  }, []);

  const reload = useCallback(async () => {
    if (!prospectId) return null;
    const data = await sharingApi.getSharedProspect(prospectId);
    setPermission(data.permission);
    setProspect(prospectRowToClient(data.prospect));
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

  onDataChangeRef.current = async (payload) => {
    try {
      if (payload?.table === "tool_calculations" && payload.tool) {
        // Eco del propio guardado: ya actualizamos en saveTool; no re-bump.
        if (wasLocalToolSaveRecent(prospectId, payload.tool)) {
          return;
        }
        if (payload.data != null && typeof payload.data === "object") {
          bumpTools((prev) => ({ ...prev, [payload.tool]: payload.data }));
        } else {
          await reloadTool(payload.tool);
        }
        if (payload.tool === sectionRef.current) {
          notifyRemoteSectionUpdated({
            prospectId,
            tool: payload.tool,
            message: t("collab.remoteUpdated"),
            eventId: payload.eventId || `${payload.tool}:${payload.commit_timestamp}`,
            source: "shared-session",
          });
        }
        return;
      }
      if (payload?.table === "prospects") {
        // Solo actualizar prospecto — NO recargar tools (pisaría ediciones en curso).
        if (payload.data && typeof payload.data === "object") {
          setProspect(prospectRowToClient(payload.data));
        } else {
          const data = await sharingApi.getSharedProspect(prospectId);
          setPermission(data.permission);
          setProspect(prospectRowToClient(data.prospect));
        }
      }
    } catch {
      /* ignore */
    }
  };

  const collab = useExpedienteCollab({
    prospectId,
    section,
    wantEdit: !loading && canEdit && section !== "detail",
    enabled: !!prospectId,
    onDataChange: (payload) => onDataChangeRef.current?.(payload),
  });

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
    toolsRevision,
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
    toolsRevision,
    collab,
  ]);
}
