import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { getAdminProfile } from "@/lib/admin/guard";
import { effectivePermissions, hasAnyAdminAccess } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getAdminProfile();
  if (!profile || !hasAnyAdminAccess(profile)) redirect("/");

  const permissions = effectivePermissions(profile);
  const pathname = (await headers()).get("x-pathname") ?? "/admin";

  return (
    <div className="admin-shell">
      <AdminTopbar
        permissions={permissions}
        isSuperAdmin={profile.is_super_admin}
        pathname={pathname}
      />
      <main className="admin-main">{children}</main>
    </div>
  );
}
