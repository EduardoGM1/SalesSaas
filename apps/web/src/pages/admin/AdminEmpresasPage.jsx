import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { compressSupportScreenshot } from "@/lib/support-image.js";
import { toast } from "@/lib/toast";

async function adminJson(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/v1/admin/${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Error");
  return data.data ?? data;
}

export function AdminEmpresasPage() {
  const { t } = useI18n();
  const session = useOutletContext();
  const [reloadKey, setReloadKey] = useState(0);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [salaForm, setSalaForm] = useState({ empresa_id: "", nombre: "", gerente_id: "" });
  const [brandForm, setBrandForm] = useState({ id: "", tipo: "empresa", primary: "#1e5eff", accent: "#0f2044", logo_url: "" });
  const [membersSalaId, setMembersSalaId] = useState("");
  const [addMemberId, setAddMemberId] = useState("");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [logoPending, setLogoPending] = useState(false);

  const { loading, data: empresas, error: loadErr } = useAdminFetch(
    session?.isSuperAdmin ? "empresas" : "",
    `?_=${reloadKey}`,
  );
  const { data: salas } = useAdminFetch(session?.isSuperAdmin ? "salas" : "", `?_=${reloadKey}`);
  const { data: usersData } = useAdminFetch(session?.isSuperAdmin ? "users" : "", "");
  const users = useMemo(() => {
    if (Array.isArray(usersData)) return usersData;
    if (Array.isArray(usersData?.users)) return usersData.users;
    return [];
  }, [usersData]);

  const refresh = () => setReloadKey((k) => k + 1);
  const list = Array.isArray(empresas) ? empresas : [];
  const salasList = Array.isArray(salas) ? salas : [];

  const loadMembers = async (salaId) => {
    if (!salaId) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const rows = await adminJson(`salas/${salaId}/members`);
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (membersSalaId) loadMembers(membersSalaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersSalaId, reloadKey]);

  if (!session?.isSuperAdmin) {
    return <div className="admin-page admin-empty">{t("admin.empresas.forbidden")}</div>;
  }

  const createEmpresa = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await adminJson("empresas", { method: "POST", body: { nombre: empresaNombre } });
      setEmpresaNombre("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const createSala = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await adminJson("salas", { method: "POST", body: salaForm });
      setSalaForm({ empresa_id: "", nombre: "", gerente_id: "" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const saveBrand = async (e) => {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const path = brandForm.tipo === "sala" ? `salas/${brandForm.id}` : `empresas/${brandForm.id}`;
      await adminJson(path, {
        method: "PATCH",
        body: {
          logo_url: brandForm.logo_url || null,
          colores_marca: { primary: brandForm.primary, accent: brandForm.accent },
        },
      });
      refresh();
      toast.success(t("common.save"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file || !brandForm.id) return;
    setLogoPending(true);
    setError("");
    try {
      const compressed = await compressSupportScreenshot(file);
      const updated = await adminJson("branding/logo", {
        method: "POST",
        body: {
          tipo: brandForm.tipo,
          id: brandForm.id,
          data_url: compressed.dataUrl,
        },
      });
      if (updated?.logo_url) {
        setBrandForm((s) => ({ ...s, logo_url: updated.logo_url }));
      }
      refresh();
      toast.success(t("admin.empresas.logoUpload"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setLogoPending(false);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!membersSalaId || !addMemberId) return;
    setPending(true);
    setError("");
    try {
      await adminJson(`salas/${membersSalaId}/members`, {
        method: "POST",
        body: { usuario_id: addMemberId, rol_en_workspace: "vendedor" },
      });
      setAddMemberId("");
      await loadMembers(membersSalaId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const makeGerente = async (usuarioId) => {
    if (!membersSalaId) return;
    setPending(true);
    setError("");
    try {
      await adminJson(`salas/${membersSalaId}/gerente`, {
        method: "POST",
        body: { usuario_id: usuarioId },
      });
      await loadMembers(membersSalaId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  const removeMember = async (usuarioId) => {
    if (!membersSalaId) return;
    setPending(true);
    setError("");
    try {
      await adminJson(`salas/${membersSalaId}/members/${usuarioId}`, { method: "DELETE" });
      await loadMembers(membersSalaId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.empresas.error"));
    } finally {
      setPending(false);
    }
  };

  if (loading) return <div className="admin-page">{t("admin.loading.empresas")}</div>;
  if (loadErr) return <div className="admin-page admin-empty">{loadErr}</div>;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1 className="admin-h1">{t("admin.empresas.title")}</h1>
        <p className="admin-sub">{t("admin.empresas.sub")}</p>
      </div>
      {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="client-table-card" style={{ marginBottom: 20 }}>
        <h2 className="section-label">{t("admin.empresas.createEmpresa")}</h2>
        <form onSubmit={createEmpresa} style={{ display: "flex", gap: 8, padding: 16 }}>
          <input
            className="admin-role-select"
            style={{ flex: 1 }}
            value={empresaNombre}
            onChange={(e) => setEmpresaNombre(e.target.value)}
            placeholder={t("admin.empresas.namePlaceholder")}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t("common.save")}</button>
        </form>
        <table className="client-table admin-users-table">
          <thead>
            <tr>
              <th>{t("admin.empresas.col.name")}</th>
              <th>{t("admin.empresas.col.plan")}</th>
              <th>{t("admin.empresas.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td className="admin-cell-name">{e.nombre}</td>
                <td className="admin-cell-muted">{e.plan_paquete || "—"}</td>
                <td>{e.estado}</td>
              </tr>
            ))}
            {!list.length && (
              <tr><td colSpan={3} className="admin-empty">{t("admin.empresas.empty")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="client-table-card" style={{ marginBottom: 20 }}>
        <h2 className="section-label">{t("admin.empresas.createSala")}</h2>
        <form onSubmit={createSala} style={{ display: "grid", gap: 8, padding: 16 }}>
          <select
            className="admin-role-select"
            value={salaForm.empresa_id}
            onChange={(e) => setSalaForm((s) => ({ ...s, empresa_id: e.target.value }))}
            required
          >
            <option value="">{t("admin.empresas.pickEmpresa")}</option>
            {list.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <input
            className="admin-role-select"
            value={salaForm.nombre}
            onChange={(e) => setSalaForm((s) => ({ ...s, nombre: e.target.value }))}
            placeholder={t("admin.empresas.salaName")}
            required
          />
          <select
            className="admin-role-select"
            value={salaForm.gerente_id}
            onChange={(e) => setSalaForm((s) => ({ ...s, gerente_id: e.target.value }))}
            required
          >
            <option value="">{t("admin.empresas.pickGerente")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t("common.save")}</button>
        </form>
        <table className="client-table admin-users-table">
          <thead>
            <tr>
              <th>{t("admin.empresas.col.sala")}</th>
              <th>{t("admin.empresas.col.empresa")}</th>
              <th>{t("admin.empresas.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {salasList.map((s) => (
              <tr key={s.id}>
                <td className="admin-cell-name">{s.nombre}</td>
                <td className="admin-cell-muted">{list.find((e) => e.id === s.empresa_id)?.nombre || s.empresa_id}</td>
                <td>{s.estado}</td>
              </tr>
            ))}
            {!salasList.length && (
              <tr><td colSpan={3} className="admin-empty">{t("admin.empresas.noSalas")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="client-table-card" style={{ marginBottom: 20 }}>
        <h2 className="section-label">{t("admin.empresas.membersTitle")}</h2>
        <div style={{ display: "grid", gap: 8, padding: 16 }}>
          <select
            className="admin-role-select"
            value={membersSalaId}
            onChange={(e) => setMembersSalaId(e.target.value)}
          >
            <option value="">{t("admin.empresas.pickSalaMembers")}</option>
            {salasList.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {membersSalaId && (
            <form onSubmit={addMember} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                className="admin-role-select"
                style={{ flex: 1 }}
                value={addMemberId}
                onChange={(e) => setAddMemberId(e.target.value)}
                required
              >
                <option value="">{t("admin.empresas.addMember")}</option>
                {users
                  .filter((u) => !members.some((m) => m.id === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                  ))}
              </select>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t("admin.empresas.addMember")}</button>
            </form>
          )}
        </div>
        {membersLoading ? (
          <p style={{ padding: 16 }}>{t("common.loading")}</p>
        ) : membersSalaId ? (
          <table className="client-table admin-users-table">
            <thead>
              <tr>
                <th>{t("team.col.name")}</th>
                <th>{t("team.col.email")}</th>
                <th>{t("team.col.role")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="admin-cell-name">{m.full_name || m.email || m.id}</td>
                  <td className="admin-cell-muted">{m.email || "—"}</td>
                  <td>{m.rol_en_workspace === "gerente" ? t("team.role.gerente") : t("team.role.vendedor")}</td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {m.rol_en_workspace !== "gerente" && (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => makeGerente(m.id)}>
                        {t("admin.empresas.makeGerente")}
                      </button>
                    )}
                    <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => removeMember(m.id)}>
                      {t("admin.empresas.removeMember")}
                    </button>
                  </td>
                </tr>
              ))}
              {!members.length && (
                <tr><td colSpan={4} className="admin-empty">{t("team.emptyMembers")}</td></tr>
              )}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="client-table-card">
        <h2 className="section-label">{t("admin.empresas.brandTitle")}</h2>
        <form onSubmit={saveBrand} style={{ display: "grid", gap: 8, padding: 16 }}>
          <select
            className="admin-role-select"
            value={brandForm.tipo}
            onChange={(e) => setBrandForm((s) => ({ ...s, tipo: e.target.value, id: "" }))}
          >
            <option value="empresa">{t("admin.empresas.brandEmpresa")}</option>
            <option value="sala">{t("admin.empresas.brandSala")}</option>
          </select>
          <select
            className="admin-role-select"
            value={brandForm.id}
            onChange={(e) => setBrandForm((s) => ({ ...s, id: e.target.value }))}
            required
          >
            <option value="">{t("admin.empresas.pickTarget")}</option>
            {(brandForm.tipo === "sala" ? salasList : list).map((x) => (
              <option key={x.id} value={x.id}>{x.nombre}</option>
            ))}
          </select>
          <label>
            {t("admin.empresas.primary")}
            <input type="color" value={brandForm.primary} onChange={(e) => setBrandForm((s) => ({ ...s, primary: e.target.value }))} />
          </label>
          <label>
            {t("admin.empresas.accent")}
            <input type="color" value={brandForm.accent} onChange={(e) => setBrandForm((s) => ({ ...s, accent: e.target.value }))} />
          </label>
          <input
            className="admin-role-select"
            value={brandForm.logo_url}
            onChange={(e) => setBrandForm((s) => ({ ...s, logo_url: e.target.value }))}
            placeholder={t("admin.empresas.logoUrl")}
          />
          <label className="btn btn-ghost btn-sm" style={{ width: "fit-content", cursor: "pointer" }}>
            {logoPending ? t("admin.empresas.logoUploading") : t("admin.empresas.logoUpload")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={logoPending || !brandForm.id}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadLogo(file);
              }}
            />
          </label>
          {brandForm.logo_url && (
            <img src={brandForm.logo_url} alt="" style={{ maxHeight: 48, width: "auto", objectFit: "contain" }} />
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t("common.save")}</button>
        </form>
      </div>
    </div>
  );
}
