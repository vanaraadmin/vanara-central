import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import {
  loadGuestMessageConversation,
  loadGuestMessageInbox,
} from "../services/messages.service";
import type {
  GuestMessageBookingContext,
  GuestMessageInboxGroup,
  GuestMessageInboxItem,
  GuestMessageTimelineItem,
} from "../types/messages";
import "../styles/messages.css";

const GROUPS: Array<{ id: GuestMessageInboxGroup; label: string; tone: string }> = [
  { id: "needsReply", label: "Needs Reply", tone: "orange" },
  { id: "waitingGuest", label: "Waiting Guest", tone: "grey" },
  { id: "closed", label: "Closed", tone: "green" },
];

function formatTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function groupLabel(group: GuestMessageInboxGroup): string {
  return GROUPS.find((item) => item.id === group)?.label ?? "Messages";
}

function providerInitial(label: string): string {
  const cleaned = label.trim();
  return cleaned ? cleaned.slice(0, 1).toUpperCase() : "O";
}

function ConversationRow({
  active,
  conversation,
  onSelect,
}: {
  active: boolean;
  conversation: GuestMessageInboxItem;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`messages-inbox-row ${active ? "is-active" : ""}`}
      onClick={() => onSelect(conversation.conversationId)}
    >
      <span className="messages-inbox-row__provider" aria-label={conversation.otaLabel}>
        {providerInitial(conversation.otaLabel)}
      </span>
      <span className="messages-inbox-row__body">
        <span className="messages-inbox-row__topline">
          <strong>{conversation.guestName}</strong>
          <time>{formatTime(conversation.lastActivityAt)}</time>
        </span>
        <span className="messages-inbox-row__room">{conversation.room}</span>
        <span className="messages-inbox-row__preview">{conversation.lastMessagePreview}</span>
      </span>
      {conversation.unreadCount > 0 ? (
        <span className="messages-inbox-row__badge" aria-label={`${conversation.unreadCount} unread messages`}>
          {conversation.unreadCount}
        </span>
      ) : null}
    </button>
  );
}

function InboxColumn({
  activeConversationId,
  conversationsByGroup,
  loading,
  onSearch,
  onSelect,
  search,
}: {
  activeConversationId: string;
  conversationsByGroup: Record<GuestMessageInboxGroup, GuestMessageInboxItem[]>;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (conversationId: string) => void;
  search: string;
}) {
  return (
    <VanaraGlassRegion className="messages-inbox" ariaLabelledBy="messages-inbox-title">
      <VanaraSectionHeader
        eyebrow="Inbox"
        headingId="messages-inbox-title"
        meta={loading ? "Syncing" : "Live"}
        title="Guest Messages"
      />

      <label className="messages-search">
        <span className="vc-sr-only">Search conversations</span>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search guest, room, booking, provider"
        />
      </label>

      <div className="messages-inbox__groups">
        {GROUPS.map((group) => {
          const items = conversationsByGroup[group.id] ?? [];
          return (
            <section className="messages-inbox-group" key={group.id}>
              <div className={`messages-inbox-group__heading messages-state--${group.tone}`}>
                <span>{group.label}</span>
                <small>{items.length}</small>
              </div>
              {items.length > 0 ? (
                <div className="messages-inbox-group__rows">
                  {items.map((conversation) => (
                    <ConversationRow
                      active={conversation.conversationId === activeConversationId}
                      conversation={conversation}
                      key={conversation.conversationId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              ) : (
                <p className="messages-inbox-group__empty">No conversations.</p>
              )}
            </section>
          );
        })}
      </div>
    </VanaraGlassRegion>
  );
}

function TimelineBubble({ item }: { item: GuestMessageTimelineItem }) {
  const label = item.kind === "draft" ? "Waraporn Draft" : item.sender;
  return (
    <article className={`messages-bubble messages-bubble--${item.kind}`}>
      <div className="messages-bubble__meta">
        <span>{label}</span>
        <time>{formatTime(item.timestamp)}</time>
      </div>
      {item.kind === "draft" ? (
        <div className="messages-bubble__draft-header">
          <span>Waraporn Draft</span>
          <strong>READY</strong>
        </div>
      ) : null}
      <p>{item.message}</p>
    </article>
  );
}

function DraftActions() {
  const [notice, setNotice] = useState("");
  const showNotice = () => setNotice("Coming in Sprint 08.");

  return (
    <div className="messages-draft-actions" aria-label="Draft review actions">
      <button className="vc-primary-action" type="button" aria-disabled="true" onClick={showNotice}>
        Approve
      </button>
      <button className="vc-secondary-action" type="button" aria-disabled="true" onClick={showNotice}>
        Edit
      </button>
      <button className="vc-secondary-action" type="button" aria-disabled="true" onClick={showNotice}>
        Reject
      </button>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}

function ConversationColumn({
  conversation,
  loading,
  onRetry,
}: {
  conversation: GuestMessageTimelineItem[];
  loading: boolean;
  onRetry: () => void;
}) {
  const hasReadyDraft = conversation.some((item) => item.kind === "draft" && item.status === "READY");

  if (loading) {
    return (
      <VanaraGlassSheet className="messages-conversation" ariaLabel="Conversation">
        <PageLoading />
      </VanaraGlassSheet>
    );
  }

  if (conversation.length === 0) {
    return (
      <VanaraGlassSheet className="messages-conversation" ariaLabel="Conversation">
        <div className="messages-empty">
          <h2>No conversation selected</h2>
          <p>Select a guest message from the inbox.</p>
          <button className="vc-secondary-action" type="button" onClick={onRetry}>
            Refresh
          </button>
        </div>
      </VanaraGlassSheet>
    );
  }

  return (
    <VanaraGlassSheet className="messages-conversation" ariaLabel="Conversation timeline" variant="elevated">
      <div className="messages-conversation__header">
        <span>Conversation</span>
        <strong>{hasReadyDraft ? "Draft Ready" : "Read Only"}</strong>
      </div>
      <div className="messages-timeline">
        {conversation.map((item) => (
          <TimelineBubble item={item} key={item.id} />
        ))}
      </div>
      {hasReadyDraft ? <DraftActions /> : null}
    </VanaraGlassSheet>
  );
}

function ContextColumn({ context }: { context: GuestMessageBookingContext | null }) {
  const rows = context ? [
    ["Guest", context.guest],
    ["Arrival", context.arrival ?? "-"],
    ["Departure", context.departure ?? "-"],
    ["Room", context.room],
    ["Travel phase", context.travelPhase],
    ["Provider", context.provider],
    ["Channel", context.channel],
    ["Accommodation", context.accommodation],
    ["Booking status", context.bookingStatus],
  ] : [];

  return (
    <VanaraGlassRegion className="messages-context" ariaLabelledBy="messages-context-title">
      <VanaraSectionHeader
        eyebrow="Read only"
        headingId="messages-context-title"
        title="Booking Context"
      />
      {context ? (
        <details className="messages-context__details" open>
          <summary>Booking details</summary>
          <dl className="messages-context__grid">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : (
        <p className="messages-context__empty">Booking context appears when a conversation is selected.</p>
      )}
    </VanaraGlassRegion>
  );
}

export default function MessagesPage() {
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const inboxQuery = useQuery({
    queryKey: ["guest-messages", "inbox", search.trim()],
    queryFn: ({ signal }) => loadGuestMessageInbox(search, signal),
    refetchInterval: 60_000,
  });

  const conversations = useMemo(() => inboxQuery.data?.conversations ?? [], [inboxQuery.data]);
  const activeConversationId = useMemo(() => {
    if (conversations.some((conversation) => conversation.conversationId === selectedConversationId)) return selectedConversationId;
    return conversations[0]?.conversationId ?? "";
  }, [conversations, selectedConversationId]);

  const detailQuery = useQuery({
    queryKey: ["guest-messages", "conversation", activeConversationId],
    queryFn: ({ signal }) => loadGuestMessageConversation(activeConversationId, signal),
    enabled: Boolean(activeConversationId),
    refetchInterval: 60_000,
  });

  const retry = () => {
    void inboxQuery.refetch();
    void detailQuery.refetch();
  };

  if (inboxQuery.isError && !inboxQuery.data) {
    return (
      <WorkspaceShell title="Messages" workspace="messages" bodyClassName="messages-page" wide>
        <PageError onRetry={retry} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title="Messages"
      stickyNavigationTitle="Messages"
      workspace="messages"
      bodyClassName="messages-page"
      wide
    >
      <div className="workspace-body-actions">
        <span>{groupLabel(detailQuery.data?.conversation.group ?? "needsReply")}</span>
        <button className="vc-secondary-action" type="button" onClick={retry}>
          Refresh
        </button>
      </div>

      <div className="messages-layout">
        <InboxColumn
          activeConversationId={activeConversationId}
          conversationsByGroup={inboxQuery.data?.groups ?? { needsReply: [], waitingGuest: [], closed: [] }}
          loading={inboxQuery.isFetching}
          onSearch={setSearch}
          onSelect={setSelectedConversationId}
          search={search}
        />

        <ConversationColumn
          conversation={detailQuery.data?.timeline ?? []}
          loading={detailQuery.isLoading}
          onRetry={retry}
        />

        <ContextColumn context={detailQuery.data?.bookingContext ?? null} />
      </div>
    </WorkspaceShell>
  );
}
