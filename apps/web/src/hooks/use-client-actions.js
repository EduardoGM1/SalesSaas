import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDbStore } from "@/stores/db-store";
import {
  createProspectFromName,
  deleteClientWithConfirm,
  filterAndSortClients,
  saveClientEdit,
} from "@/actions/clients.js";

export function useClientActions() {
  const navigate = useNavigate();
  const db = useDbStore((s) => s.db);

  const searchClients = useCallback((query) => filterAndSortClients(db.clients, query), [db.clients]);

  const createProspect = useCallback((name, tipoTour, tourCuantificable) => {
    const result = createProspectFromName(name, tipoTour, tourCuantificable);
    if (result.ok && result.client) navigate(`/clients/${result.client.id}`);
    return result;
  }, [navigate]);

  const updateClient = useCallback((client, form) => saveClientEdit(client, form), []);

  const removeClient = useCallback((clientId, displayName) => deleteClientWithConfirm(clientId, displayName), []);

  return { searchClients, createProspect, updateClient, removeClient };
}
