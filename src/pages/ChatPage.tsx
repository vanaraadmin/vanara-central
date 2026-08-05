import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import {
  createChatMessage,
  loadChatConversation,
  loadChatConversations,
  loadChatMessages,
  loadChatUsers,
  markChatConversationRead,
  openPrivateChat,
} from "../services/chat.service";
import { loadCurrentUser } from "../services/auth.service";
import type { ChatConversation, ChatLanguage, ChatMessage, ChatUser } from "../types/chat";
import "../styles/ChatPage.css";

function inferLanguage(value: string): ChatLanguage {
  return /[\u0E00-\u0E7F]/.test(value) ? "th" : "en";
}

function formatChatTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConversationTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", dateStyle: "short" }).format(date)
    === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", dateStyle: "short" }).format(now);
  if (sameDay) return formatChatTime(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function avatarLabel(value: string): string {
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function ConversationAvatar({ label, photoUrl }: { label: string; photoUrl?: string | null }) {
  return (
    <span className="chat-avatar" aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" /> : <span>{label}</span>}
    </span>
  );
}

function ChatToolIcon({ type }: { type: "plus" | "camera" | "gallery" | "sticker" | "send" | "close" }) {
  return <span className={`chat-tool-icon chat-tool-icon--${type}`} aria-hidden="true"><span /></span>;
}

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: ChatConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const alertCount = conversation.mentionCount || conversation.unreadCount;

  return (
    <button
      type="button"
      className={`chat-list-row ${active ? "is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <ConversationAvatar label={conversation.avatarLabel} />
      <span className="chat-list-row__main">
        <strong>{conversation.title}</strong>
        <span>{conversation.lastMessagePreview}</span>
      </span>
      <span className="chat-list-row__side">
        <time>{formatConversationTime(conversation.lastMessageAt ?? conversation.updatedAt)}</time>
        {alertCount > 0 && (
          <span className={`chat-list-row__badge ${conversation.mentionCount > 0 ? "is-mention" : ""}`}>
            {conversation.mentionCount > 0 ? `@${conversation.mentionCount}` : alertCount}
          </span>
        )}
      </span>
    </button>
  );
}

function PrivateChatPicker({
  users,
  isLoading,
  onOpen,
  onClose,
}: {
  users: ChatUser[];
  isLoading: boolean;
  onOpen: (userId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="chat-picker" role="dialog" aria-modal="true" aria-label="Start private chat">
      <div className="chat-picker__sheet">
        <header>
          <h2>New chat</h2>
          <button type="button" className="chat-picker__close" onClick={onClose} aria-label="Close">
            <ChatToolIcon type="close" />
          </button>
        </header>
        <div className="chat-picker__list">
          {isLoading ? (
            <p>Loading team...</p>
          ) : users.length > 0 ? (
            users.map((user) => (
              <button key={user.id} type="button" onClick={() => onOpen(user.id)}>
                <ConversationAvatar label={avatarLabel(user.displayName)} photoUrl={user.profilePhotoUrl} />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>@{user.username}</small>
                </span>
              </button>
            ))
          ) : (
            <p>No team members available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatMessageBubble({ message, currentUserId }: { message: ChatMessage; currentUserId: string }) {
  const outgoing = message.author.id === currentUserId;

  return (
    <article className={`chat-thread-message ${outgoing ? "is-outgoing" : "is-incoming"}`}>
      {!outgoing && <ConversationAvatar label={avatarLabel(message.author.displayName)} />}
      <div className="chat-thread-message__content">
        {!outgoing && <span className="chat-thread-message__author">{message.author.displayName}</span>}
        <div className="chat-thread-message__bubble">
          <p lang={message.bodyLanguage}>{message.body}</p>
          {message.translatedBody && message.translatedLanguage && (
            <p className="chat-thread-message__translation" lang={message.translatedLanguage}>{message.translatedBody}</p>
          )}
        </div>
        <time>{formatChatTime(message.createdAt)}</time>
      </div>
    </article>
  );
}

function ChatComposer({ conversationId }: { conversationId: string }) {
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
        queryClient.invalidateQueries({ queryKey: ["chat", "summary"] }),
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
      <div className="chat-composer__tools chat-composer__tools--left" aria-label="Message tools">
        <button type="button" aria-label="Attach file" disabled><ChatToolIcon type="plus" /></button>
        <button type="button" aria-label="Open camera" disabled><ChatToolIcon type="camera" /></button>
        <button type="button" aria-label="Choose image" disabled><ChatToolIcon type="gallery" /></button>
      </div>
      <label className="chat-composer__field">
        <span className="vc-sr-only">Message</span>
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Aa"
          maxLength={2000}
        />
      </label>
      <div className="chat-composer__tools chat-composer__tools--right">
        <button type="button" aria-label="Open stickers" disabled><ChatToolIcon type="sticker" /></button>
        {body.trim() && (
          <button className="chat-composer__send" type="submit" disabled={mutation.isPending} aria-label="Send message">
            <ChatToolIcon type="send" />
          </button>
        )}
      </div>
      {mutation.isError && <p className="chat-composer__error">Message was not saved. Please try again.</p>}
    </form>
  );
}

function ChatThread({
  conversation,
  messages,
  currentUserId,
}: {
  conversation: ChatConversation;
  messages: ChatMessage[];
  currentUserId: string;
}) {
  return (
    <section className="chat-thread" aria-label={`${conversation.title} conversation`}>
      <header className="chat-thread__header">
        <ConversationAvatar label={conversation.avatarLabel} />
        <div>
          <h2>{conversation.kind === "GROUP" ? "Vanara Group Chat" : conversation.title}</h2>
          <span>{conversation.participantCount} people</span>
        </div>
      </header>

      <div className="chat-thread__messages">
        {messages.length > 0 ? (
          messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} currentUserId={currentUserId} />
          ))
        ) : (
          <div className="chat-thread__empty">
            <h3>No messages yet</h3>
            <p>Start with a quick team note.</p>
          </div>
        )}
      </div>

      <ChatComposer conversationId={conversation.id} />
    </section>
  );
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: ({ signal }) => loadCurrentUser(signal),
  });
  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: ({ signal }) => loadChatConversations(signal),
  });
  const usersQuery = useQuery({
    queryKey: ["chat", "users"],
    queryFn: ({ signal }) => loadChatUsers(signal),
    enabled: pickerOpen,
  });

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const activeConversationId = conversationId ?? conversations[0]?.id ?? "";
  const activeInList = conversations.some((conversation) => conversation.id === activeConversationId);

  const conversationQuery = useQuery({
    queryKey: ["chat", "conversation", activeConversationId],
    queryFn: ({ signal }) => loadChatConversation(activeConversationId, signal),
    enabled: Boolean(activeConversationId && activeInList),
  });
  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeConversationId],
    queryFn: ({ signal }) => loadChatMessages(activeConversationId, signal),
    enabled: Boolean(activeConversationId && activeInList),
  });
  const openPrivateMutation = useMutation({
    mutationFn: (userId: string) => openPrivateChat({ userId }),
    onSuccess: async (conversation) => {
      setPickerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      navigate(`/chat/${conversation.id}`);
    },
  });
  const markReadMutation = useMutation({
    mutationFn: (id: string) => markChatConversationRead(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
        queryClient.invalidateQueries({ queryKey: ["chat", "summary"] }),
      ]);
    },
  });

  useEffect(() => {
    if (!activeConversationId || !activeInList || markReadMutation.isPending) return;
    const active = conversations.find((conversation) => conversation.id === activeConversationId);
    if (!active || active.unreadCount + active.mentionCount === 0) return;
    markReadMutation.mutate(activeConversationId);
  }, [activeConversationId, activeInList, conversations, markReadMutation]);

  const retry = () => {
    void conversationsQuery.refetch();
    void conversationQuery.refetch();
    void messagesQuery.refetch();
  };

  const isLoading = conversationsQuery.isLoading || currentUserQuery.isLoading;
  const isError = conversationsQuery.isError || currentUserQuery.isError || conversationQuery.isError || messagesQuery.isError;
  const conversation = conversationQuery.data;
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  if (isLoading) return <WorkspaceShell title="Chat" workspace="chat"><PageLoading /></WorkspaceShell>;
  if (isError) return <WorkspaceShell title="Chat" workspace="chat"><PageError onRetry={retry} /></WorkspaceShell>;

  return (
    <WorkspaceShell title="Chat" workspace="chat" bodyClassName="chat-page">
      <div className="chat-app" data-internal-chat="team">
        <aside className="chat-list" aria-label="Team conversations">
          <header className="chat-list__header">
            <div>
              <h1>Chat</h1>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} aria-label="Start private chat">
              <ChatToolIcon type="plus" />
            </button>
          </header>

          <div className="chat-list__rows">
            {conversations.length > 0 ? (
              conversations.map((conversationItem) => (
                <ConversationRow
                  key={conversationItem.id}
                  conversation={conversationItem}
                  active={conversationItem.id === activeConversationId}
                  onSelect={() => navigate(`/chat/${conversationItem.id}`)}
                />
              ))
            ) : (
              <div className="chat-list__empty">
                <h2>No conversations</h2>
                <p>No team chats yet.</p>
              </div>
            )}
          </div>
        </aside>

        {conversation && activeInList ? (
          <ChatThread conversation={conversation} messages={messages} currentUserId={currentUserQuery.data?.id ?? ""} />
        ) : (
          <section className="chat-thread chat-thread--empty" aria-label="No conversation selected">
            <div className="chat-thread__empty">
              <h2>Select a chat</h2>
              <p>Pick a team thread.</p>
            </div>
          </section>
        )}
      </div>

      {pickerOpen && (
        <PrivateChatPicker
          users={usersQuery.data ?? []}
          isLoading={usersQuery.isLoading}
          onOpen={(userId) => openPrivateMutation.mutate(userId)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </WorkspaceShell>
  );
}
