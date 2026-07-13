import { useCallback, useMemo, useRef } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useSharedToolSession } from "@/hooks/use-shared-tool-session";
import { useExpedienteCollab } from "@/hooks/use-expediente-collab.js";
import { resolveToolBackHref } from "@/lib/calculator-nav.js";
import { ensureProspectIdentity } from "@/lib/clients";
import { sharingApi } from "@/lib/network-api.js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isExpedienteUuid } from "@/lib/expediente-collab.js";
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n.js";

/** Unifica carga/guardado local (store) y remoto (expediente compartido). */
export function useToolSession({ clientId, shared, section }) {
  const { t } = useI18n();
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
  const onLocalDataChangeRef = useRef(null);

  onLocalDataChangeRef.current = async (payload) => {
    if (payload?.table !== "tool_calculations" || !payload.tool || !clientId || !localProspectId) return;
    try {
      const data = await sharingApi.getTool(localProspectId, payload.tool);
      saveToolBucket(payload.tool, mode, data || {}, clientId);
      if (payload.tool === toolSection) {
        toast.success(t("collab.remoteUpdated"));
      }
    } catch {
      /* ignore — sin shares / sin acceso */
    }
  };

  const localCollab = useExpedienteCollab({
    prospectId: localProspectId,
    section: toolSection,
    wantEdit: !useShared && toolSection !== "detail",
    enabled: !useShared && isSupabaseConfigured() && !!localProspectId,
    onDataChange: (payload) => onLocalDataChangeRef.current?.(payload),
  });

  const ready = useShared ? sharedSession.ready : localReady.ready;
  const sectionLocked = useShared ? sharedSession.sectionLocked : localCollab.sectionLocked;
  const lockedBy = useShared ? sharedSession.lockedBy : localCollab.lockedBy;
  const peers = useShared ? sharedSession.peers : localCollab.peers;
  const readOnly = useShared
    ? sharedSession.readOnly
    : sectionLocked;
  const backHref = resolveToolBackHref(clientId, useShared ? sharedSession.backHref : undefined);

  const getBucket = useCallback((tool) => (
    useShared ? sharedSession.getToolData(tool) : getToolBucket(tool, mode, clientId)
  ), [useShared, sharedSession.getToolData, getToolBucket, mode, clientId]);

  const saveBucket = useCallback(async (tool, data) => {
    if (sectionLocked) {
      throw new Error(t("collab.sectionLocked", { name: lockedBy?.name || t("collab.someone") }));
    }
    if (useShared) {
      await sharedSession.saveTool(tool, data);
      return;
    }
    saveToolBucket(tool, mode, data, clientId);
  }, [useShared, sharedSession.saveTool, saveToolBucket, mode, clientId, sectionLocked, lockedBy, t]);

  const getProspectClient = useCallback(() => (
    useShared ? sharedSession.prospect : (clientId ? getClient(clientId) : undefined)
  ), [useShared, sharedSession.prospect, clientId, getClient]);

  const syncProspectFields = useCallback(async (fields) => {
    if (!fields) return;
    if (useShared) {
      if (!sharedSession.canEdit || sectionLocked) return;
      await sharingApi.updateProspect(shared.prospectId, {
        name1: fields.name1,
        name2: fields.name2,
        name: fields.name,
        country: fields.country,
        city: fields.city,
        occupation1: fields.occupation1,
        occupation2: fields.occupation2,
      });
      await sharedSession.reload();
      return;
    }
    if (!clientId) return;
    const c = getClient(clientId);
    if (!c) return;
    saveClient(ensureProspectIdentity({ ...c, ...fields }));
  }, [useShared, sharedSession.canEdit, sharedSession.reload, shared?.prospectId, clientId, getClient, saveClient, sectionLocked]);

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
  ]);
}
