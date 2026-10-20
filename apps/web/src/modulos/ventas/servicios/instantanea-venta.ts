import { clientDisplayName } from "@/lib/clients";
import { ClientRecord, SaleRecord } from "@/lib/storage/types";

export function construirInstantaneaVenta(client: ClientRecord) {
  const clone = <T extends Record<string, string | number>>(obj?: T) =>
    obj && Object.keys(obj).length ? { ...obj } : undefined;

  return {
    prospectSummary: {
      name: client.name,
      name1: client.name1,
      name2: client.name2,
      occupation1: client.occupation1,
      occupation2: client.occupation2,
      city: client.city,
      country: client.country,
      phone: client.phone,
      email: client.email,
      contract: client.contract,
      tourDate: client.tourDate,
      processDate: client.processDate,
      note: client.note,
      prospectCode: client.prospectCode,
    },
    tools: {
      survey: clone(client.data?.survey),
      vacaciones: clone(client.data?.vacaciones),
      worksheet: clone(client.data?.worksheet),
    },
  };
}

export function conInstantaneaVenta(client: ClientRecord, sale: SaleRecord): SaleRecord {
  return { ...sale, snapshot: construirInstantaneaVenta(client), clientName: clientDisplayName(client) };
}

export {
  construirInstantaneaVenta as buildSaleSnapshot,
  conInstantaneaVenta as withSaleSnapshot,
};
