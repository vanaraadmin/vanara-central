import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import {
  createChatMessage,
  loadChatConversation,
  loadChatConversations,
  loadChatMessages,
} from "../services/chat.service";
import type { ChatConversation, ChatLanguage, ChatMessage } from "../types/chat";
import "../styles/ChatPage.css";

const TEMPORARY_CURRENT_USER_ID = "local-reception";

function inferLanguage(value: string): ChatLanguage {
  return /[\u0E00-\u0E7F]/.test(value) ? "th" : "en";
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function contextIcon(type: ChatConversation["contextType"]): string {
  switch (type) {
    case "room":
      return "🏡";
    case "maintenance":
      return "🔧";
    case "housekeeping":
      return "🧹";
    case "movement":
      return "🛎";
    case "general":
      return "🌿";
  }
}

function ContextCard({ conversation }: { conversation: ChatConversation }) {
  const contextTarget = conversation.contextType === "room" && conversation.contextId
    ? `/rooms/${conversation.contextId}`
    : null;

  return (
    <section className="chat-context-card" aria-label="Operational context">
      <div className="chat-context-card__icon" aria-hidden="true">{contextIcon(conversation.contextType)}</div>
      <div className="chat-context-card__body">
        <div className="chat-context-card__eyebrow">Operational context</div>
        <h1>{conversation.title}</h1>
        <div className="chat-context-card__meta">
          <span>{conversation.status}</span>
          {conversation.priority && <span>Priority {conversation.priority}</span>}
          <span>{conversation.participantCount} participant{conversation.participantCount === 1 ? "" : "s"}</span>
        </div>
        {conversation.subtitle && <p>{conversation.subtitle}</p>}
      </div>
      {contextTarget ? (
        <Link className="chat-context-card__link" to={contextTarget}>Open context →</Link>
      ) : (
        <span className="chat-context-card__link is-passive">General memory</span>
      )}
    </section>
  );
}

function MessageBubble({ message, grouped }: { message: ChatMessage; grouped: boolean }) {
  const isCurrentUser = message.author.id === TEMPORARY_CURRENT_USER_ID;
  const tone = isCurrentUser ? "owner" : "staff";

  return (
    <article className={`chat-message chat-message--${tone} ${grouped ? "is-grouped" : ""}`}>
      {!grouped && (
        <div className="chat-message__avatar" aria-hidden="true">
          {message.author.displayName.slice(0, 1)}
        </div>
      )}
      <div className="chat-message__content">
        {!grouped && (
          <div className="chat-message__meta">
            <span>{message.author.displayName}</span>
            <small>{message.author.role} · {formatMessageTime(message.createdAt)}</small>
          </div>
        )}
        <div className="chat-bubble">
          <p lang={message.bodyLanguage}>{message.body}</p>
          {message.translatedBody && message.translatedLanguage && (
            <p className="chat-bubble__translation" lang={message.translatedLanguage}>{message.translatedBody}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function EmptyConversation() {
  return (
    <div className="chat-empty-state">
      <span aria-hidden="true">🌿</span>
      <h3>No messages yet</h3>
      <p>This context is ready. The first note will be saved to the resort operational memory.</p>
    </div>
  );
}

function Composer({ conversationId }: { conversationId: string }) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => createChatMessage(conversationId, {
      body,
      bodyLanguage: inferLanguage(body),
    }),
    onSuccess: async () => {
      setBody("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversationId] }),
        queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversationId] }),
      ]);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <form className="chat-composer" aria-label="Message composer" onSubmit={submit}>
      <div className="chat-composer__actions" aria-label="Future message tools">
        <button type="button" aria-label="Camera reserved for future" disabled>📷</button>
        <button type="button" aria-label="Gallery reserved for future" disabled>▧</button>
      </div>
      <label className="chat-composer__field">
        <span className="vc-sr-only">Message</span>
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write an operational note…"
          maxLength={2000}
        />
      </label>
      <button className="chat-composer__mic" type="button" aria-label="Voice message reserved for future" disabled>🎙</button>
      <button className="chat-composer__send" type="submit" disabled={!body.trim() || mutation.isPending}>
        {mutation.isPending ? "Sending" : "Send"}
      </button>
      {mutation.isError && <p className="chat-composer__error">Message was not saved. Please try again.</p>}
    </form>
  );
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: ({ signal }) => loadChatConversations(signal),
  });

  const activeConversationId = conversationId ?? conversationsQuery.data?.[0]?.id ?? "";

  const conversationQuery = useQuery({
    queryKey: ["chat", "conversation", activeConversationId],
    queryFn: ({ signal }) => loadChatConversation(activeConversationId, signal),
    enabled: Boolean(activeConversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeConversationId],
    queryFn: ({ signal }) => loadChatMessages(activeConversationId, signal),
    enabled: Boolean(activeConversationId),
  });

  const retry = () => {
    void conversationsQuery.refetch();
    void conversationQuery.refetch();
    void messagesQuery.refetch();
  };

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const conversation = conversationQuery.data;
  const isLoading = conversationsQuery.isLoading || conversationQuery.isLoading || messagesQuery.isLoading;
  const isError = conversationsQuery.isError || conversationQuery.isError || messagesQuery.isError;

  const groupedMessages = useMemo(() => messages.map((message, index) => ({
    message,
    grouped: index > 0 && messages[index - 1]?.author.id === message.author.id,
  })), [messages]);

  if (isLoading) return <PageLoading />;
  if (isError) return <PageError onRetry={retry} />;

  if (!conversation) {
    return (
      <main className="chat-page">
        <div className="chat-empty-state chat-empty-state--page">
          <span aria-hidden="true">🌿</span>
          <h2>No operational conversations</h2>
          <p>Run local migrations or create the first conversation through the backend.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-page">
      <div className="chat-page__header">
        <div>
          <p className="chat-page__eyebrow">Operational memory</p>
          <h2>Context Chat</h2>
        </div>
        <span>{conversation.messageCount} note{conversation.messageCount === 1 ? "" : "s"}</span>
      </div>

      <ContextCard conversation={conversation} />

      <section className="chat-timeline" aria-label="Conversation timeline">
        <div className="chat-day-marker">Resort time · Asia/Bangkok</div>
        {groupedMessages.length > 0 ? (
          groupedMessages.map(({ message, grouped }) => (
            <MessageBubble key={message.id} message={message} grouped={grouped} />
          ))
        ) : (
          <EmptyConversation />
        )}
      </section>

      <Composer conversationId={conversation.id} />
    </main>
  );
}
