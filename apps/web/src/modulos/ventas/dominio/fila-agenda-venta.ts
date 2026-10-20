import { ClientRecord, SaleRecord } from "@/lib/storage/types";

function nombreCliente(client: ClientRecord): string {
  return client?.name1 || client?.name || "Prospecto";
}

function ventaProcesable(sale: Pick<SaleRecord, "status" | "processing">): boolean {
  if (String(sale?.status || "") === "cancelada") return false;
  return String(sale?.status || "venta") !== "pendiente"
    && String(sale?.processing || "venta") !== "pendiente";
}

/**
 * Forma de la fila de agenda que hoy escribe registerClientSale.
 * No sustituye a db-store: el store sigue siendo quien persiste.
 */
export function filaAgendaDeVenta(
  sale: SaleRecord & { addProcessingFollowup?: boolean },
  client: ClientRecord,
  ahora: number,
) {
  const status = sale.status || "venta";
  const pendiente = status === "pendiente";
  const normalizada = {
    ...sale,
    status,
    processing: pendiente ? "pendiente" : "venta",
    processDate: pendiente ? (sale.processDate || "") : "",
    addProcessingFollowup: pendiente && !!sale.addProcessingFollowup,
  };
  const clientId = client.id;
  const prospectId = client.prospectId || clientId;
  const clientName = nombreCliente(client);
  const conservar = ventaProcesable(normalizada) || status === "cancelada";
  if (conservar) {
    return {
      t: "venta" as const,
      saleId: normalizada.saleId,
      vol: normalizada.vol,
      tours: normalizada.tours,
      note: [clientName, normalizada.contract ? `Folio ${normalizada.contract}` : "", normalizada.note].filter(Boolean).join(" · "),
      contract: normalizada.contract,
      status: normalizada.status,
      processing: normalizada.processing,
      processDate: normalizada.processDate,
      clientId,
      prospectId,
      clientName,
      ts: normalizada.ts,
      source: "client" as const,
    };
  }
  if (normalizada.addProcessingFollowup && normalizada.processDate) {
    return {
      t: "follow" as const,
      saleId: normalizada.saleId,
      note: `Procesar venta pendiente - Cliente ${clientName}${normalizada.contract ? ` - Folio ${normalizada.contract}` : ""}`,
      status: normalizada.status,
      processing: "pendiente" as const,
      processDate: normalizada.processDate,
      clientId,
      prospectId,
      clientName,
      ts: ahora,
      source: "client-sale-processing" as const,
      kind: "procesamiento-venta" as const,
      completed: false,
    };
  }
  return null;
}
