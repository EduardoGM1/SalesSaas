import { NextRequest, NextResponse } from "next/server";
import { getSales, prospectName } from "@/lib/admin/data";
import { parseAdminFilters } from "@/lib/admin/filters";
import { toCsv } from "@/lib/admin/csv";
import { requireAdminPermission } from "@/lib/admin/guard";
import { statusLabel } from "@/lib/format/status";

export async function GET(req: NextRequest) {
  await requireAdminPermission("sales:export");
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseAdminFilters(sp);
  const sales = await getSales(filters);

  const csv = toCsv(
    ["Fecha", "Vendedor", "Expediente", "Contrato", "Estado", "Tours", "Volumen"],
    sales.map((s) => [
      s.sale_date,
      s.seller,
      prospectName(s.prospect),
      s.contract,
      statusLabel(s.status ?? undefined),
      s.tours,
      s.vol,
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
