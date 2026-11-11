import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  createProspectFromName,
  deleteClientWithConfirm,
  filterAndSortClients,
  saveClientEdit,
} from "../servicios/acciones-expediente.js";
import { useVisibleClients } from "./use-visible-clients.js";

export function useClientActions() {
  const navigate = useNavigate();
  const clients = useVisibleClients();

  const searchClients = useCallback((query) => {
    return filterAndSortClients(clients, query);
  }, [clients]);

  const createProspect = useCallback(async (name, tipoTour, tourCuantificable) => {
    const result = await createProspectFromName(name, tipoTour, tourCuantificable);
    if (result.ok && result.client) navigate(`/clients/${result.client.id}`);
    return result;
  }, [navigate]);

  const updateClient = useCallback((client, form) => saveClientEdit(client, form), []);

  const removeClient = useCallback((clientId, displayName) => deleteClientWithConfirm(clientId, displayName), []);

  return { searchClients, createProspect, updateClient, removeClient };
}
