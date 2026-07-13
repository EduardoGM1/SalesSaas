import { useCallback, useMemo, useState } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useSharedToolSession } from "@/hooks/use-shared-tool-session";
import { useExpedienteRealtime } from "@/hooks/use-expediente-realtime.js";
import { resolveToolBackHref } from "@/lib/calculator-nav.js";
import { ensureProspectIdentity } from "@/lib/clients";
import { sharingApi } from "@/lib/network-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isExpedienteUuid } from "@/lib/expediente-realtime.js";
import { markLocalToolSave } from "@/lib/collab-remote-notify.js";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";

/** Unifica carga/guardado local (store) y remoto (expediente compartido). */
export function useToolSession({ clientId, shared, section }) {
  const useShared = !!shared?.prospectId;
  const toolSection = section
    || (typeof window !== "undefined" && window.location?.pathname?.includes("/worksheet") && "worksheet")
    || (typeof window !== "undefined" && window.location?.pathname?.includes("/vacaciones") && "vacaciones")
    || (typeof window !== "undefined" && window.location?.pathname?.includes("/survey") && "survey")
    || "detail";

  const sharedSession = useSharedToolSession(
    shared?.prospectId,
    shared?.contactId,
    useShared ? toolSection : "detail",
  );
  const localReady = useToolBucketReady(useShared ? undefined : clientId);
  const localClient = useDbStore((s) => (clientId ? s.db.clients[clientId] : undefined), shallow);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const getClient = useDbStore((s) => s.getClient);
  const saveClient = useDbStore((s) => s.saveClient);
  const [localToolsRevision, setLocalToolsRevision] = useState(0);

  const mode = useShared ? "client" : localReady.mode;
  const localProspectId = useShared
    ? null
    : (isExpedienteUuid(localClient?.prospectId)
      ? localClient.prospectId
      : isExpedienteUuid(localClient?.id)
        ? localClient.id
        : isExpedienteUuid(clientId)
          ? clientId
          : null);

  const localCollab = useExpedienteRealtime({
    prospectId: localProspectId,
    section: toolSection,
    wantEdit: !useShared && toolSection !== "detail",
    enabled: !useShared && isSupabaseConfigured() && !!localProspectId,
    toastOnToolUpdate: true,
    onToolChange: (payload) => {
      if (!payload?.tool || !clientId || !localProspectId) return;
      if (payload.localEcho) return;
      try {
        if (payload.data != null && typeof payload.data === "object") {
          runWithoutOutboundSync(() => {
            saveToolBucket(payload.tool, mode, payload.data, clientId);
          });
        } else {
          sharingApi.getTool(localProspectId, payload.tool).then((data) => {
            runWithoutOutboundSync(() => {
              saveToolBucket(payload.tool, mode, data || {}, clientId);
            });
            setLocalToolsRevision((n) => n + 1);
          }).catch(() => {});
          return;
        }
        setLocalToolsRevision((n) => n + 1);
      } catch {
        /* ignore */
      }
    },
  });

  const ready = useShared ? sharedSession.ready : localReady.ready;
  const sectionLocked = useShared ? sharedSession.sectionLocked : localCollab.sectionLocked;
  const lockedBy = useShared ? sharedSession.lockedBy : localCollab.lockedBy;
  const peers = useShared ? sharedSession.peers : localCollab.peers;
  const hasOthers = useShared ? sharedSession.hasOthers : localCollab.hasOthers;
  const toolsRevision = useShared
    ? sharedSession.toolsRevision
    : localToolsRevision;
  const collab = useShared ? sharedSession.collab : localCollab;
  const readOnly = useShared ? sharedSession.readOnly : false;
  const backHref = resolveToolBackHref(clientId, useShared ? sharedSession.backHref : undefined);

  const getBucket = useCallback((tool) => (
    useShared ? sharedSession.getToolData(tool) : getToolBucket(tool, mode, clientId)
  ), [useShared, sharedSession.getToolData, getToolBucket, mode, clientId, toolsRevision]);

  const saveBucket = useCallback(async (tool, data) => {
    const pid = useShared ? shared?.prospectId : localProspectId;
    if (pid) markLocalToolSave(pid, tool);
    if (useShared) {
      await sharedSession.saveTool(tool, data);
      return;
    }
    void collab?.unlockField?.();
    saveToolBucket(tool, mode, data, clientId);
  }, [useShared, sharedSession.saveTool, saveToolBucket, mode, clientId, shared?.prospectId, localProspectId, collab]);

  const getProspectClient = useCallback(() => (
    useShared ? sharedSession.prospect : (clientId ? getClient(clientId) : undefined)
  ), [useShared, sharedSession.prospect, clientId, getClient]);

  const syncProspectFields = useCallback(async (fields) => {
    if (!fields) return;
    if (useShared) {
      if (!sharedSession.canEdit) return;
      await sharingApi.updateProspect(shared.prospectId, {
        name1: fields.name1,
        name2: fields.name2,
        name: fields.name,
        country: fields.country,
        city: fields.city,
        occupation1: fields.occupation1,
        occupation2: fields.occupation2,
      });
      sharedSession.patchProspect?.(fields);
      return;
    }
    if (!clientId) return;
    const c = getClient(clientId);
    if (!c) return;
    saveClient(ensureProspectIdentity({ ...c, ...fields }));
  }, [useShared, sharedSession.canEdit, sharedSession.patchProspect, shared?.prospectId, clientId, getClient, saveClient]);

  return useMemo(() => ({
    ready,
    mode,
    readOnly,
    backHref,
    getBucket,
    saveBucket,
    getProspectClient,
    syncProspectFields,
    isShared: useShared,
    isFileMode: useShared || !!clientId,
    prospectId: useShared ? shared.prospectId : clientId,
    prospect: useShared ? sharedSession.prospect : localClient,
    peers,
    lockedBy,
    sectionLocked,
    hasOthers,
    toolsRevision,
    collab,
  }), [
    ready,
    mode,
    readOnly,
    backHref,
    getBucket,
    saveBucket,
    getProspectClient,
    syncProspectFields,
    useShared,
    clientId,
    shared?.prospectId,
    sharedSession.prospect,
    localClient,
    peers,
    lockedBy,
    sectionLocked,
    hasOthers,
    toolsRevision,
    collab,
  ]);
}
