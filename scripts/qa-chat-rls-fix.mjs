#!/usr/bin/env node
/**
 * QA chat RLS fix — PostgREST + Realtime + aislamiento entre conversaciones.
 * Ejecutar en VPS con env de staging o prod (127.0.0.1:8000 / Kong interno).
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const __dir = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dir, process.env.QA_CHAT_RESULTS ?? ".qa-chat-rls-results.json");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_PUBLIC_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
const REALTIME_OPTS = { realtime: { transport: ws } };

const EMAIL_A = process.env.QA_CHAT_EMAIL_A ?? "qa-chat-rls-a@saletse-test.com";
const EMAIL_B = process.env.QA_CHAT_EMAIL_B ?? "qa-chat-rls-b@saletse-test.com";
const EMAIL_C = process.env.QA_CHAT_EMAIL_C ?? "qa-chat-rls-c@saletse-test.com";
const QA_EMAILS = [EMAIL_A, EMAIL_B, EMAIL_C];

if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error("Faltan SUPABASE_URL/PUBLIC_URL, ANON_KEY, SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false }, ...REALTIME_OPTS });
const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false }, ...REALTIME_OPTS });

const results = [];
function record(id, ok, obs) {
  results.push({ id, ok: ok ? "PASS" : "FAIL", obs });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}: ${obs}`);
}

async function ensureUser(email, fullName) {
  const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (le) throw le;
  const existing = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

async function accessToken(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const { data: s, error: ve } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (ve) throw ve;
  return s.session.access_token;
}

function clientAs(token) {
  const sb = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    ...REALTIME_OPTS,
  });
  sb.realtime.setAuth(token);
  return sb;
}

async function pickWorkspace() {
  const { data, error } = await admin.from("workspaces").select("id").eq("estado", "activo").limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("Sin workspace activo");
  return data.id;
}

async function seedConversation(workspaceId, memberIds) {
  const convId = crypto.randomUUID();
  const { error: ce } = await admin.from("chat_conversations").insert({
    id: convId,
    workspace_id: workspaceId,
    tipo: "expediente",
    titulo: `QA-RLS-${Date.now()}`,
  });
  if (ce) throw ce;
  const rows = memberIds.map((uid, i) => ({
    conversation_id: convId,
    usuario_id: uid,
    rol: i === 0 ? "vendedor" : "gerente",
    joined_at: new Date().toISOString(),
    left_at: null,
  }));
  const { error: me } = await admin.from("chat_members").insert(rows);
  if (me) throw me;
  return convId;
}

async function seedForeignConversation(workspaceId, foreignUserId) {
  const convId = crypto.randomUUID();
  await admin.from("chat_conversations").insert({
    id: convId,
    workspace_id: workspaceId,
    tipo: "expediente",
    titulo: `QA-RLS-FOREIGN-${Date.now()}`,
  });
  await admin.from("chat_members").insert({
    conversation_id: convId,
    usuario_id: foreignUserId,
    rol: "vendedor",
    joined_at: new Date().toISOString(),
    left_at: null,
  });
  await admin.from("chat_messages").insert({
    conversation_id: convId,
    sender_id: foreignUserId,
    body: "MENSAJE-SECRETO-NO-DEBE-FILTRAR",
    message_type: "text",
  });
  return convId;
}

async function setupRealtimeInsertListener(client, conversationId, expectedBody, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let subscribed = false;
    let insertResolve;
    const insertPromise = new Promise((res) => {
      insertResolve = res;
    });
    const timer = setTimeout(() => {
      client.removeChannel(ch);
      reject(new Error(`Realtime timeout (subscribed=${subscribed})`));
    }, timeoutMs);
    const ch = client
      .channel(`qa-chat-rls:${conversationId}:${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (expectedBody && payload.new?.body !== expectedBody) return;
          clearTimeout(timer);
          insertResolve(payload.new);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          resolve({ ch, insertPromise });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          client.removeChannel(ch);
          reject(new Error(`Realtime ${status}`));
        }
      });
  });
}

async function main() {
  const uidA = await ensureUser(EMAIL_A, "QA Chat A");
  const uidB = await ensureUser(EMAIL_B, "QA Chat B");
  const uidC = await ensureUser(EMAIL_C, "QA Chat C");

  const workspaceId = await pickWorkspace();
  const convId = await seedConversation(workspaceId, [uidA, uidB]);
  const foreignConvId = await seedForeignConversation(workspaceId, uidC);

  const tokenA = await accessToken(EMAIL_A);
  const tokenB = await accessToken(EMAIL_B);
  const tokenC = await accessToken(EMAIL_C);

  const sbA = clientAs(tokenA);
  const sbB = clientAs(tokenB);
  const sbC = clientAs(tokenC);

  // 1) Ya no hay 42P17 — SELECT chat_messages
  const { data: msgsProbe, error: probeErr } = await sbA.from("chat_messages").select("id").limit(1);
  record(
    "1 SELECT chat_messages sin 42P17",
    !probeErr && Array.isArray(msgsProbe),
    probeErr?.message ?? `rows=${msgsProbe?.length ?? 0}`,
  );

  // 2) Miembro ve conversación propia
  const { data: convOwn, error: convOwnErr } = await sbA
    .from("chat_conversations")
    .select("id")
    .eq("id", convId)
    .maybeSingle();
  record(
    "2 Miembro ve conversación propia",
    !convOwnErr && convOwn?.id === convId,
    convOwnErr?.message ?? `id=${convOwn?.id?.slice(0, 8) ?? "—"}`,
  );

  // 3) Miembro ve peers
  const { data: peers, error: peersErr } = await sbA
    .from("chat_members")
    .select("usuario_id")
    .eq("conversation_id", convId);
  const peerIds = (peers || []).map((p) => p.usuario_id).sort();
  record(
    "3 Miembro ve peers en chat_members",
    !peersErr && peerIds.includes(uidA) && peerIds.includes(uidB),
    peersErr?.message ?? `peers=${peerIds.length}`,
  );

  // 4) INSERT mensaje REST
  const bodyText = `QA-MSG-${Date.now()}`;
  const { data: inserted, error: insErr } = await sbA
    .from("chat_messages")
    .insert({ conversation_id: convId, sender_id: uidA, body: bodyText, message_type: "text" })
    .select("id, body")
    .single();
  record(
    "4 INSERT mensaje REST miembro",
    !insErr && inserted?.body === bodyText,
    insErr?.message ?? `body=${inserted?.body?.slice(0, 24)}`,
  );

  // 5) Peer lee mensaje REST
  const { data: readB, error: readErr } = await sbB
    .from("chat_messages")
    .select("id, body")
    .eq("conversation_id", convId)
    .eq("body", bodyText)
    .maybeSingle();
  record(
    "5 Peer lee mensaje REST",
    !readErr && readB?.body === bodyText,
    readErr?.message ?? `found=${!!readB}`,
  );

  // 6) Realtime B recibe INSERT de A
  let rtOk = false;
  let rtObs = "";
  try {
    const rtBody = `QA-RT-${Date.now()}`;
    const { ch, insertPromise } = await setupRealtimeInsertListener(sbB, convId, rtBody);
    const { error: rtInsErr } = await sbA.from("chat_messages").insert({
      conversation_id: convId,
      sender_id: uidA,
      body: rtBody,
      message_type: "text",
    });
    if (rtInsErr) throw rtInsErr;
    const row = await insertPromise;
    sbB.removeChannel(ch);
    rtOk = row?.body === rtBody;
    rtObs = rtOk ? `body=${rtBody}` : `got=${row?.body}`;
  } catch (e) {
    rtObs = e.message;
  }
  record("6 Realtime INSERT peer recibe", rtOk, rtObs);

  // 7) No-fuga: C no ve conversación A+B
  const { data: leakConv, error: leakConvErr } = await sbC
    .from("chat_conversations")
    .select("id")
    .eq("id", convId)
    .maybeSingle();
  record(
    "7 No-fuga conversación ajena",
    !leakConvErr && !leakConv,
    leakConvErr?.message ?? `visible=${!!leakConv}`,
  );

  // 8) No-fuga: C no ve mensajes A+B
  const { data: leakMsgs, error: leakMsgErr } = await sbC
    .from("chat_messages")
    .select("id, body")
    .eq("conversation_id", convId);
  record(
    "8 No-fuga mensajes ajenos",
    !leakMsgErr && (leakMsgs?.length ?? 0) === 0,
    leakMsgErr?.message ?? `count=${leakMsgs?.length ?? 0}`,
  );

  // 9) No-fuga: A no ve conversación solo de C
  const { data: leakForeign, error: leakForeignErr } = await sbA
    .from("chat_messages")
    .select("body")
    .eq("conversation_id", foreignConvId)
    .maybeSingle();
  record(
    "9 No-fuga mensaje conversación solo-C",
    !leakForeignErr && !leakForeign,
    leakForeignErr?.message ?? `body=${leakForeign?.body ?? "null"}`,
  );

  // Cleanup QA data (service_role)
  await admin.from("chat_messages").delete().eq("conversation_id", convId);
  await admin.from("chat_messages").delete().eq("conversation_id", foreignConvId);
  await admin.from("chat_members").delete().eq("conversation_id", convId);
  await admin.from("chat_members").delete().eq("conversation_id", foreignConvId);
  await admin.from("chat_conversations").delete().eq("id", convId);
  await admin.from("chat_conversations").delete().eq("id", foreignConvId);

  const summary = {
    target: process.env.QA_CHAT_TARGET ?? "unknown",
    emails: QA_EMAILS,
    conversation_id: convId,
    results,
    all_pass: results.every((r) => r.ok === "PASS"),
  };
  writeFileSync(RESULTS, JSON.stringify(summary, null, 2));
  console.log("\n=== RESUMEN ===");
  for (const r of results) console.log(`${r.ok}  ${r.id}`);
  if (!summary.all_pass) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
