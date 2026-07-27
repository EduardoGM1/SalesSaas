import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminFetch } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";

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
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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

  if (!session?.isSuperAdmin) {
    return <div className="admin-page admin-empty">{t("admin.empresas.forbidden")}</div>;
  }

  const refresh = () => setReloadKey((k) => k + 1);
  const list = Array.isArray(empresas) ? empresas : [];
  const salasList = Array.isArray(salas) ? salas : [];

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
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{t("common.save")}</button>
        </form>
      </div>
    </div>
  );
}
