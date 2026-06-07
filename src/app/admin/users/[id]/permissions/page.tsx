import { redirect } from "next/navigation";
import { parseUserAdminFilters, userAdminUrl } from "@/lib/admin/filters";

/** Redirige al modal en la lista de usuarios (compatibilidad con enlaces antiguos). */
export default async function UserPermissionsRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const filters = parseUserAdminFilters(sp);
  redirect(userAdminUrl(filters, { editPerms: id }));
}
