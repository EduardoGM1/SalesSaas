import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Check, CheckCheck, FolderOpen, Send } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { messagesApi, networkApi } from "@/lib/network-api.js";
import { chatApi } from "@/lib/chat-api.js";
import { notifyUnreadMessagesChanged } from "@/lib/messages-unread.js";
import {
  ContactPresenceStatus,
  NetworkUserAvatar,
  networkDisplayName,
} from "@/components/network/network-user-avatar.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { useAppNav } from "@/hooks/use-app-nav.js";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";
import {
  ProspectShareMessageCard,
  conversationPreview,
} from "@/components/messages/prospect-share-message-card.jsx";
import {
  startGroupChatRealtime,
  stopGroupChatRealtime,
} from "@/lib/group-chat-realtime.js";

function formatTime(iso, lang) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(lang === "en" ? "en-US" : "es-MX", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MessageReadStatus({ message, lang, t }) {
  if (!message.mine) return null;
  if (message.read_at) {
    return (
      <span className="messages-read-status seen" title={formatTime(message.read_at, lang)}>
        <CheckCheck size={13} aria-hidden="true" />
        {t("messages.seen")}
      </span>
    );
  }
  return (
    <span className="messages-read-status">
      <Check size={13} aria-hidden="true" />
      {t("messages.delivered")}
    </span>
  );
}

export function MessagesPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { workspaceTipo } = useAppNav();
  const { active } = useWorkspace();
  const activePeerId = params.get("with");
  const conversationId = params.get("conversation");
  const teamScope = params.get("scope") === "team";
  const [conversations, setConversations] = useState([]);
  const [teamPeers, setTeamPeers] = useState([]);
  const [expedienteChats, setExpedienteChats] = useState([]);
  const [groupMeta, setGroupMeta] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);
  const threadReqIdRef = useRef(0);
  const activePeerIdRef = useRef(activePeerId);
  const conversationIdRef = useRef(conversationId);
  activePeerIdRef.current = activePeerId;
  conversationIdRef.current = conversationId;

  const loadConversations = async () => {
    const data = await messagesApi.conversations();
    setConversations(data);
  };

  const loadTeamPeers = async () => {
    if (!teamScope) {
      setTeamPeers([]);
      return;
    }
    const rows = await networkApi.listWorkspacePeers();
    setTeamPeers(Array.isArray(rows) ? rows : []);
  };

  const loadExpedienteChats = async () => {
    if (!teamScope) {
      setExpedienteChats([]);
      return;
    }
    try {
      const rows = await chatApi.list();
      setExpedienteChats(Array.isArray(rows) ? rows : []);
    } catch {
      setExpedienteChats([]);
    }
  };

  const loadThread = async (peerId, { silent = false } = {}) => {
    if (!peerId) {
      setMessages([]);
      return;
    }
    const reqId = ++threadReqIdRef.current;
    const data = await messagesApi.thread(peerId);
    if (reqId !== threadReqIdRef.current || activePeerIdRef.current !== peerId) return;
    setMessages(data);
    await messagesApi.markRead(peerId).catch(() => {});
    if (reqId !== threadReqIdRef.current || activePeerIdRef.current !== peerId) return;
    notifyUnreadMessagesChanged();
    try {
      await loadConversations();
    } catch (err) {
      if (!silent) throw err;
    }
  };

  const loadGroupThread = async (convId, { silent = false } = {}) => {
    if (!convId) {
      setMessages([]);
      setGroupMeta(null);
      return;
    }
    const reqId = ++threadReqIdRef.current;
    try {
      const [meta, payload] = await Promise.all([
        chatApi.get(convId),
        chatApi.messages(convId),
      ]);
      if (reqId !== threadReqIdRef.current || conversationIdRef.current !== convId) return;
      setGroupMeta(meta);
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      await loadExpedienteChats().catch(() => {});
    } catch (err) {
      if (!silent) throw err;
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    Promise.all([loadConversations(), loadTeamPeers(), loadExpedienteChats()])
      .then(() => notifyUnreadMessagesChanged())
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [teamScope]);

  // Al cambiar de workspace, limpiar estado local del chat (evita hilos de otra sala).
  useEffect(() => {
    const onWorkspaceChanged = () => {
      setConversations([]);
      setTeamPeers([]);
      setExpedienteChats([]);
      setMessages([]);
      setGroupMeta(null);
      setDraft("");
      if (activePeerId || conversationId || teamScope) {
        navigate("/messages", { replace: true });
      }
      setLoading(true);
      Promise.all([loadConversations(), loadTeamPeers(), loadExpedienteChats()])
        .then(() => notifyUnreadMessagesChanged())
        .catch((err) => toast.error(err.message))
        .finally(() => setLoading(false));
    };
    window.addEventListener("workspace:changed", onWorkspaceChanged);
    return () => window.removeEventListener("workspace:changed", onWorkspaceChanged);
  }, [activePeerId, conversationId, teamScope, navigate]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    if (conversationId) {
      loadGroupThread(conversationId).catch((err) => toast.error(err.message));
      void startGroupChatRealtime(conversationId, () => {
        loadGroupThread(conversationId, { silent: true }).catch(() => {});
      });
      // Respaldo por si Realtime no está disponible en el entorno.
      const timer = window.setInterval(() => {
        loadGroupThread(conversationId, { silent: true }).catch(() => {});
      }, 30_000);
      return () => {
        window.clearInterval(timer);
        void stopGroupChatRealtime();
        threadReqIdRef.current += 1;
      };
    }
    void stopGroupChatRealtime();
    if (!activePeerId) {
      setMessages([]);
      setGroupMeta(null);
      return undefined;
    }
    loadThread(activePeerId).catch((err) => toast.error(err.message));
    const timer = window.setInterval(() => {
      loadThread(activePeerId, { silent: true }).catch(() => {});
    }, 8000);
    return () => {
      window.clearInterval(timer);
      threadReqIdRef.current += 1;
    };
  }, [activePeerId, conversationId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const peerById = useMemo(() => {
    const map = new Map();
    for (const p of teamPeers) map.set(p.id, p);
    for (const c of conversations) {
      if (c.peer?.id) map.set(c.peer.id, { ...map.get(c.peer.id), ...c.peer });
    }
    return map;
  }, [teamPeers, conversations]);

  const listItems = useMemo(() => {
    if (!teamScope) return conversations;
    const peerIds = new Set(teamPeers.map((p) => p.id));
    const fromConv = conversations.filter((c) => c.peer?.id && peerIds.has(c.peer.id));
    const seen = new Set(fromConv.map((c) => c.peer.id));
    const starters = teamPeers
      .filter((p) => !seen.has(p.id))
      .map((p) => ({
        peer: {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          avatar_url: p.avatar_url,
        },
        unread_count: 0,
        last_message: null,
        team_role: p.rol_en_workspace,
        starter: true,
      }));
    return [
      ...fromConv.map((c) => ({
        ...c,
        team_role: peerById.get(c.peer.id)?.rol_en_workspace,
      })),
      ...starters,
    ];
  }, [teamScope, conversations, teamPeers, peerById]);

  const activePeer = peerById.get(activePeerId)
    || conversations.find((c) => c.peer?.id === activePeerId)?.peer
    || messages.find((m) => m.peer?.id === activePeerId)?.peer
    || (activePeerId ? { id: activePeerId } : null);

  const threadHref = (peerId) => (
    teamScope
      ? `/messages?scope=team&with=${encodeURIComponent(peerId)}`
      : `/messages?with=${encodeURIComponent(peerId)}`
  );
  const groupHref = (id) => `/messages?scope=team&conversation=${encodeURIComponent(id)}`;

  if (workspaceTipo === "personal" && teamScope) {
    return <Navigate to="/messages" replace />;
  }
  if (workspaceTipo === "sala_de_venta" && !teamScope && !activePeerId && !conversationId) {
    return <Navigate to="/messages?scope=team" replace />;
  }

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (conversationId) {
      setSending(true);
      try {
        const sent = await chatApi.send(conversationId, { body: text, message_type: "text" });
        setDraft("");
        if (sent?.id && conversationIdRef.current === conversationId) {
          setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        }
        await loadGroupThread(conversationId, { silent: true });
      } catch (err) {
        toast.error(err.message);
      } finally {
        setSending(false);
      }
      return;
    }
    if (!activePeerId) return;
    setSending(true);
    try {
      const sent = await messagesApi.send(activePeerId, text);
      setDraft("");
      if (sent?.id && activePeerIdRef.current === activePeerId) {
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      await loadThread(activePeerId, { silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const shareExpedienteCard = async () => {
    if (!conversationId || !groupMeta?.prospect_id || sending) return;
    setSending(true);
    try {
      await chatApi.send(conversationId, {
        body: groupMeta.titulo || "Expediente",
        message_type: "prospect_card",
        metadata: {
          prospect_id: groupMeta.prospect_id,
          prospect_name: groupMeta.titulo,
        },
      });
      await loadGroupThread(conversationId, { silent: true });
      toast.success("Expediente compartido en el chat");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <>
        <Topbar title={t("messages.title")} subtitle={t("messages.subtitle")} />
        <div className="sales-page">
          <div className="page-toolbar">
            <PageBack inline />
          </div>
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  const handleBack = () => {
    if ((activePeerId || conversationId) && window.matchMedia("(max-width: 900px)").matches) {
      navigate(teamScope ? "/messages?scope=team" : "/messages");
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const pageTitle = teamScope ? t("messages.teamTitle") : t("messages.title");
  const pageSubtitle = teamScope
    ? (active?.nombre
      ? `${active.nombre} · Habla con tu equipo y en los chats de cada expediente.`
      : t("messages.teamSubtitle"))
    : t("messages.subtitle");
  const threadOpen = Boolean(activePeerId || conversationId);

  return (
    <>
      <Topbar title={pageTitle} subtitle={pageSubtitle} />
      <div className="sales-page messages-page">
        <div className="messages-page-nav">
          <PageBack inline onClick={handleBack} />
        </div>
        <div className={`messages-layout${threadOpen ? " messages-layout--thread-open" : " messages-layout--list-only"}`}>
          <aside className="messages-sidebar">
            {teamScope ? (
              <>
                <div className="messages-sidebar-head">
                  {active?.nombre ? `Expedientes · ${active.nombre}` : "Expedientes"}
                </div>
                {loading && <div className="dp-empty">{t("common.loading")}</div>}
                {!loading && !expedienteChats.length && (
                  <div className="dp-empty">Aún no hay chats de expediente en esta sala.</div>
                )}
                <div className="messages-conv-list">
                  {expedienteChats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`messages-conv-item${c.id === conversationId ? " active" : ""}`}
                      onClick={() => navigate(groupHref(c.id))}
                    >
                      <span className="messages-group-avatar" aria-hidden>
                        <FolderOpen size={16} />
                      </span>
                      <div className="messages-conv-body">
                        <div className="messages-conv-top">
                          <span className="messages-conv-name">{c.titulo}</span>
                        </div>
                        <div className="messages-conv-preview">
                          {c.last_message?.body || c.prospect_code || "Chat del expediente"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="messages-sidebar-head" style={{ marginTop: 12 }}>
                  {t("messages.teamMembers")}
                </div>
              </>
            ) : (
              <div className="messages-sidebar-head">{t("messages.conversations")}</div>
            )}
            {loading && !teamScope && <div className="dp-empty">{t("common.loading")}</div>}
            {!loading && listItems.length === 0 && (
              <div className="dp-empty">
                {teamScope ? t("messages.teamEmpty") : t("messages.empty")}
              </div>
            )}
            <div className="messages-conv-list">
              {listItems.map((c) => {
                const id = c.peer?.id;
                if (!id) return null;
                const activeItem = id === activePeerId && !conversationId;
                const roleKey = c.team_role === "gerente"
                  ? "messages.teamRole.gerente"
                  : c.team_role === "vendedor"
                    ? "messages.teamRole.vendedor"
                    : null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`messages-conv-item${activeItem ? " active" : ""}`}
                    onClick={() => navigate(threadHref(id))}
                  >
                    <NetworkUserAvatar user={c.peer} showPresence />
                    <div className="messages-conv-body">
                      <div className="messages-conv-top">
                        <span className="messages-conv-name">{networkDisplayName(c.peer)}</span>
                        {c.unread_count > 0 && (
                          <span className="messages-unread-badge">{c.unread_count}</span>
                        )}
                      </div>
                      <div className="messages-conv-preview">
                        {roleKey
                          ? t(roleKey)
                          : (conversationPreview(c.last_message, t) || c.last_message?.body || "—")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="messages-thread">
            {!threadOpen ? (
              <div className="messages-thread-empty">{t("messages.selectConversation")}</div>
            ) : conversationId ? (
              <>
                <div className="messages-thread-head messages-thread-head--with-peer">
                  <span className="messages-group-avatar" aria-hidden><FolderOpen size={18} /></span>
                  <div className="messages-thread-head-main">
                    <div className="messages-thread-title">{groupMeta?.titulo || "Expediente"}</div>
                    <div className="messages-thread-presence">
                      {(groupMeta?.members || []).map((m) => m.full_name || m.rol).filter(Boolean).join(" · ")
                        || "Chat grupal del expediente"}
                    </div>
                  </div>
                  {groupMeta?.prospect_id ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void shareExpedienteCard()}>
                      Compartir expediente
                    </button>
                  ) : null}
                </div>
                <div className="messages-thread-body" ref={threadRef}>
                  {messages.map((m) => {
                    const structured = m.message_type && m.message_type !== "text" && m.message_type !== "system";
                    return (
                      <div key={m.id} className={`messages-bubble${m.mine ? " mine" : ""}${structured ? " messages-bubble--card" : ""}`}>
                        {!m.mine && m.sender?.full_name ? (
                          <div className="messages-bubble-sender">{m.sender.full_name}</div>
                        ) : null}
                        {structured ? (
                          <ProspectShareMessageCard message={m} t={t} onResolved={() => loadGroupThread(conversationId)} />
                        ) : (
                          <div className="messages-bubble-text">{m.body}</div>
                        )}
                        <div className="messages-bubble-meta">
                          <span className="messages-bubble-time">{formatTime(m.created_at, lang)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="messages-compose">
                  <textarea
                    rows={2}
                    placeholder={t("messages.placeholder")}
                    value={draft}
                    onFocus={selectOnFocus}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-primary" disabled={!draft.trim() || sending} onClick={handleSend}>
                    <Send size={16} /> {t("messages.send")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="messages-thread-head messages-thread-head--with-peer">
                  <NetworkUserAvatar user={activePeer} showPresence />
                  <div className="messages-thread-head-main">
                    <div className="messages-thread-title">{networkDisplayName(activePeer)}</div>
                    <ContactPresenceStatus
                      userId={activePeerId}
                      className="messages-thread-presence"
                      showDot={false}
                    />
                  </div>
                </div>
                <div className="messages-thread-body" ref={threadRef}>
                  {messages.map((m) => {
                    const structured = m.message_type && m.message_type !== "text";
                    return (
                      <div key={m.id} className={`messages-bubble${m.mine ? " mine" : ""}${structured ? " messages-bubble--card" : ""}`}>
                        {structured ? (
                          <ProspectShareMessageCard
                            message={m}
                            t={t}
                            onResolved={() => loadThread(activePeerId)}
                          />
                        ) : (
                          <div className="messages-bubble-text">{m.body}</div>
                        )}
                        <div className="messages-bubble-meta">
                          <span className="messages-bubble-time">{formatTime(m.created_at, lang)}</span>
                          <MessageReadStatus message={m} lang={lang} t={t} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="messages-compose">
                  <textarea
                    rows={2}
                    placeholder={t("messages.placeholder")}
                    value={draft}
                    onFocus={selectOnFocus}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                  <button type="button" className="btn btn-primary" disabled={!draft.trim() || sending} onClick={handleSend}>
                    <Send size={16} /> {t("messages.send")}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
