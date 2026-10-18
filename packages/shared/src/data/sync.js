import { dbToRows, rowsToDb } from "./mappers.js";
import { SYNC_SELECT } from "./sync-columns.js";

const TEAM_TABLES = new Set([
  "prospects",
  "sales",
  "activities",
  "tool_calculations",
  "calendar_entries",
]);

/** Tablas grandes: pull por páginas para no saturar móvil/sala con muchos registros. */
const PAGED_TABLES = new Set([
  "prospects",
  "sales",
  "calendar_entries",
  "activities",
  "tool_calculations",
]);
const PULL_PAGE_SIZE = 200;
const DELETE_CHUNK = 100;

async function pullTable(sb, table, userId, workspaceId, teamScope) {
  const useTeam = teamScope && TEAM_TABLES.has(table) && workspaceId;
  if (!PAGED_TABLES.has(table)) {
    let q = sb.from(table).select(SYNC_SELECT[table]);
    if (!useTeam) q = q.eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) throw new Error(`pull ${table}: ${error.message}`);
    return data ?? [];
  }

  const all = [];
  let from = 0;
  for (;;) {
    let q = sb
      .from(table)
      .select(SYNC_SELECT[table])
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (!useTeam) q = q.eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) throw new Error(`pull ${table}: ${error.message}`);
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PULL_PAGE_SIZE) break;
    from += PULL_PAGE_SIZE;
  }
  return all;
}

async function pullAll(sb, userId, workspaceId = null, { teamScope = false } = {}) {
  const tables = [
    "prospects",
    "sales",
    "calendar_entries",
    "goals",
    "activities",
    "tool_calculations",
  ];
  const results = await Promise.all(
    tables.map((t) => pullTable(sb, t, userId, workspaceId, teamScope)),
  );
  const rows = {
    prospects: results[0],
    sales: results[1],
    calendar_entries: results[2],
    goals: results[3],
    activities: results[4],
    tool_calculations: results[5],
  };
  return rowsToDb(rows);
}


const LOOKUP_CHUNK = 100;
/** Tope de reintentos fila a fila por tabla y petición; el resto queda `no_intentado`. */
const ROW_FALLBACK_LIMIT = 200;
const TOMBSTONE_RE = /prospect_tombstone/i;
const WORKFLOW_IMMUTABLE_RE = /historial del workflow es inmutable/i;

/** Permiso que exige REST para crear cada entidad; PUT /sync no puede dar más acceso. */
const SYNC_INSERT_PERMISSIONS = {
  prospects: "expedientes:crear",
  sales: "ventas:registrar",
  calendar_entries: "expedientes:editar",
  activities: "expedientes:editar",
};

/**
 * Clave natural de una fila nueva (además de prospect_code en prospects, único por usuario).
 * Los clientes desplegados regeneran los ids no-UUID en cada envío (normalizeIds), así que
 * un reintento tras una respuesta perdida llega con otro id; `created_at` viene del `ts`
 * local y es estable entre reintentos. goals y tool_calculations ya tienen clave única en BD.
 */
const NATURAL_KEYS = {
  prospects: ["created_at", "name"],
  sales: ["created_at", "sale_date", "prospect_id"],
  calendar_entries: ["created_at", "entry_date", "type"],
  activities: ["created_at", "type", "prospect_id"],
};

function newReport() {
  return { inserted: {}, updated: {}, deduped: {}, skipped: {}, rejected: [] };
}

function bump(map, key, n = 1) {
  map[key] = (map[key] || 0) + n;
}

function skip(report, reason, table) {
  report.skipped[reason] ||= {};
  bump(report.skipped[reason], table);
}

function reject(report, table, id, code) {
  report.rejected.push({ table, id: id ?? null, code });
}

function errorCode(error, mode) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  if (TOMBSTONE_RE.test(msg)) return "tombstone";
  if (WORKFLOW_IMMUTABLE_RE.test(msg)) return "borrado_bloqueado";
  if (code === "23503" || /foreign key/i.test(msg)) return "fk";
  if (code === "23505" || /duplicate key/i.test(msg)) return "duplicado";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
    if (mode === "insert") return /USING/.test(msg) ? "conflicto_oculto" : "rls_insert";
    return "rls_update";
  }
  return "otro";
}

function isToolPermissionError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return code === "42501"
    || /row-level security|permission denied|no tienes permiso/i.test(msg);
}

function uniqIds(ids) {
  return [...new Set((ids || []).filter((id) => typeof id === "string" && id.length > 0))];
}

function tsKey(v) {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? String(t) : null;
}

function naturalKey(table, row) {
  const cols = NATURAL_KEYS[table];
  const created = cols ? tsKey(row.created_at) : null;
  if (!created) return null;
  return [created, ...cols.slice(1).map((c) => String(row[c] ?? ""))].join("|");
}

async function selectIn(sb, table, cols, column, values, scope = (q) => q) {
  const list = [...new Set(values.filter((v) => v != null && v !== ""))];
  const out = [];
  for (let i = 0; i < list.length; i += LOOKUP_CHUNK) {
    const { data, error } = await scope(sb.from(table).select(cols).in(column, list.slice(i, i + LOOKUP_CHUNK)));
    if (error) throw new Error(`lookup ${table}: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Filas propias ya subidas con otro id (reintento de un cliente viejo). */
async function naturalMatcher(sb, table, rows, userId) {
  const own = (q) => q.eq("user_id", userId);
  const byCode = new Map();
  const byKey = new Map();
  if (table === "prospects") {
    const found = await selectIn(sb, table, "id,user_id,workspace_id,prospect_code", "prospect_code", rows.map((r) => r.prospect_code), own);
    for (const r of found) byCode.set(r.prospect_code, r);
  }
  const cols = NATURAL_KEYS[table];
  if (cols) {
    const found = await selectIn(
      sb,
      table,
      ["id", "user_id", "workspace_id", ...cols, ...(table === "prospects" ? ["prospect_code"] : [])].join(","),
      "created_at",
      rows.map((r) => r.created_at),
      own,
    );
    for (const r of found) {
      const k = naturalKey(table, r);
      if (k) byKey.set(k, r);
    }
  }
  return (row) => (row.prospect_code && byCode.get(row.prospect_code)) || byKey.get(naturalKey(table, row)) || null;
}

/**
 * Clasifica las filas del blob por su dueño REAL en BD, no por el user_id del blob
 * (dbToRows lo estampa con el de la sesión): propias → update, nuevas → insert,
 * ajenas → se omiten en cualquier alcance (editar filas de equipo es cosa de REST).
 */
async function classify(sb, table, rows, ctx, report) {
  const { userId, workspaceId, canInsert } = ctx;
  const updates = new Map();
  const inserts = [];
  /** id del blob → id en BD, o el estado por el que no se escribe. */
  const resolved = new Map();
  if (!rows.length) return { updates: [], inserts, resolved };

  const existing = new Map(
    (await selectIn(sb, table, "id,user_id,workspace_id", "id", rows.map((r) => r.id))).map((r) => [r.id, r]),
  );
  const fresh = [];
  for (const row of rows) {
    const ex = existing.get(row.id);
    if (!ex) {
      fresh.push(row);
    } else if (ex.user_id !== userId) {
      skip(report, "ajeno", table);
      resolved.set(row.id, { state: "ajeno" });
    } else if (ex.workspace_id !== workspaceId) {
      reject(report, table, row.id, "otro_workspace");
      resolved.set(row.id, { state: "rechazado" });
    } else {
      updates.set(row.id, row);
      resolved.set(row.id, { state: "ok", id: row.id });
    }
  }

  if (fresh.length) {
    const match = await naturalMatcher(sb, table, fresh, userId);
    const seen = new Map();
    for (const row of fresh) {
      const hit = match(row);
      if (hit) {
        if (hit.workspace_id !== workspaceId) {
          reject(report, table, row.id, "otro_workspace");
          resolved.set(row.id, { state: "rechazado" });
          continue;
        }
        bump(report.deduped, table);
        updates.set(hit.id, { ...row, id: hit.id, ...(hit.prospect_code ? { prospect_code: hit.prospect_code } : {}) });
        resolved.set(row.id, { state: "ok", id: hit.id });
        continue;
      }
      const key = (table === "prospects" && row.prospect_code) || naturalKey(table, row);
      if (key && seen.has(key)) {
        bump(report.deduped, table);
        resolved.set(row.id, { state: "ok", id: seen.get(key) });
        continue;
      }
      if (!canInsert(table)) {
        reject(report, table, row.id, "sin_permiso");
        resolved.set(row.id, { state: "rechazado" });
        continue;
      }
      if (key) seen.set(key, row.id);
      inserts.push(row);
      resolved.set(row.id, { state: "ok", id: row.id });
    }
  }
  return { updates: [...updates.values()], inserts, resolved };
}

function rowFallbackBudget(report, table) {
  let left = ROW_FALLBACK_LIMIT;
  return (id) => {
    if (left > 0) {
      left -= 1;
      return true;
    }
    reject(report, table, id, "no_intentado");
    return false;
  };
}

/**
 * Escribe propias e insertadas aislando fallos: si el lote falla, fila a fila.
 * Las propias que el lote no pudo escribir van por UPDATE (solo políticas de UPDATE),
 * porque un upsert evalúa también el WITH CHECK de INSERT sobre la fila propuesta.
 * @returns {Set<string>} ids escritos
 */
async function writeRows(sb, table, { updates, inserts }, report, ctx) {
  const written = new Set();
  const budget = rowFallbackBudget(report, table);

  if (inserts.length) {
    const { error } = await sb.from(table).upsert(inserts);
    if (!error) {
      for (const r of inserts) written.add(r.id);
      bump(report.inserted, table, inserts.length);
    } else {
      for (const row of inserts) {
        if (!budget(row.id)) continue;
        const { error: one } = await sb.from(table).upsert(row);
        if (one) {
          reject(report, table, row.id, errorCode(one, "insert"));
        } else {
          written.add(row.id);
          bump(report.inserted, table);
        }
      }
    }
  }

  if (updates.length) {
    let bulkOk = false;
    if (ctx.canInsert(table)) {
      const { error } = await sb.from(table).upsert(updates);
      bulkOk = !error;
    }
    if (bulkOk) {
      for (const r of updates) written.add(r.id);
      bump(report.updated, table, updates.length);
    } else {
      for (const row of updates) {
        if (!budget(row.id)) continue;
        const { id, user_id: _u, workspace_id: _w, ...patch } = row;
        const { data, error } = await sb.from(table).update(patch).eq("id", id).select("id");
        if (error) {
          reject(report, table, id, errorCode(error, "update"));
        } else if (!data?.length) {
          // 0 filas = el USING de UPDATE la oculta (sin expedientes:editar); REST daría 403.
          skip(report, "sin_permiso_editar", table);
        } else {
          written.add(id);
          bump(report.updated, table);
        }
      }
    }
  }
  return written;
}

/** Remapea ids del blob a los de BD y descarta hijos cuyo padre no se escribió. */
function linkChildren(rows, table, report, links) {
  const out = [];
  for (const row of rows) {
    const next = { ...row };
    let blocked = null;
    for (const [col, map] of links) {
      if (!next[col]) continue;
      const st = map.get(next[col]);
      if (!st) continue;
      if (st.state === "ok") next[col] = st.id;
      else if (col === "prospect_id") blocked = st.state;
      else next[col] = null;
    }
    if (blocked === "ajeno" || blocked === "tombstone") skip(report, `padre_${blocked}`, table);
    else if (blocked) reject(report, table, row.id ?? null, "padre_rechazado");
    else out.push(next);
  }
  return out;
}

async function loadTombstones(sb, userId, prospects) {
  const ids = uniqIds(prospects.map((p) => p.id));
  const codes = [...new Set(prospects.map((p) => p.prospect_code).filter((c) => typeof c === "string" && c))];
  const blockedIds = new Set();
  const blockedCodes = new Set();
  if (ids.length) {
    const { data, error } = await sb.from("prospects_deleted").select("prospect_id").in("prospect_id", ids);
    if (error) throw new Error(`tombstones: ${error.message}`);
    for (const row of data ?? []) blockedIds.add(row.prospect_id);
  }
  if (codes.length && userId) {
    const { data, error } = await sb
      .from("prospects_deleted")
      .select("prospect_code")
      .eq("user_id", userId)
      .in("prospect_code", codes);
    if (error) throw new Error(`tombstones: ${error.message}`);
    for (const row of data ?? []) {
      if (row.prospect_code) blockedCodes.add(row.prospect_code);
    }
  }
  return { blockedIds, blockedCodes };
}

async function upsertKeyed(sb, table, rows, onConflict, keyOf, report, { permissionIsSkip = false } = {}) {
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows, { onConflict });
  if (!error) {
    bump(report.updated, table, rows.length);
    return;
  }
  const budget = rowFallbackBudget(report, table);
  for (const row of rows) {
    if (!budget(keyOf(row))) continue;
    const { error: one } = await sb.from(table).upsert(row, { onConflict });
    if (!one) bump(report.updated, table);
    else if (permissionIsSkip && isToolPermissionError(one)) skip(report, "sin_permiso", table);
    else reject(report, table, keyOf(row), errorCode(one, "insert"));
  }
}

async function deleteByIds(sb, table, userId, ids, workspaceId, report) {
  const list = uniqIds(ids);
  const scoped = (q) => q.eq("user_id", userId).eq("workspace_id", workspaceId);
  for (let i = 0; i < list.length; i += DELETE_CHUNK) {
    const chunk = list.slice(i, i + DELETE_CHUNK);
    const { error } = await scoped(sb.from(table).delete()).in("id", chunk);
    if (!error) continue;
    for (const id of chunk) {
      const { error: one } = await scoped(sb.from(table).delete()).eq("id", id);
      if (one) reject(report, table, id, errorCode(one, "delete"));
    }
  }
}

async function deleteToolCalculationsExplicit(sb, userId, keys, workspaceId, report) {
  const list = (keys || []).filter((k) => k && typeof k.tool === "string");
  if (!list.length) return;
  const { data: existing, error: fetchErr } = await sb
    .from("tool_calculations")
    .select("id, prospect_id, tool")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId);
  if (fetchErr) throw new Error(`fetch tool_calculations: ${fetchErr.message}`);
  const want = new Set(list.map((r) => `${r.prospect_id ?? "null"}:${r.tool}`));
  const toDelete = (existing ?? [])
    .filter((r) => want.has(`${r.prospect_id ?? "null"}:${r.tool}`))
    .map((r) => r.id)
    .filter(Boolean);
  for (const id of toDelete) {
    const { error } = await sb.from("tool_calculations").delete().eq("id", id);
    if (error) reject(report, "tool_calculations", id, errorCode(error, "delete"));
  }
}

/**
 * Aplica solo borrados explícitos del snapshot (pendingDeletes).
 * Nunca borra filas remotas solo porque falten en el blob local.
 */
async function applyExplicitDeletes(sb, db, userId, workspaceId, report) {
  const pd = db?.pendingDeletes && typeof db.pendingDeletes === "object"
    ? db.pendingDeletes
    : {};
  await deleteToolCalculationsExplicit(sb, userId, pd.tool_calculations, workspaceId, report);
  await deleteByIds(sb, "calendar_entries", userId, pd.calendar_entries, workspaceId, report);
  await deleteByIds(sb, "activities", userId, pd.activities, workspaceId, report);
  await deleteByIds(sb, "sales", userId, pd.sales, workspaceId, report);
  await deleteByIds(sb, "prospects", userId, pd.prospects, workspaceId, report);
}

function goalKey(row) {
  return `${row.year}-${String(Number(row.month) + 1).padStart(2, "0")}`;
}

function toolKey(row) {
  return `${row.prospect_id ?? "libre"}:${row.tool}`;
}

/**
 * Reconcilia el blob del cliente con la BD dentro del workspace de la sesión.
 * Nunca lanza por una fila: devuelve el informe con insertadas, actualizadas,
 * omitidas y rechazadas (con motivo). Solo lanza ante fallos de infraestructura.
 *
 * @param {(table: string) => boolean} [opts.canInsert] permiso de alta por tabla (como REST)
 */
async function reconcile(sb, db, userId, workspaceId = null, { canInsert = () => true } = {}) {
  const report = newReport();
  const rows = dbToRows(db, userId);

  if (!workspaceId) {
    for (const [table, list] of Object.entries(rows)) {
      for (const row of list) reject(report, table, row.id ?? null, "sin_workspace");
    }
    return report;
  }
  for (const list of Object.values(rows)) {
    for (const row of list) {
      row.user_id = userId;
      row.workspace_id = workspaceId;
    }
  }
  const ctx = { userId, workspaceId, canInsert };

  const tombstones = await loadTombstones(sb, userId, rows.prospects);
  const tombstoned = [];
  const prospects = rows.prospects.filter((r) => {
    if (!isTombstoned(r, tombstones)) return true;
    skip(report, "tombstone", "prospects");
    tombstoned.push(r.id);
    return false;
  });
  const pc = await classify(sb, "prospects", prospects, ctx, report);
  const pWritten = await writeRows(sb, "prospects", pc, report, ctx);
  const prospectState = markWritten(pc.resolved, pWritten);
  for (const id of tombstoned) prospectState.set(id, { state: "tombstone" });

  const sales = linkChildren(rows.sales, "sales", report, [["prospect_id", prospectState]]);
  const sc = await classify(sb, "sales", sales, ctx, report);
  const saleState = markWritten(sc.resolved, await writeRows(sb, "sales", sc, report, ctx));

  const childLinks = [["prospect_id", prospectState], ["sale_id", saleState]];
  for (const table of ["calendar_entries", "activities"]) {
    const linked = linkChildren(rows[table], table, report, childLinks);
    const c = await classify(sb, table, linked, ctx, report);
    await writeRows(sb, table, c, report, ctx);
  }

  await upsertKeyed(sb, "goals", rows.goals, "user_id,year,month", goalKey, report);

  const tools = linkChildren(
    rows.tool_calculations.filter((r) => r.data && typeof r.data === "object" && Object.keys(r.data).length > 0),
    "tool_calculations",
    report,
    [["prospect_id", prospectState]],
  );
  await upsertKeyed(sb, "tool_calculations", tools, "user_id,prospect_id,tool", toolKey, report, { permissionIsSkip: true });

  // Borrados solo si el cliente los marcó explícitamente (cola pendingDeletes).
  await applyExplicitDeletes(sb, db, userId, workspaceId, report);
  return report;
}

/** Un id rechazado al escribir deja de contar como padre válido para sus hijos. */
function markWritten(resolved, written) {
  const out = new Map();
  for (const [blobId, st] of resolved) {
    if (st.state === "ok" && !written.has(st.id)) out.set(blobId, { state: "rechazado" });
    else out.set(blobId, st);
  }
  return out;
}

function isTombstoned(row, tombstones) {
  return tombstones.blockedIds.has(row.id) || tombstones.blockedCodes.has(row.prospect_code);
}

/** Conteos agregados para el log (sin ids). */
function summarizeReport(report) {
  const rejected = {};
  const rejectedByTable = {};
  for (const r of report.rejected) {
    bump(rejected, r.code);
    bump(rejectedByTable, r.table);
  }
  return {
    inserted: report.inserted,
    updated: report.updated,
    deduped: report.deduped,
    skipped: report.skipped,
    rejected,
    rejected_by_table: rejectedByTable,
  };
}

export {
  SYNC_INSERT_PERMISSIONS,
  pullAll,
  reconcile,
  summarizeReport,
};
