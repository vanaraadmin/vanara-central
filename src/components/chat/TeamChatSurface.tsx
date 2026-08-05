import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../AsyncState";
import { loadCurrentUser } from "../../services/auth.service";
import {
  createChatMessage,
  loadChatConversation,
  loadChatConversations,
  loadChatMessages,
  loadChatUsers,
  markChatConversationRead,
  openGroupChat,
  openPrivateChat,
} from "../../services/chat.service";
import vanaraLogo from "../../assets/img/logo.png";
import type { ChatConversation, ChatLanguage, ChatMessage, ChatUser } from "../../types/chat";
import "../../styles/ChatPage.css";

type TeamChatSurfaceMode = "route" | "overlay";

interface TeamChatSurfaceProps {
  activeConversationId?: string;
  mode?: TeamChatSurfaceMode;
  onActiveConversationChange?: (conversationId: string) => void;
}

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

function ConversationAvatar({
  label,
  photoUrl,
  variant = "user",
}: {
  label: string;
  photoUrl?: string | null;
  variant?: "group" | "user" | "vanara";
}) {
  return (
    <span className={`chat-avatar ${variant === "vanara" ? "chat-avatar--vanara" : variant === "group" ? "chat-avatar--group" : ""}`} aria-hidden="true">
      {variant === "vanara" ? <img src={vanaraLogo} alt="" /> : photoUrl ? <img src={photoUrl} alt="" /> : <span>{label}</span>}
    </span>
  );
}

function chatAvatarVariant(conversation: ChatConversation): "group" | "user" | "vanara" {
  if (conversation.isMainGroup) return "vanara";
  return conversation.kind === "GROUP" ? "group" : "user";
}

function ChatToolIcon({ type }: { type: "plus" | "camera" | "gallery" | "sticker" | "send" | "close" | "back" }) {
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
  const hasUnread = alertCount > 0;

  return (
    <button
      type="button"
      className={`chat-list-row ${active ? "is-active" : ""} ${hasUnread ? "has-unread" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <ConversationAvatar
        label={conversation.avatarLabel}
        photoUrl={conversation.avatarPhotoUrl}
        variant={chatAvatarVariant(conversation)}
      />
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

function NewChatPicker({
  users,
  isLoading,
  onOpenPrivate,
  onOpenGroup,
  onClose,
}: {
  users: ChatUser[];
  isLoading: boolean;
  onOpenPrivate: (userId: string) => void;
  onOpenGroup: (payload: { title: string; participantIds: string[] }) => void;
  onClose: () => void;
}) {
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((item) => item !== userId)
      : [...current, userId]);
  }

  const canCreateGroup = groupTitle.trim().length >= 2 && selectedUserIds.length >= 2;

  return (
    <div className="chat-picker" role="dialog" aria-modal="true" aria-label="New Chat">
      <div className="chat-picker__sheet">
        <header>
          <h2>New Chat</h2>
          <button type="button" className="chat-picker__close" onClick={onClose} aria-label="Close">
            <ChatToolIcon type="close" />
          </button>
        </header>
        <div className="chat-picker__list">
          {isLoading ? (
            <p>Loading team...</p>
          ) : users.length > 0 ? (
            <>
              <section className="chat-picker__section" aria-label="Private chat">
                <h3>Private</h3>
                {users.map((user) => (
                  <button key={user.id} type="button" onClick={() => onOpenPrivate(user.id)}>
                    <ConversationAvatar label={avatarLabel(user.displayName)} photoUrl={user.profilePhotoUrl} />
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>@{user.username}</small>
                    </span>
                  </button>
                ))}
              </section>

              <section className="chat-picker__section chat-picker__section--group" aria-label="Group chat">
                <h3>Group</h3>
                <label className="chat-picker__group-name">
                  <span>Group name</span>
                  <input
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={80}
                    placeholder="Chat Ristorante"
                  />
                </label>
                <div className="chat-picker__people">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={selectedUserIds.includes(user.id) ? "is-selected" : ""}
                      onClick={() => toggleUser(user.id)}
                      aria-pressed={selectedUserIds.includes(user.id)}
                    >
                      <ConversationAvatar label={avatarLabel(user.displayName)} photoUrl={user.profilePhotoUrl} />
                      <span>
                        <strong>{user.displayName}</strong>
                        <small>@{user.username}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="chat-picker__create-group"
                  disabled={!canCreateGroup}
                  onClick={() => onOpenGroup({ title: groupTitle.trim(), participantIds: selectedUserIds })}
                >
                  Create Group
                </button>
              </section>
            </>
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
      {!outgoing && <ConversationAvatar label={avatarLabel(message.author.displayName)} photoUrl={message.author.profilePhotoUrl} />}
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
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  function exitFocusMode() {
    inputRef.current?.blur();
    setIsFocused(false);
  }

  return (
    <form className={`chat-composer ${isFocused ? "is-focused" : ""}`} aria-label="Message composer" onSubmit={submit}>
      <div className="chat-composer__tools chat-composer__tools--left" aria-label="Message tools">
        <button type="button" aria-label="Attach file" disabled><ChatToolIcon type="plus" /></button>
        <button type="button" aria-label="Open camera" disabled><ChatToolIcon type="camera" /></button>
        <button type="button" aria-label="Choose image" disabled><ChatToolIcon type="gallery" /></button>
      </div>
      <label className="chat-composer__field">
        <span className="vc-sr-only">Message</span>
        <input
          ref={inputRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Aa"
          maxLength={2000}
        />
      </label>
      <div className="chat-composer__tools chat-composer__tools--right">
        {isFocused && (
          <button type="button" className="chat-composer__cancel-focus" onMouseDown={(event) => event.preventDefault()} onClick={exitFocusMode} aria-label="Exit writing mode">
            <ChatToolIcon type="close" />
          </button>
        )}
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
  onBack,
}: {
  conversation: ChatConversation;
  messages: ChatMessage[];
  currentUserId: string;
  onBack: () => void;
}) {
  return (
    <section className="chat-thread" aria-label={`${conversation.title} conversation`}>
      <header className="chat-thread__header">
        <button type="button" className="chat-thread__back" onClick={onBack} aria-label="Back to chat list">
          <ChatToolIcon type="back" />
        </button>
        <ConversationAvatar
          label={conversation.avatarLabel}
          photoUrl={conversation.avatarPhotoUrl}
          variant={chatAvatarVariant(conversation)}
        />
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

export default function TeamChatSurface({
  activeConversationId,
  mode = "route",
  onActiveConversationChange,
}: TeamChatSurfaceProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">(activeConversationId ? "thread" : "list");
  const [localActiveConversationId, setLocalActiveConversationId] = useState("");

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
  const fallbackConversationId = conversations[0]?.id ?? "";
  const selectedConversationId = activeConversationId ?? (localActiveConversationId || fallbackConversationId);
  const activeInList = conversations.some((conversation) => conversation.id === selectedConversationId);

  const conversationQuery = useQuery({
    queryKey: ["chat", "conversation", selectedConversationId],
    queryFn: ({ signal }) => loadChatConversation(selectedConversationId, signal),
    enabled: Boolean(selectedConversationId && activeInList),
  });
  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", selectedConversationId],
    queryFn: ({ signal }) => loadChatMessages(selectedConversationId, signal),
    enabled: Boolean(selectedConversationId && activeInList),
  });
  const openPrivateMutation = useMutation({
    mutationFn: (userId: string) => openPrivateChat({ userId }),
    onSuccess: async (conversation) => {
      setPickerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      selectConversation(conversation.id);
    },
  });
  const openGroupMutation = useMutation({
    mutationFn: (payload: { title: string; participantIds: string[] }) => openGroupChat(payload),
    onSuccess: async (conversation) => {
      setPickerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      selectConversation(conversation.id);
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

  function selectConversation(conversationId: string) {
    setMobileView("thread");
    if (onActiveConversationChange) {
      onActiveConversationChange(conversationId);
      return;
    }
    setLocalActiveConversationId(conversationId);
  }

  useEffect(() => {
    if (!selectedConversationId || !activeInList || markReadMutation.isPending) return;
    const active = conversations.find((conversation) => conversation.id === selectedConversationId);
    if (!active || active.unreadCount + active.mentionCount === 0) return;
    markReadMutation.mutate(selectedConversationId);
  }, [activeInList, conversations, markReadMutation, selectedConversationId]);

  const retry = () => {
    void conversationsQuery.refetch();
    void conversationQuery.refetch();
    void messagesQuery.refetch();
  };

  const isLoading = conversationsQuery.isLoading || currentUserQuery.isLoading;
  const isError = conversationsQuery.isError || currentUserQuery.isError || conversationQuery.isError || messagesQuery.isError;
  const conversation = conversationQuery.data;
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  if (isLoading) return <PageLoading />;
  if (isError) return <PageError onRetry={retry} />;

  return (
    <>
      <div className={`chat-app chat-app--${mode} chat-app--mobile-${mobileView}`} data-internal-chat="team">
        <aside className="chat-list" aria-label="Team conversations">
          <header className="chat-list__header">
            <div>
              <h1>Chat</h1>
            </div>
            <button type="button" className="chat-list__new-chat" onClick={() => setPickerOpen(true)} aria-label="New Chat">
              <ChatToolIcon type="plus" />
              <span>New Chat</span>
            </button>
          </header>

          <div className="chat-list__rows">
            {conversations.length > 0 ? (
              conversations.map((conversationItem) => (
                <ConversationRow
                  key={conversationItem.id}
                  conversation={conversationItem}
                  active={conversationItem.id === selectedConversationId}
                  onSelect={() => selectConversation(conversationItem.id)}
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
          <ChatThread
            conversation={conversation}
            messages={messages}
            currentUserId={currentUserQuery.data?.id ?? ""}
            onBack={() => setMobileView("list")}
          />
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
        <NewChatPicker
          users={usersQuery.data ?? []}
          isLoading={usersQuery.isLoading}
          onOpenPrivate={(userId) => openPrivateMutation.mutate(userId)}
          onOpenGroup={(payload) => openGroupMutation.mutate(payload)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
