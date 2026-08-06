import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { useToolSession } from "@/hooks/use-tool-session.js";
import { fetchSession } from "@/lib/session-api.js";
import { royalHolidayApi } from "@/lib/royal-holiday-api.js";
import { toast } from "@/lib/toast";

const TABS = [
  { id: "venta", label: "Datos de Venta" },
  { id: "financiamiento", label: "Datos de Financiamiento" },
  { id: "resumen", label: "Resumen", placeholder: true },
  { id: "prevlo", label: "Pre VLO", placeholder: true },
  { id: "worksheet", label: "Worksheet" },
];

const POSICIONES = ["liner", "closer", "ftb"];

function ExtraRows({ label, rows, onChange, max, onAdd }) {
  return (
    <div className="rh-extra-block" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{label}</strong>
        <button type="button" className="btn btn-ghost" disabled={rows.length >= max} onClick={onAdd}>+</button>
      </div>
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="number"
            className="input"
            placeholder="%"
            value={row.porcentaje}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...next[idx], porcentaje: e.target.value };
              onChange(next);
            }}
          />
          <input
            type="date"
            className="input"
            value={row.fecha}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...next[idx], fecha: e.target.value };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onChange(rows.filter((_, i) => i !== idx))}
          >
            ×
          </button>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 12 }}>Máximo {max} (catálogo).</p>
    </div>
  );
}

export function WorksheetRoyalHolidayPage({ clientId, shared }) {
  const { t } = useI18n();
  const session = useToolSession({ clientId, shared, section: "worksheet" });
  const { ready, backHref, readOnly } = session;
  const [tab, setTab] = useState("venta");
  const [expanded, setExpanded] = useState(false);
  const [empresaId, setEmpresaId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    holiday_credits: "10000",
    valor: "",
    posicion: "ftb",
    monto_venta: "",
    enganche_pct: "15",
    nacionalidad: "mexicano",
    plazo_meses: "",
    costo_administrativo_usd: "",
    regalosElegidos: {},
    extrasDp: [],
    extrasCc: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await fetchSession();
      const ws = s?.workspace_activo || s?.profile?.workspace_activo;
      const eid = ws?.empresa_id;
      const wid = ws?.id || s?.workspace_activo_id || s?.profile?.workspace_activo_id;
      if (cancelled) return;
      setEmpresaId(eid || null);
      setWorkspaceId(wid || null);
      if (eid) {
        try {
          const cat = await royalHolidayApi.getCatalogo(eid);
          if (!cancelled) setCatalogo(cat);
        } catch (err) {
          toast.error(err.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    const tmr = setTimeout(async () => {
      try {
        const p = await royalHolidayApi.preview(empresaId, {
          holiday_credits: form.holiday_credits,
          monto_venta: form.monto_venta || form.valor,
          enganche_pct: form.enganche_pct,
          posicion: form.posicion,
          nacionalidad: form.nacionalidad,
          plazo_meses: form.plazo_meses || undefined,
          costo_administrativo_usd: form.costo_administrativo_usd || undefined,
        });
        setPreview(p);
        if (!form.costo_administrativo_usd && p.costo_administrativo_usd != null) {
          setForm((f) => ({ ...f, costo_administrativo_usd: String(p.costo_administrativo_usd) }));
        }
      } catch {
        setPreview(null);
      }
    }, 280);
    return () => clearTimeout(tmr);
  }, [
    empresaId,
    form.holiday_credits,
    form.monto_venta,
    form.valor,
    form.enganche_pct,
    form.posicion,
    form.nacionalidad,
    form.plazo_meses,
    form.costo_administrativo_usd,
  ]);

  const posicionesDisponibles = useMemo(() => {
    const fromCat = new Set((catalogo?.comisiones || []).map((c) => String(c.posicion).toLowerCase()));
    return POSICIONES.filter((p) => fromCat.has(p) || fromCat.size === 0);
  }, [catalogo]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!empresaId || !workspaceId || readOnly) return;
    setSaving(true);
    try {
      const regalos = Object.entries(form.regalosElegidos)
        .filter(([, carga]) => carga)
        .map(([id, carga]) => ({ id, carga }));
      const extras = [
        ...form.extrasDp.map((e) => ({ tipo: "extra_dp", porcentaje: e.porcentaje, fecha: e.fecha })),
        ...form.extrasCc.map((e) => ({ tipo: "extra_cc", porcentaje: e.porcentaje, fecha: e.fecha })),
      ];
      await royalHolidayApi.saveVenta(empresaId, {
        empresa_id: empresaId,
        workspace_id: workspaceId,
        prospect_id: clientId || null,
        holiday_credits: form.holiday_credits,
        monto_venta: form.monto_venta || form.valor,
        enganche_pct: form.enganche_pct,
        posicion: form.posicion,
        nacionalidad: form.nacionalidad,
        plazo_meses: form.plazo_meses || null,
        costo_administrativo_usd: form.costo_administrativo_usd,
        regalos,
        extras,
        allow_pending_commission: true,
      });
      toast.success("Venta Royal Holiday guardada");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="sales-page" style={{ padding: 24 }}>{t("common.loading") || "Cargando…"}</div>;
  }

  const boardOk = preview?.precio_ok;
  const maxDp = catalogo?.parametros?.max_extra_dp ?? 6;
  const maxCc = catalogo?.parametros?.max_extra_cc ?? 6;
  const adminOptions = (catalogo?.costo_administrativo || []).map((c) => c.monto_usd);

  return (
    <>
      <Topbar title="Worksheet · Royal Holiday" />
      <div className="sales-page tool-calc-page worksheet-rh">
      <div className="page-toolbar">
        <PageBack inline href={backHref} />
      </div>
      <nav className="admin-subnav" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={`btn ${tab === tb.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(tb.id)}
          >
            {tb.label}
          </button>
        ))}
      </nav>

      {(tab === "resumen" || tab === "prevlo") && (
        <div className="card" style={{ padding: 24 }}>
          <h3>{tab === "resumen" ? "Resumen" : "Pre VLO"}</h3>
          <p className="muted">Próxima iteración — pestaña placeholder sin funcionalidad aún.</p>
        </div>
      )}

      {(tab === "venta" || tab === "worksheet") && (
        <section className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Vista cliente</h3>
            <button type="button" className="btn btn-ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              {expanded ? "Ocultar detalle" : "Expandir (vendedor)"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <label>
              Créditos (HC)
              <input className="input" type="number" value={form.holiday_credits} disabled={readOnly}
                onChange={(e) => set("holiday_credits", e.target.value)} />
            </label>
            <label>
              Valor
              <input className="input" type="number" value={form.valor} disabled={readOnly}
                onChange={(e) => set("valor", e.target.value)} />
            </label>
          </div>
          {preview?.bottom_line && (
            <p style={{ marginTop: 8 }}>
              Cuota mantenimiento anual (M.Fee): <strong>{preview.bottom_line.cuota_anual_mfee}</strong> · Programa {preview.bottom_line.programa}
            </p>
          )}
          {expanded && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border, #ddd)" }}>
              <p>
                Board Online: <strong>{preview?.board_online ?? "—"}</strong>
                {boardOk === true && <CheckCircle2 size={16} style={{ color: "green", marginLeft: 8 }} />}
                {boardOk === false && <AlertTriangle size={16} style={{ color: "crimson", marginLeft: 8 }} />}
              </p>
              <label>
                Posición
                <select className="input" value={form.posicion} disabled={readOnly}
                  onChange={(e) => set("posicion", e.target.value)}>
                  {posicionesDisponibles.map((p) => (
                    <option key={p} value={p}>{p.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <p className="muted" style={{ fontSize: 12 }}>
                OPC / X: agregar filas en catálogo de comisiones cuando existan datos (sin inventar %).
              </p>
              <h4>Regalos disponibles</h4>
              {(preview?.regalos || []).map((g) => (
                <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span>{g.nombre} {g.costo != null ? `($${g.costo})` : ""}</span>
                  <select
                    className="input"
                    disabled={readOnly}
                    value={form.regalosElegidos[g.id] || ""}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      regalosElegidos: { ...f.regalosElegidos, [g.id]: e.target.value },
                    }))}
                  >
                    <option value="">No aplicar</option>
                    {(g.cargas_permitidas || []).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {(tab === "financiamiento" || tab === "worksheet") && (
        <section className="card" style={{ padding: 16, marginTop: 12 }}>
          <h3>Monto de venta</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label>
              Monto Venta
              <input className="input" type="number" value={form.monto_venta} disabled={readOnly}
                onChange={(e) => set("monto_venta", e.target.value)} />
            </label>
            <label>
              Enganche %
              <input className="input" type="number" value={form.enganche_pct} disabled={readOnly}
                onChange={(e) => set("enganche_pct", e.target.value)} />
            </label>
            <label>
              Costo administrativo
              <select className="input" value={form.costo_administrativo_usd} disabled={readOnly}
                onChange={(e) => set("costo_administrativo_usd", e.target.value)}>
                {adminOptions.map((m) => (
                  <option key={m} value={m}>{m} USD</option>
                ))}
              </select>
            </label>
          </div>
          {boardOk === false && (
            <p style={{ color: "crimson" }}>Monto bajo el Board Online ({preview?.board_online}).</p>
          )}
          {boardOk === true && (
            <p style={{ color: "green" }}>Monto cumple o supera Board Online.</p>
          )}
          <p className="muted" style={{ fontSize: 12 }}>
            Rango intermedio de costo admin (entre 15% y 27.5%) pendiente de definición del dueño de producto.
          </p>
          <ExtraRows
            label="Extra DP"
            rows={form.extrasDp}
            max={maxDp}
            onChange={(rows) => set("extrasDp", rows)}
            onAdd={() => set("extrasDp", [...form.extrasDp, { porcentaje: "10", fecha: new Date().toISOString().slice(0, 10) }])}
          />
          <ExtraRows
            label="Extra CC"
            rows={form.extrasCc}
            max={maxCc}
            onChange={(rows) => set("extrasCc", rows)}
            onAdd={() => set("extrasCc", [...form.extrasCc, { porcentaje: "10", fecha: new Date().toISOString().slice(0, 10) }])}
          />
          {preview?.totales && (
            <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              <div><dt>Enganche</dt><dd>{preview.totales.enganche?.toFixed?.(2) ?? preview.totales.enganche}</dd></div>
              <div><dt>Enganche + Admin</dt><dd>{preview.totales.engancheMasAdmin?.toFixed?.(2)}</dd></div>
              <div><dt>Balance a financiar</dt><dd>{preview.totales.balanceAFinanciar?.toFixed?.(2)}</dd></div>
            </dl>
          )}
          <h3 style={{ marginTop: 16 }}>Financiamiento (automático del catálogo)</h3>
          <label>
            Nacionalidad
            <select className="input" value={form.nacionalidad} disabled={readOnly}
              onChange={(e) => set("nacionalidad", e.target.value)}>
              <option value="mexicano">Mexicano</option>
              <option value="argentino">Argentino</option>
              <option value="resto">Resto del mundo</option>
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {(preview?.plazos || []).map((p) => (
              <label key={p.plazo_meses} className="admin-perm-item">
                <input
                  type="radio"
                  name="plazo"
                  disabled={readOnly}
                  checked={String(form.plazo_meses) === String(p.plazo_meses)}
                  onChange={() => set("plazo_meses", String(p.plazo_meses))}
                />
                {p.plazo_meses}m
              </label>
            ))}
            {!preview?.plazos?.length && <span className="muted">Sin plazos válidos para esta combinación.</span>}
          </div>
          {preview?.mensualidad != null && (
            <p>Mensualidad: <strong>{Number(preview.mensualidad).toFixed(2)}</strong></p>
          )}
          <h3>Comisión</h3>
          {preview?.comision?.pendiente ? (
            <p style={{ color: "crimson" }}>{preview.comision.mensaje}</p>
          ) : preview?.comision ? (
            <p>
              {preview.comision.porcentaje}% → {Number(preview.comision.monto).toFixed(2)} · pago {preview.comision.fecha_pago}
            </p>
          ) : null}
        </section>
      )}

      {!readOnly && tab !== "resumen" && tab !== "prevlo" && (
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={saving || !empresaId} onClick={save}>
            {saving ? "Guardando…" : "Guardar venta RH"}
          </button>
        </div>
      )}
      {!empresaId && (
        <p className="muted">Activa un workspace de sala Royal Holiday para cargar el catálogo.</p>
      )}
      </div>
    </>
  );
}
