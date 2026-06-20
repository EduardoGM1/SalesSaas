
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, CheckCheck, Send } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { PageBack } from "@/components/layout/page-back";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { messagesApi } from "@/lib/network-api.js";
import {
  ContactPresenceStatus,
  NetworkUserAvatar,
  networkDisplayName,
} from "@/components/network/network-user-avatar.jsx";
import { useI18n } from "@/hooks/use-i18n.js";
import { toast } from "@/lib/toast";
import { selectOnFocus } from "@/lib/focus-select.js";

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
      <span
        className="messages-read-status seen"
        title={formatTime(message.read_at, lang)}
      >
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
  const [params] = useSearchParams();
  const activePeerId = params.get("with");
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const threadRef = useRef(null);

  const loadConversations = async () => {
    const data = await messagesApi.conversations();
    setConversations(data);
  };

  const loadThread = async (peerId) => {
    if (!peerId) {
      setMessages([]);
      return;
    }
    const data = await messagesApi.thread(peerId);
    setMessages(data);
    await messagesApi.markRead(peerId).catch(() => {});
    loadConversations();
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    setLoading(true);
    loadConversations()
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!activePeerId || !isSupabaseConfigured()) return;
    loadThread(activePeerId).catch((err) => toast.error(err.message));
    const timer = window.setInterval(() => {
      loadThread(activePeerId).catch(() => {});
    }, 8000);
    return () => window.clearInterval(timer);
  }, [activePeerId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const activePeer = conversations.find((c) => c.peer?.id === activePeerId)?.peer
    ?? messages.find((m) => m.peer?.id === activePeerId)?.peer
    ?? (activePeerId ? { id: activePeerId } : null);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activePeerId || sending) return;
    setSending(true);
    try {
      await messagesApi.send(activePeerId, text);
      setDraft("");
      await loadThread(activePeerId);
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

  return (
    <>
      <Topbar title={t("messages.title")} subtitle={t("messages.subtitle")} />
      <div className="sales-page messages-page">
        <PageBack inline />
        <div className={`messages-layout${activePeerId ? " messages-layout--thread-open" : ""}`}>
          <aside className="messages-sidebar">
            <div className="messages-sidebar-head">{t("messages.conversations")}</div>
            {loading && <div className="dp-empty">{t("common.loading")}</div>}
            {!loading && conversations.length === 0 && (
              <div className="dp-empty">{t("messages.empty")}</div>
            )}
            <div className="messages-conv-list">
              {conversations.map((c) => {
                const id = c.peer?.id;
                if (!id) return null;
                const active = id === activePeerId;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`messages-conv-item${active ? " active" : ""}`}
                    onClick={() => navigate(`/messages?with=${id}`)}
                  >
                    <NetworkUserAvatar user={c.peer} showPresence />
                    <div className="messages-conv-body">
                      <div className="messages-conv-top">
                        <span className="messages-conv-name">{networkDisplayName(c.peer)}</span>
                        {c.unread_count > 0 && (
                          <span className="messages-unread-badge">{c.unread_count}</span>
                        )}
                      </div>
                      <div className="messages-conv-preview">{c.last_message?.body}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="messages-thread">
            {!activePeerId ? (
              <div className="messages-thread-empty">{t("messages.selectConversation")}</div>
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
                  {messages.map((m) => (
                    <div key={m.id} className={`messages-bubble${m.mine ? " mine" : ""}`}>
                      <div className="messages-bubble-text">{m.body}</div>
                      <div className="messages-bubble-meta">
                        <span className="messages-bubble-time">
                          {formatTime(m.created_at, lang)}
                        </span>
                        <MessageReadStatus message={m} lang={lang} t={t} />
                      </div>
                    </div>
                  ))}
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
