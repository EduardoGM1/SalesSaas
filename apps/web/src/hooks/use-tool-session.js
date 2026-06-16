import { useDbStore } from "@/stores/db-store";
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
  const getToolBucket = useDbStore((s) => s.getToolBucket);
  const saveToolBucket = useDbStore((s) => s.saveToolBucket);
  const getClient = useDbStore((s) => s.getClient);
  const saveClient = useDbStore((s) => s.saveClient);

  const ready = useShared ? sharedSession.ready : localReady.ready;
  const mode = useShared ? "client" : localReady.mode;
  const readOnly = useShared ? sharedSession.readOnly : false;
  const backHref = resolveToolBackHref(clientId, useShared ? sharedSession.backHref : undefined);

  const getBucket = (tool) => (
    useShared ? sharedSession.getToolData(tool) : getToolBucket(tool, mode, clientId)
  );

  const saveBucket = async (tool, data) => {
    if (useShared) {
      await sharedSession.saveTool(tool, data);
      return;
    }
    saveToolBucket(tool, mode, data, clientId);
  };

  const getProspectClient = () => (
    useShared ? sharedSession.prospect : (clientId ? getClient(clientId) : undefined)
  );

  const syncProspectFields = async (fields) => {
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
  };

  return {
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
  };
}
