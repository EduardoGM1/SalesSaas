import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPermission } from "@/lib/admin/guard";
import { setUserActive } from "../../actions";

export default async function ActivateUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("users:activate");
  const { id } = await params;
  const sp = await searchParams;
  const returnTo = typeof sp.returnTo === "string" && sp.returnTo.startsWith("/admin/users")
    ? sp.returnTo
    : "/admin/users";

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();
  const name = profile.full_name || profile.email || `Usuario ${id.slice(0, 8)}`;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <Link href={returnTo} className="admin-back-link">← Usuarios</Link>
        <h1 className="admin-h1">Activar cuenta</h1>
        <p className="admin-sub">{name}</p>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
          El usuario podrá volver a iniciar sesión con su correo y contraseña.
        </p>
        <form action={setUserActive}>
          <input type="hidden" name="userId" value={id} />
          <input type="hidden" name="is_active" value="true" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="btn-row">
            <Link href={returnTo} className="btn btn-ghost">Cancelar</Link>
            <button type="submit" className="btn btn-primary">Confirmar activación</button>
          </div>
        </form>
      </div>
    </div>
  );
}
