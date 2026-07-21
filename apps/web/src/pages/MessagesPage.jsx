import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Check, CheckCheck, Send, Users } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { messagesApi } from "@/lib/network-api.js";
import { notifyUnreadMessagesChanged } from "@/lib/messages-unread.js";
import {
  ContactPresenceStatus,
  NetworkUserAvatar,
  networkDisplayName,
} from "@/components/network/network-user-avatar.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";
import {
  ProspectShareMessageCard,
  conversationPreview,
} from "@/components/messages/prospect-share-message-card.jsx";

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

function convKey(c) {
  if (c.kind === "group" || c.conversation_id) return `g:${c.conversation_id}`;
  return `d:${c.peer?.id}`;
}

export function MessagesPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const activePeerId = params.get("with");
  const activeConvId = params.get("c");
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);
  const threadReqIdRef = useRef(0);
  const activePeerIdRef = useRef(activePeerId);
  const activeConvIdRef = useRef(activeConvId);
  activePeerIdRef.current = activePeerId;
  activeConvIdRef.current = activeConvId;

  const threadOpen = Boolean(activePeerId || activeConvId);

  const loadConversations = async () => {
    const data = await messagesApi.conversations();
    setConversations(data);
  };

  const loadThread = async ({ silent = false } = {}) => {
    const peerId = activePeerIdRef.current;
    const convId = activeConvIdRef.current;
    if (!peerId && !convId) {
      setMessages([]);
      return;
    }
    const reqId = ++threadReqIdRef.current;
    const data = convId
      ? await messagesApi.groupThread(convId)
      : await messagesApi.thread(peerId);
    if (reqId !== threadReqIdRef.current) return;
    if (convId && activeConvIdRef.current !== convId) return;
    if (peerId && activePeerIdRef.current !== peerId) return;
    setMessages(data);
    if (convId) await messagesApi.markGroupRead(convId).catch(() => {});
    else await messagesApi.markRead(peerId).catch(() => {});
    if (reqId !== threadReqIdRef.current) return;
    notifyUnreadMessagesChanged();
    try {
      await loadConversations();
    } catch (err) {
      if (!silent) throw err;
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    loadConversations()
      .then(() => notifyUnreadMessagesChanged())
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!threadOpen || !isSupabaseConfigured()) return;
    loadThread().catch((err) => toast.error(err.message));
    const timer = window.setInterval(() => {
      loadThread({ silent: true }).catch(() => {});
    }, 8000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadThread({ silent: true }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      threadReqIdRef.current += 1;
    };
  }, [activePeerId, activeConvId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const activeGroup = conversations.find((c) => c.conversation_id === activeConvId);
  const activePeer = conversations.find((c) => c.peer?.id === activePeerId)?.peer
    ?? messages.find((m) => m.peer?.id === activePeerId)?.peer
    ?? (activePeerId ? { id: activePeerId } : null);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (!activePeerId && !activeConvId) return;
    setSending(true);
    try {
      const sent = activeConvId
        ? await messagesApi.sendGroup(activeConvId, text)
        : await messagesApi.send(activePeerId, text);
      setDraft("");
      if (sent?.id) {
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      await loadThread({ silent: true });
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
          <div className="page-toolbar"><PageBack inline /></div>
          <div className="ethic-box">{t("network.cloudRequired")}</div>
        </div>
      </>
    );
  }

  const handleBack = () => {
    if (threadOpen && window.matchMedia("(max-width: 900px)").matches) {
      navigate("/messages");
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  return (
    <>
      <Topbar title={t("messages.title")} subtitle={t("messages.subtitle")} />
      <div className="sales-page messages-page">
        <div className="messages-page-nav">
          <PageBack inline onClick={handleBack} />
        </div>
        <div className={`messages-layout${threadOpen ? " messages-layout--thread-open" : " messages-layout--list-only"}`}>
          <aside className="messages-sidebar">
            <div className="messages-sidebar-head">{t("messages.conversations")}</div>
            {loading && <div className="dp-empty">{t("common.loading")}</div>}
            {!loading && conversations.length === 0 && (
              <div className="dp-empty">{t("messages.empty")}</div>
            )}
            <div className="messages-conv-list">
              {conversations.map((c) => {
                const isGroup = c.kind === "group" || Boolean(c.conversation_id);
                const id = isGroup ? c.conversation_id : c.peer?.id;
                if (!id) return null;
                const active = isGroup ? id === activeConvId : id === activePeerId;
                return (
                  <button
                    key={convKey(c)}
                    type="button"
                    className={`messages-conv-item${active ? " active" : ""}`}
                    onClick={() => navigate(isGroup ? `/messages?c=${id}` : `/messages?with=${id}`)}
                  >
                    {isGroup ? (
                      <div className="network-avatar network-avatar-sm" aria-hidden>
                        <Users size={14} />
                      </div>
                    ) : (
                      <NetworkUserAvatar user={c.peer} showPresence />
                    )}
                    <div className="messages-conv-body">
                      <div className="messages-conv-top">
                        <span className="messages-conv-name">
                          {isGroup ? (c.name || t("messages.groupChat")) : networkDisplayName(c.peer)}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="messages-unread-badge">{c.unread_count}</span>
                        )}
                      </div>
                      <div className="messages-conv-preview">
                        {conversationPreview(c.last_message, t) || c.last_message?.body}
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
            ) : (
              <>
                <div className="messages-thread-head messages-thread-head--with-peer">
                  {activeConvId ? (
                    <div className="network-avatar" aria-hidden><Users size={18} /></div>
                  ) : (
                    <NetworkUserAvatar user={activePeer} showPresence />
                  )}
                  <div className="messages-thread-head-main">
                    <div className="messages-thread-title">
                      {activeConvId
                        ? (activeGroup?.name || t("messages.groupChat"))
                        : networkDisplayName(activePeer)}
                    </div>
                    {!activeConvId && (
                      <ContactPresenceStatus
                        userId={activePeerId}
                        className="messages-thread-presence"
                        showDot={false}
                      />
                    )}
                  </div>
                </div>
                <div className="messages-thread-body" ref={threadRef}>
                  {messages.map((m) => {
                    const structured = m.message_type && m.message_type !== "text";
                    return (
                      <div key={m.id} className={`messages-bubble${m.mine ? " mine" : ""}${structured ? " messages-bubble--card" : ""}`}>
                        {!m.mine && activeConvId && m.peer?.full_name ? (
                          <div className="messages-bubble-sender">{m.peer.full_name}</div>
                        ) : null}
                        {structured ? (
                          <ProspectShareMessageCard
                            message={m}
                            t={t}
                            onResolved={() => loadThread({ silent: true })}
                          />
                        ) : (
                          <div className="messages-bubble-text">{m.body}</div>
                        )}
                        <div className="messages-bubble-meta">
                          <span className="messages-bubble-time">{formatTime(m.created_at, lang)}</span>
                          {!activeConvId && <MessageReadStatus message={m} lang={lang} t={t} />}
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
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!draft.trim() || sending}
                    onClick={handleSend}
                  >
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
