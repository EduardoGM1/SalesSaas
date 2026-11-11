import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDbStore } from "@/stores/db-store";
import { shallow } from "zustand/shallow";
import { useWorkspace } from "@/hooks/use-workspace.js";
import {
  createProspectFromName,
  deleteClientWithConfirm,
  filterAndSortClients,
  saveClientEdit,
  scopeClientsForList,
} from "../servicios/acciones-expediente.js";

export function useClientActions() {
  const navigate = useNavigate();
  const clients = useDbStore((s) => s.db.clients, shallow);
  const { active } = useWorkspace();
  const isSala = active?.tipo === "sala_de_venta";
  const workspaceId = active?.id || null;

  const searchClients = useCallback((query) => {
    const scoped = scopeClientsForList(clients, { isSala, workspaceId });
    return filterAndSortClients(scoped, query);
  }, [clients, isSala, workspaceId]);

  const createProspect = useCallback(async (name, tipoTour, tourCuantificable) => {
    const result = await createProspectFromName(name, tipoTour, tourCuantificable);
    if (result.ok && result.client) navigate(`/clients/${result.client.id}`);
    return result;
  }, [navigate]);

  const updateClient = useCallback((client, form) => saveClientEdit(client, form), []);

  const removeClient = useCallback((clientId, displayName) => deleteClientWithConfirm(clientId, displayName), []);

  return { searchClients, createProspect, updateClient, removeClient };
}
