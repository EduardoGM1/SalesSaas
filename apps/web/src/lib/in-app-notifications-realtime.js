/**
 * Canal dual desktop: toasts in-app vía Supabase Realtime.
 * Arma data para `armarNotificacion` / `presentarNotificacion`.
 */
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, primeRealtimeAuth } from "@/lib/supabase/client";
import { fetchRealtimeSession } from "@/lib/presence-api.js";
import { ensureRealtimeReady, removeChannelSafe } from "@/lib/presence/realtime.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import { sharedProspectPath } from "@salesapp/shared/push/notification-targets.js";
import { presentarNotificacion } from "@/lib/in-app-notifications.js";
import { notifyUnreadMessagesChanged } from "@/lib/messages-unread.js";

let channel = null;
let activeUserId = null;
let starting = false;

/** @type {Map<string, { full_name?: string | null, avatar_url?: string | null }>} */
const profileCache = new Map();

async function ensureBrowserSession(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token && session?.user?.id) return session;
  try {
    const rt = await fetchRealtimeSession();
    const { error } = await supabase.auth.setSession({
      access_token: rt.access_token,
      refresh_token: rt.refresh_token,
    });
    if (error) return null;
    ({ data: { session } } = await supabase.auth.getSession());
    if (session?.access_token) primeRealtimeAuth(session.access_token);
    return session;
  } catch {
    return null;
  }
}

function resolveProfileName(data) {
  const fromColumn = String(data?.full_name ?? "").trim();
  if (fromColumn) return fromColumn;
  const fromSettings = String(data?.settings?.userName ?? "").trim();
  if (fromSettings && fromSettings.toLowerCase() !== "usuario") return fromSettings;
  const email = String(data?.email ?? "").trim();
  const fromEmail = email.includes("@") ? email.split("@")[0].trim() : "";
  return fromEmail || null;
}

async function loadProfile(supabase, userId) {
  if (!userId) return { full_name: null, avatar_url: null };
  if (profileCache.has(userId)) return profileCache.get(userId);
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, avatar_url, settings")
      .eq("id", userId)
      .maybeSingle();
    const profile = {
      full_name: resolveProfileName(data),
      avatar_url: data?.avatar_url || null,
    };
    profileCache.set(userId, profile);
    return profile;
  } catch {
    return { full_name: null, avatar_url: null };
  }
}

async function loadProspectLabel(supabase, prospectId) {
  if (!prospectId) return null;
  try {
    const { data } = await supabase
      .from("prospects")
      .select("name, name1, name2, prospect_code")
      .eq("id", prospectId)
      .maybeSingle();
    if (!data) return null;
    const composed = [data.name1, data.name2].filter(Boolean).join(" / ");
    return composed || data.name || data.prospect_code || null;
  } catch {
    return null;
  }
}

function permissionLabel(permission) {
  if (permission === "edit") return "edición";
  if (permission === "view") return "solo lectura";
  return "acceso";
}

export async function stopInAppNotificationsRealtime() {
  const sb = createClient();
  const ch = channel;
  channel = null;
  activeUserId = null;
  if (ch) await removeChannelSafe(sb, ch);
}

export async function startInAppNotificationsRealtime(userId) {
  if (getInstallPlatform() !== "desktop") return;
  if (!isSupabaseConfigured() || !userId || starting) return;
  if (channel && activeUserId === userId) return;

  starting = true;
  try {
    await stopInAppNotificationsRealtime();
    const supabase = createClient();
    const session = await ensureBrowserSession(supabase);
    if (!session?.access_token) return;

    await ensureRealtimeReady(supabase, session.access_token, 8_000);

    const ch = supabase
      .channel(`in-app-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const row = payload.new || {};
            const senderId = row.sender_id;
            const mensaje = String(row.body || "").trim();
            const profile = await loadProfile(supabase, senderId);
            presentarNotificacion("mensaje_nuevo", {
              nombreRemitente: profile.full_name || "Contacto",
              mensaje: mensaje || "Tienes un mensaje nuevo",
              avatarRemitente: profile.avatar_url || undefined,
              chatId: senderId,
            });
            notifyUnreadMessagesChanged();
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_connections",
          filter: `addressee_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const row = payload.new || {};
            if (row.status && row.status !== "pending") return;
            const profile = await loadProfile(supabase, row.requester_id);
            presentarNotificacion("solicitud_contacto", {
              nombreSolicitante: profile.full_name || "Alguien",
              avatarSolicitante: profile.avatar_url || undefined,
              solicitudId: row.id,
            });
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_connections",
          filter: `requester_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const row = payload.new || {};
            const prev = payload.old || {};
            if (row.status !== "accepted" || prev.status === "accepted") return;
            const peerId = row.addressee_id;
            const profile = await loadProfile(supabase, peerId);
            presentarNotificacion("solicitud_aceptada", {
              nombreContacto: profile.full_name || "Tu contacto",
              avatarContacto: profile.avatar_url || undefined,
              contactoId: peerId,
              chatId: peerId,
            });
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "prospect_shares",
          filter: `shared_with_id=eq.${userId}`,
        },
        (payload) => {
          void (async () => {
            const row = payload.new || {};
            const ownerId = row.owner_id;
            const prospectId = row.prospect_id;
            const [profile, prospectLabel] = await Promise.all([
              loadProfile(supabase, ownerId),
              loadProspectLabel(supabase, prospectId),
            ]);
            presentarNotificacion("expediente_compartido", {
              nombreQuienComparte: profile.full_name || "Un contacto",
              nombreCliente: prospectLabel || "un expediente",
              nivelAcceso: permissionLabel(row.permission),
              avatarQuienComparte: profile.avatar_url || undefined,
              expedienteId: prospectId,
              rutaDestino: ownerId && prospectId
                ? sharedProspectPath(ownerId, prospectId)
                : "/network",
            });
          })();
        },
      );

    await new Promise((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          resolve(status);
        }
      });
    });

    channel = ch;
    activeUserId = userId;
  } catch (err) {
    console.warn("[in-app-notifications] start failed:", err?.message || err);
  } finally {
    starting = false;
  }
}
