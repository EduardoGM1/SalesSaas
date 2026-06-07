import { NextResponse } from "next/server";
import { getUsers } from "@/lib/admin/data";
import { parseUserAdminFilters } from "@/lib/admin/filters";
import { toCsv } from "@/lib/admin/csv";
import { requireAdminPermission } from "@/lib/admin/guard";

const ROLE_LABEL: Record<string, string> = {
  vendedor: "Vendedor",
  gerente: "Gerente",
  admin: "Admin",
};

export async function GET(request: Request) {
  await requireAdminPermission("users:export");
  const { searchParams } = new URL(request.url);
  const filters = parseUserAdminFilters(Object.fromEntries(searchParams.entries()));
  const users = await getUsers(filters);

  const csv = toCsv(
    ["Nombre", "Correo", "Rol", "Estado", "Expedientes", "Ventas", "Volumen", "Alta"],
    users.map((u) => [
      u.name,
      u.email,
      ROLE_LABEL[u.role] ?? u.role,
      u.is_active ? "Activa" : "Desactivada",
      u.prospects,
      u.sales,
      u.volume,
      u.created_at ? String(u.created_at).slice(0, 10) : "",
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
