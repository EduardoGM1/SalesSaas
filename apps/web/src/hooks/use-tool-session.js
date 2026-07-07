import { useCallback, useMemo } from "react";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { useToolBucketReady } from "@/hooks/use-tool-bucket-ready";
import { useSharedToolSession } from "@/hooks/use-shared-tool-session";
import { resolveToolBackHref } from "@/lib/calculator-nav.js";
import { ensureProspectIdentity } from "@/lib/clients";
import { sharingApi } from "@/lib/network-api.js";

/** Unifica carga/guardado local (store) y remoto (expediente compartido). */
export function useToolSession({ clientId, shared }) {
  const useShared = !!shared?.prospectId;
  const sharedSession = useSharedToolSession(shared?.prospectId, shared?.contactId);
  const localReady = useToolBucketReady(useShared ? undefined : clientId);
  const localClient = useDbStore((s) => (clientId ? s.db.clients[clientId] : undefined), shallow);
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const getClient = useDbStore((s) => s.getClient);
  const saveClient = useDbStore((s) => s.saveClient);

  const ready = useShared ? sharedSession.ready : localReady.ready;
  const mode = useShared ? "client" : localReady.mode;
  const readOnly = useShared ? sharedSession.readOnly : false;
  const backHref = resolveToolBackHref(clientId, useShared ? sharedSession.backHref : undefined);

  const getBucket = useCallback((tool) => (
    useShared ? sharedSession.getToolData(tool) : getToolBucket(tool, mode, clientId)
  ), [useShared, sharedSession.getToolData, getToolBucket, mode, clientId]);

  const saveBucket = useCallback(async (tool, data) => {
    if (useShared) {
      await sharedSession.saveTool(tool, data);
      return;
    }
    saveToolBucket(tool, mode, data, clientId);
  }, [useShared, sharedSession.saveTool, saveToolBucket, mode, clientId]);

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
      await sharedSession.reload();
      return;
    }
    if (!clientId) return;
    const c = getClient(clientId);
    if (!c) return;
    saveClient(ensureProspectIdentity({ ...c, ...fields }));
  }, [useShared, sharedSession.canEdit, sharedSession.reload, shared?.prospectId, clientId, getClient, saveClient]);

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
  ]);
}
