import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../AsyncState";
import { loadCurrentUser } from "../../services/auth.service";
import {
  createChatMessage,
  clearChatAnnouncement,
  loadChatConversation,
  loadChatConversations,
  loadChatMessages,
  loadChatUsers,
  markChatConversationRead,
  openGroupChat,
  openPrivateChat,
  setChatAnnouncement,
  translateChatMessage,
  toggleChatMessageReaction,
  uploadChatAttachment,
} from "../../services/chat.service";
import vanaraLogo from "../../assets/img/logo.png";
import type { ChatConversation, ChatLanguage, ChatMessage, ChatMessageReply, ChatReactionEmoji, ChatUser } from "../../types/chat";
import { CHAT_STICKERS, type ChatStickerDefinition } from "../../config/chatStickers";
import "../../styles/ChatPage.css";

type TeamChatSurfaceMode = "route" | "overlay";
const QUICK_REACTIONS: ChatReactionEmoji[] = ["👍", "😂", "😍", "🙏", "👀", "🔥"];

interface TeamChatSurfaceProps {
  activeConversationId?: string;
  mode?: TeamChatSurfaceMode;
  mobileView?: "list" | "thread";
  onActiveConversationChange?: (conversationId: string) => void;
  onMobileViewChange?: (view: "list" | "thread") => void;
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
      {variant === "vanara" ? <img src={vanaraLogo} alt="" draggable={false} /> : photoUrl ? <img src={photoUrl} alt="" draggable={false} /> : <span>{label}</span>}
    </span>
  );
}

function chatAvatarVariant(conversation: ChatConversation): "group" | "user" | "vanara" {
  if (conversation.isMainGroup) return "vanara";
  return conversation.kind === "GROUP" ? "group" : "user";
}

function ChatToolIcon({ type }: { type: "plus" | "camera" | "gallery" | "sticker" | "send" | "close" | "user" | "group" }) {
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
  kind,
  users,
  isLoading,
  onOpenPrivate,
  onOpenGroup,
  onClose,
}: {
  kind: "private" | "group";
  users: ChatUser[];
  isLoading: boolean;
  onOpenPrivate: (userId: string) => void;
  onOpenGroup: (payload: { title: string; participantIds: string[] }) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"people" | "group-details">("people");
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  function toggleUser(userId: string) {
    setSelectedUserIds((current) => current.includes(userId)
      ? current.filter((item) => item !== userId)
      : [...current, userId]);
  }

  const selectedUsers = users.filter((user) => selectedUserIds.includes(user.id));
  const canContinue = kind === "private" ? selectedUserIds.length === 1 : selectedUserIds.length >= 2;
  const canCreateGroup = groupTitle.trim().length >= 2 && selectedUserIds.length >= 2;

  function handlePeopleNext() {
    if (kind === "private" && selectedUserIds.length === 1) {
      onOpenPrivate(selectedUserIds[0]);
      return;
    }
    if (kind === "group" && selectedUserIds.length >= 2) setStep("group-details");
  }

  return (
    <div className="chat-picker" role="dialog" aria-modal="true" aria-label={kind === "group" ? "New Group Chat" : "New Chat"}>
      <div className="chat-picker__sheet">
        <header>
          <h2>{kind === "group" && step === "group-details" ? "Group Details" : kind === "group" ? "New Group Chat" : "New Chat"}</h2>
          <button type="button" className="chat-picker__close" onClick={onClose} aria-label="Close">
            <ChatToolIcon type="close" />
          </button>
        </header>
        <div className="chat-picker__list">
          {isLoading ? (
            <p>Loading team...</p>
          ) : users.length > 0 ? (
            step === "people" ? (
              <>
                <div className="chat-picker__user-list" aria-label="Team members">
                {users.map((user) => {
                  const selected = selectedUserIds.includes(user.id);
                  return (
                  <button
                    key={user.id}
                    type="button"
                    className={`chat-picker__user ${selected ? "is-selected" : ""}`}
                    onClick={() => kind === "private" ? setSelectedUserIds([user.id]) : toggleUser(user.id)}
                    aria-pressed={selected}
                  >
                    <ConversationAvatar label={avatarLabel(user.displayName)} photoUrl={user.profilePhotoUrl} />
                    <span>
                      <strong>{user.displayName}</strong>
                      <small>@{user.username}</small>
                    </span>
                    <span className="chat-picker__check" aria-hidden="true" />
                  </button>
                  );
                })}
                </div>
                <button
                  type="button"
                  className="chat-picker__primary"
                  disabled={!canContinue}
                  onClick={handlePeopleNext}
                >
                  {kind === "private" ? "Start Chat" : "Next"}
                </button>
              </>
            ) : (
              <div className="chat-picker__group-details">
                <div className="chat-picker__group-avatar" aria-hidden="true">
                  {avatarLabel(groupTitle || "Group")}
                </div>
                <label className="chat-picker__group-name">
                  <span>Group name</span>
                  <input
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    maxLength={80}
                    placeholder="Chat Ristorante"
                    autoFocus
                  />
                </label>
                <div className="chat-picker__selected-people" aria-label="Selected team members">
                  {selectedUsers.map((user) => (
                    <span key={user.id}>
                      <ConversationAvatar label={avatarLabel(user.displayName)} photoUrl={user.profilePhotoUrl} />
                      <strong>{user.displayName}</strong>
                    </span>
                  ))}
                </div>
                <div className="chat-picker__actions">
                  <button type="button" className="chat-picker__secondary" onClick={() => setStep("people")}>Back</button>
                  <button
                    type="button"
                    className="chat-picker__primary"
                    disabled={!canCreateGroup}
                    onClick={() => onOpenGroup({ title: groupTitle.trim(), participantIds: selectedUserIds })}
                  >
                    Create Group
                  </button>
                </div>
              </div>
            )
          ) : (
            <p>No team members available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function chatPreview(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > 86 ? `${compact.slice(0, 83)}...` : compact;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpired(value: string): boolean {
  return new Date(value).getTime() <= Date.now();
}

function stickerById(stickerId: string | null): ChatStickerDefinition | null {
  if (!stickerId) return null;
  return CHAT_STICKERS.find((sticker) => sticker.id === stickerId) ?? null;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

interface ChatContextMenuState {
  message: ChatMessage;
  anchorRect: ContextMenuAnchorRect;
}

interface ContextMenuAnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

interface ContextMenuPosition {
  left: number;
  top: number;
  placement: "above" | "below";
}

function clearNativeSelection() {
  window.getSelection?.()?.removeAllRanges();
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function preventNativeChatContextMenu(event: ReactMouseEvent<HTMLElement>) {
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  clearNativeSelection();
}

function toAnchorRect(rect: DOMRect): ContextMenuAnchorRect {
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function viewportBox() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function contextMenuPosition(anchorRect: ContextMenuAnchorRect, menuRect?: DOMRect | null): ContextMenuPosition {
  const padding = 12;
  const gap = 10;
  const fallbackWidth = 286;
  const fallbackHeight = 174;
  const viewport = viewportBox();
  const width = menuRect?.width ?? fallbackWidth;
  const height = menuRect?.height ?? fallbackHeight;
  const minLeft = viewport.left + padding;
  const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - padding);
  const minTop = viewport.top + padding;
  const maxTop = Math.max(minTop, viewport.top + viewport.height - height - padding);
  const centeredLeft = anchorRect.left + (anchorRect.width / 2) - (width / 2);
  const left = clamp(centeredLeft, minLeft, maxLeft);
  const belowTop = anchorRect.bottom + gap;
  const aboveTop = anchorRect.top - height - gap;
  const fitsBelow = belowTop + height <= viewport.top + viewport.height - padding;
  const fitsAbove = aboveTop >= minTop;
  if (fitsBelow || !fitsAbove) {
    return { left, top: clamp(belowTop, minTop, maxTop), placement: "below" };
  }
  return { left, top: clamp(aboveTop, minTop, maxTop), placement: "above" };
}

function ChatMessageContextMenu({
  state,
  feedback,
  onClose,
  onCopy,
  onReply,
  onTranslate,
  onAnnounce,
  onReact,
}: {
  state: ChatContextMenuState;
  feedback: string | null;
  onClose: () => void;
  onCopy: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  onTranslate: (message: ChatMessage) => void;
  onAnnounce: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: ChatReactionEmoji) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ContextMenuPosition>(() => contextMenuPosition(state.anchorRect));

  useLayoutEffect(() => {
    function updatePosition() {
      setPosition(contextMenuPosition(state.anchorRect, menuRef.current?.getBoundingClientRect()));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [state.anchorRect]);

  const layer = (
    <div className="chat-context-menu-layer" role="presentation">
      <button type="button" className="chat-context-menu__backdrop" onClick={onClose} aria-label="Close message actions" />
      <div
        ref={menuRef}
        className={`chat-context-menu chat-context-menu--${position.placement}`}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
        }}
      >
        <div className="chat-context-menu__reactions" aria-label="Quick reactions">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onReact(state.message, emoji)} aria-label={`React ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
        <div className="chat-context-menu__actions">
          <button type="button" onClick={() => onCopy(state.message)}>Copia</button>
          <button type="button" onClick={() => onReply(state.message)}>Rispondi</button>
          <button type="button" onClick={() => onTranslate(state.message)}>Translate</button>
          <button type="button" onClick={() => onAnnounce(state.message)}>Annuncia</button>
        </div>
        {feedback && <span className="chat-context-menu__feedback">{feedback}</span>}
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(layer, document.body);
}

function ChatMessageBubble({
  message,
  currentUserId,
  highlighted,
  showTranslation,
  translationError,
  registerMessage,
  onContextRequest,
  onJumpToMessage,
  onReaction,
}: {
  message: ChatMessage;
  currentUserId: string;
  highlighted: boolean;
  showTranslation: boolean;
  translationError: boolean;
  registerMessage: (messageId: number, element: HTMLElement | null) => void;
  onContextRequest: (message: ChatMessage, anchorRect: ContextMenuAnchorRect) => void;
  onJumpToMessage: (messageId: number) => void;
  onReaction: (message: ChatMessage, emoji: ChatReactionEmoji) => void;
}) {
  const outgoing = message.author.id === currentUserId;
  const contextable = !outgoing && message.messageKind === "TEXT";
  const sticker = stickerById(message.stickerId);
  const attachmentUnavailable = Boolean(
    message.attachment &&
    (message.attachment.unavailableAt || isExpired(message.attachment.expiresAt))
  );
  const [attachmentFailed, setAttachmentFailed] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function requestMenu(element: HTMLElement) {
    clearLongPress();
    clearNativeSelection();
    onContextRequest(message, toAnchorRect(element.getBoundingClientRect()));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!contextable) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    const element = event.currentTarget;
    longPressTimer.current = window.setTimeout(() => requestMenu(element), 520);
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!contextable) return;
    if (event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    requestMenu(event.currentTarget);
  }

  return (
    <article
      ref={(element) => registerMessage(message.id, element)}
      className={`chat-thread-message ${outgoing ? "is-outgoing" : "is-incoming"} ${highlighted ? "is-highlighted" : ""}`}
      data-chat-message-id={message.id}
    >
      {!outgoing && <ConversationAvatar label={avatarLabel(message.author.displayName)} photoUrl={message.author.profilePhotoUrl} />}
      <div className="chat-thread-message__content">
        {!outgoing && <span className="chat-thread-message__author">{message.author.displayName}</span>}
        <div
          className={`chat-thread-message__bubble chat-thread-message__bubble--${message.messageKind.toLowerCase()}`}
          onPointerDown={handlePointerDown}
          onPointerMove={clearLongPress}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onContextMenu={handleContextMenu}
        >
          {message.replyTo && (
            <button type="button" className="chat-thread-message__quote" onClick={() => onJumpToMessage(message.replyTo!.messageId)}>
              <strong>{message.replyTo.authorDisplayName}</strong>
              <span>{message.replyTo.bodyPreview}</span>
            </button>
          )}
          {message.messageKind === "STICKER" ? (
            <div className={`chat-thread-message__sticker chat-thread-message__sticker--${sticker?.tone ?? "warm"}`} aria-label={sticker?.label ?? "Sticker"}>
              <span>{sticker?.symbol ?? "✨"}</span>
              <strong>{sticker?.label ?? message.body.replace(/^Sticker:\s*/i, "")}</strong>
            </div>
          ) : message.messageKind === "ATTACHMENT" && message.attachment ? (
            attachmentUnavailable || attachmentFailed ? (
              <div className="chat-thread-message__attachment chat-thread-message__attachment--missing">
                <strong>File no longer available</strong>
                <span>{message.attachment.fileName}</span>
              </div>
            ) : message.attachment.isImage ? (
              <a className="chat-thread-message__attachment chat-thread-message__attachment--image" href={message.attachment.downloadUrl} target="_blank" rel="noreferrer">
                <img src={message.attachment.downloadUrl} alt={message.attachment.fileName} draggable={false} onError={() => setAttachmentFailed(true)} />
                <span>{message.attachment.fileName}</span>
              </a>
            ) : (
              <a className="chat-thread-message__attachment chat-thread-message__attachment--file" href={message.attachment.downloadUrl} target="_blank" rel="noreferrer">
                <strong>{message.attachment.fileName}</strong>
                <span>{formatFileSize(message.attachment.byteSize)}</span>
              </a>
            )
          ) : (
            <p lang={message.bodyLanguage}>{message.body}</p>
          )}
          {showTranslation && message.translatedBody && message.translatedLanguage && (
            <p className="chat-thread-message__translation" lang={message.translatedLanguage}>{message.translatedBody}</p>
          )}
          {translationError && (
            <p className="chat-thread-message__translation chat-thread-message__translation--error">Translation is not available yet.</p>
          )}
        </div>
        {message.reactions.length > 0 && (
          <div className="chat-thread-message__reactions" aria-label="Message reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className={reaction.reactedByMe ? "is-mine" : ""}
                onClick={() => onReaction(message, reaction.emoji)}
              >
                <span>{reaction.emoji}</span>
                <strong>{reaction.count}</strong>
              </button>
            ))}
          </div>
        )}
        <time>{formatChatTime(message.createdAt)}</time>
      </div>
    </article>
  );
}

function ChatComposer({
  conversationId,
  replyTarget,
  onCancelReply,
}: {
  conversationId: string;
  replyTarget: ChatMessageReply | null;
  onCancelReply: () => void;
}) {
  const [body, setBody] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [stickersOpen, setStickersOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  async function refreshChat() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversationId] }),
      queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversationId] }),
      queryClient.invalidateQueries({ queryKey: ["chat", "summary"] }),
    ]);
  }

  const mutation = useMutation({
    mutationFn: () => createChatMessage(conversationId, {
      messageKind: "TEXT",
      body,
      bodyLanguage: inferLanguage(body),
      replyToMessageId: replyTarget?.messageId ?? null,
    }),
    onSuccess: async () => {
      setBody("");
      onCancelReply();
      await refreshChat();
    },
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadChatAttachment(conversationId, file, replyTarget?.messageId ?? null),
    onSuccess: async () => {
      onCancelReply();
      await refreshChat();
    },
  });
  const stickerMutation = useMutation({
    mutationFn: (sticker: ChatStickerDefinition) => createChatMessage(conversationId, {
      messageKind: "STICKER",
      body: `Sticker: ${sticker.label}`,
      bodyLanguage: "en",
      stickerId: sticker.id,
      replyToMessageId: replyTarget?.messageId ?? null,
    }),
    onSuccess: async () => {
      setStickersOpen(false);
      onCancelReply();
      await refreshChat();
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

  function uploadSelectedFile(file: File | undefined | null) {
    if (!file || uploadMutation.isPending) return;
    uploadMutation.mutate(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    uploadSelectedFile(event.target.files?.[0]);
    event.target.value = "";
  }

  return (
    <form className={`chat-composer ${isFocused ? "is-focused" : ""} ${stickersOpen ? "has-stickers" : ""}`} aria-label="Message composer" onSubmit={submit}>
      {stickersOpen && (
        <div className="chat-sticker-drawer" aria-label="Stickers">
          {CHAT_STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              className={`chat-sticker chat-sticker--${sticker.tone}`}
              onClick={() => stickerMutation.mutate(sticker)}
              disabled={stickerMutation.isPending}
              aria-label={sticker.label}
            >
              <span>{sticker.symbol}</span>
              <strong>{sticker.label}</strong>
            </button>
          ))}
        </div>
      )}
      {replyTarget && (
        <div className="chat-composer__reply-preview">
          <span>
            <strong>{replyTarget.authorDisplayName}</strong>
            <small>{replyTarget.bodyPreview}</small>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply">
            <ChatToolIcon type="close" />
          </button>
        </div>
      )}
      <div className="chat-composer__tools chat-composer__tools--left" aria-label="Message tools">
        <button type="button" aria-label="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}><ChatToolIcon type="plus" /></button>
        <button type="button" aria-label="Open camera" onClick={() => cameraInputRef.current?.click()} disabled={uploadMutation.isPending}><ChatToolIcon type="camera" /></button>
        <button type="button" aria-label="Choose image" onClick={() => galleryInputRef.current?.click()} disabled={uploadMutation.isPending}><ChatToolIcon type="gallery" /></button>
      </div>
      <input ref={fileInputRef} className="chat-composer__file-input" type="file" onChange={handleFileChange} />
      <input ref={cameraInputRef} className="chat-composer__file-input" type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
      <input ref={galleryInputRef} className="chat-composer__file-input" type="file" accept="image/*" onChange={handleFileChange} />
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
        <button type="button" aria-label="Open stickers" aria-expanded={stickersOpen} onClick={() => setStickersOpen((open) => !open)} disabled={stickerMutation.isPending}><ChatToolIcon type="sticker" /></button>
        {body.trim() && (
          <button className="chat-composer__send" type="submit" disabled={mutation.isPending} aria-label="Send message">
            <ChatToolIcon type="send" />
          </button>
        )}
      </div>
      {isFocused && (
        <div className="chat-composer__focus-row">
          <button type="button" className="chat-composer__cancel-focus" onMouseDown={(event) => event.preventDefault()} onClick={exitFocusMode} aria-label="Exit writing mode">
            <ChatToolIcon type="close" />
          </button>
        </div>
      )}
      {(mutation.isError || uploadMutation.isError || stickerMutation.isError) && <p className="chat-composer__error">Message was not saved. Please try again.</p>}
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
  const [contextMenu, setContextMenu] = useState<ChatContextMenuState | null>(null);
  const [contextFeedback, setContextFeedback] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessageReply | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(() => new Set());
  const [translationErrors, setTranslationErrors] = useState<Set<number>>(() => new Set());
  const messageRefs = useRef(new Map<number, HTMLElement>());
  const queryClient = useQueryClient();

  const reactionMutation = useMutation({
    mutationFn: ({ message, emoji }: { message: ChatMessage; emoji: ChatReactionEmoji }) =>
      toggleChatMessageReaction(conversation.id, message.id, { emoji }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversation.id] });
    },
  });
  const announceMutation = useMutation({
    mutationFn: (message: ChatMessage) => setChatAnnouncement(conversation.id, { messageId: message.id }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversation.id] }),
        queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
      ]);
    },
  });
  const clearAnnouncementMutation = useMutation({
    mutationFn: () => clearChatAnnouncement(conversation.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat", "conversation", conversation.id] }),
        queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] }),
      ]);
    },
  });
  const translateMutation = useMutation({
    mutationFn: (message: ChatMessage) => translateChatMessage(conversation.id, message.id),
    onSuccess: async (message) => {
      setVisibleTranslations((current) => new Set(current).add(message.id));
      setTranslationErrors((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["chat", "messages", conversation.id] });
    },
    onError: (_error, message) => {
      setTranslationErrors((current) => new Set(current).add(message.id));
    },
  });

  function registerMessage(messageId: number, element: HTMLElement | null) {
    if (element) messageRefs.current.set(messageId, element);
    else messageRefs.current.delete(messageId);
  }

  function jumpToMessage(messageId: number) {
    const element = messageRefs.current.get(messageId);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1300);
  }

  function openContextMenu(message: ChatMessage, anchorRect: ContextMenuAnchorRect) {
    setContextFeedback(null);
    setContextMenu({
      message,
      anchorRect,
    });
  }

  async function handleCopy(message: ChatMessage) {
    try {
      await copyText(message.body);
      setContextFeedback("Copiato");
      window.setTimeout(() => setContextMenu(null), 420);
    } catch {
      setContextFeedback("Copy unavailable");
    }
  }

  function handleReply(message: ChatMessage) {
    setReplyTarget({
      messageId: message.id,
      authorDisplayName: message.author.displayName,
      bodyPreview: chatPreview(message.body),
    });
    setContextMenu(null);
  }

  function handleTranslate(message: ChatMessage) {
    if (message.translatedBody) {
      setVisibleTranslations((current) => new Set(current).add(message.id));
      setContextMenu(null);
      return;
    }
    translateMutation.mutate(message);
    setContextMenu(null);
  }

  function handleAnnounce(message: ChatMessage) {
    announceMutation.mutate(message);
    setContextMenu(null);
  }

  function handleReaction(message: ChatMessage, emoji: ChatReactionEmoji) {
    reactionMutation.mutate({ message, emoji });
    setContextMenu(null);
  }

  return (
    <section className="chat-thread" aria-label={`${conversation.title} conversation`}>
      <header className="chat-thread__header">
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

      {conversation.announcement && (
        <div className="chat-announcement">
          <button type="button" onClick={() => jumpToMessage(conversation.announcement!.messageId)}>
            <strong>Annuncio</strong>
            <span>{conversation.announcement.authorDisplayName}: {conversation.announcement.bodyPreview}</span>
          </button>
          <button type="button" className="chat-announcement__clear" onClick={() => clearAnnouncementMutation.mutate()} aria-label="Clear announcement">
            <ChatToolIcon type="close" />
          </button>
        </div>
      )}

      <div className="chat-thread__messages">
        {messages.length > 0 ? (
          messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              highlighted={highlightedMessageId === message.id}
              showTranslation={visibleTranslations.has(message.id)}
              translationError={translationErrors.has(message.id)}
              registerMessage={registerMessage}
              onContextRequest={openContextMenu}
              onJumpToMessage={jumpToMessage}
              onReaction={handleReaction}
            />
          ))
        ) : (
          <div className="chat-thread__empty">
            <h3>No messages yet</h3>
            <p>Start with a quick team note.</p>
          </div>
        )}
      </div>

      <ChatComposer conversationId={conversation.id} replyTarget={replyTarget} onCancelReply={() => setReplyTarget(null)} />
      {contextMenu && (
        <ChatMessageContextMenu
          state={contextMenu}
          feedback={contextFeedback}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onReply={handleReply}
          onTranslate={handleTranslate}
          onAnnounce={handleAnnounce}
          onReact={handleReaction}
        />
      )}
    </section>
  );
}

export default function TeamChatSurface({
  activeConversationId,
  mode = "route",
  mobileView,
  onActiveConversationChange,
  onMobileViewChange,
}: TeamChatSurfaceProps) {
  const queryClient = useQueryClient();
  const [pickerKind, setPickerKind] = useState<"private" | "group" | null>(null);
  const [localMobileView, setLocalMobileView] = useState<"list" | "thread">(activeConversationId ? "thread" : "list");
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
    enabled: Boolean(pickerKind),
  });

  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const fallbackConversationId = conversations[0]?.id ?? "";
  const selectedConversationId = activeConversationId ?? (localActiveConversationId || fallbackConversationId);
  const activeInList = conversations.some((conversation) => conversation.id === selectedConversationId);
  const currentMobileView = mobileView ?? localMobileView;

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
      setPickerKind(null);
      await queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
      selectConversation(conversation.id);
    },
  });
  const openGroupMutation = useMutation({
    mutationFn: (payload: { title: string; participantIds: string[] }) => openGroupChat(payload),
    onSuccess: async (conversation) => {
      setPickerKind(null);
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
    if (onMobileViewChange) {
      onMobileViewChange("thread");
    } else {
      setLocalMobileView("thread");
    }
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
      <div
        className={`chat-app chat-app--${mode} chat-app--mobile-${currentMobileView}`}
        data-internal-chat="team"
        onContextMenu={preventNativeChatContextMenu}
      >
        <aside className="chat-list" aria-label="Team conversations">
          <header className="chat-list__header">
            <div>
              <h1>Chat</h1>
            </div>
            <div className="chat-list__actions">
              <button type="button" className="chat-list__new-chat" onClick={() => setPickerKind("private")} aria-label="New Chat">
                <ChatToolIcon type="user" />
                <span>New Chat</span>
              </button>
              <button type="button" className="chat-list__new-chat chat-list__new-chat--group" onClick={() => setPickerKind("group")} aria-label="New Group Chat">
                <ChatToolIcon type="group" />
                <span>New Group Chat</span>
              </button>
            </div>
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

      {pickerKind && (
        <NewChatPicker
          kind={pickerKind}
          users={usersQuery.data ?? []}
          isLoading={usersQuery.isLoading}
          onOpenPrivate={(userId) => openPrivateMutation.mutate(userId)}
          onOpenGroup={(payload) => openGroupMutation.mutate(payload)}
          onClose={() => setPickerKind(null)}
        />
      )}
    </>
  );
}
