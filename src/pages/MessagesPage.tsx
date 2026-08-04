import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError, PageLoading } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import VanaraGlassRegion from "../components/vanara/VanaraGlassRegion";
import VanaraGlassSheet from "../components/vanara/VanaraGlassSheet";
import VanaraSectionHeader from "../components/vanara/VanaraSectionHeader";
import {
  approveGuestMessageDraft,
  loadGuestMessageConversation,
  loadGuestMessageInbox,
  rejectGuestMessageDraft,
  saveGuestMessageDraft,
} from "../services/messages.service";
import type {
  GuestMessageBookingContext,
  GuestMessageConversationDetail,
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

interface DraftActionHandlers {
  busy: boolean;
  onApprove: (draftId: string) => Promise<void>;
  onApproveEdited: (draftId: string, draftText: string) => Promise<void>;
  onReject: (draftId: string) => Promise<void>;
  onSave: (draftId: string, draftText: string) => Promise<void>;
}

function TimelineBubble({ actions, item }: { actions: DraftActionHandlers; item: GuestMessageTimelineItem }) {
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
          <strong>{item.status}</strong>
        </div>
      ) : null}
      <p>{item.message}</p>
      {item.kind === "draft" && item.status === "READY" ? (
        <DraftActions actions={actions} item={item} key={`${item.draftId ?? item.id}:${item.message}`} />
      ) : null}
    </article>
  );
}

function DraftActions({ actions, item }: { actions: DraftActionHandlers; item: GuestMessageTimelineItem }) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(item.message);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const draftId = item.draftId;
  const canReview = Boolean(item.canReview && draftId);

  const run = async (callback: () => Promise<void>, success: string) => {
    setError("");
    setNotice("");
    try {
      await callback();
      setNotice(success);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review action could not be completed.");
    }
  };

  if (!canReview) {
    return (
      <div className="messages-draft-actions" aria-label="Draft review actions">
        <button className="vc-secondary-action" type="button" disabled>
          Read only
        </button>
      </div>
    );
  }
  const activeDraftId = draftId!;

  return (
    <div className="messages-draft-actions" aria-label="Draft review actions">
      {editing ? (
        <div className="messages-draft-editor">
          <label>
            <span className="vc-sr-only">Edit Waraporn draft</span>
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              rows={8}
            />
          </label>
          <div className="messages-draft-editor__actions">
            <button
              className="vc-secondary-action"
              type="button"
              disabled={actions.busy || !draftText.trim()}
              onClick={() => run(() => actions.onSave(activeDraftId, draftText), "Draft saved.")}
            >
              Save Draft
            </button>
            <button
              className="vc-primary-action"
              type="button"
              disabled={actions.busy || !draftText.trim()}
              onClick={() => run(() => actions.onApproveEdited(activeDraftId, draftText), "Edited reply sent.")}
            >
              Approve & Send
            </button>
            <button className="vc-secondary-action" type="button" disabled={actions.busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className="vc-primary-action"
            type="button"
            disabled={actions.busy}
            onClick={() => run(() => actions.onApprove(activeDraftId), "Reply sent.")}
          >
            Approve
          </button>
          <button className="vc-secondary-action" type="button" disabled={actions.busy} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button
            className="vc-secondary-action"
            type="button"
            disabled={actions.busy}
            onClick={() => run(() => actions.onReject(activeDraftId), "Draft rejected.")}
          >
            Reject
          </button>
        </>
      )}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function ConversationColumn({
  actions,
  conversation,
  loading,
  onRetry,
}: {
  actions: DraftActionHandlers;
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
          <TimelineBubble actions={actions} item={item} key={item.id} />
        ))}
      </div>
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
  const queryClient = useQueryClient();
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

  const applyConversation = (detail: GuestMessageConversationDetail) => {
    queryClient.setQueryData(["guest-messages", "conversation", detail.conversation.conversationId], detail);
    void queryClient.invalidateQueries({ queryKey: ["guest-messages", "inbox"] });
  };

  const approveMutation = useMutation({
    mutationFn: approveGuestMessageDraft,
    onSuccess: applyConversation,
  });
  const rejectMutation = useMutation({
    mutationFn: (draftId: string) => rejectGuestMessageDraft(draftId),
    onSuccess: applyConversation,
  });
  const saveMutation = useMutation({
    mutationFn: ({ draftId, draftText }: { draftId: string; draftText: string }) => saveGuestMessageDraft(draftId, draftText),
    onSuccess: applyConversation,
  });

  const draftActions: DraftActionHandlers = {
    busy: approveMutation.isPending || rejectMutation.isPending || saveMutation.isPending,
    onApprove: async (draftId) => {
      await approveMutation.mutateAsync(draftId);
    },
    onApproveEdited: async (draftId, draftText) => {
      await saveMutation.mutateAsync({ draftId, draftText });
      await approveMutation.mutateAsync(draftId);
    },
    onReject: async (draftId) => {
      await rejectMutation.mutateAsync(draftId);
    },
    onSave: async (draftId, draftText) => {
      await saveMutation.mutateAsync({ draftId, draftText });
    },
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
          actions={draftActions}
          conversation={detailQuery.data?.timeline ?? []}
          loading={detailQuery.isLoading}
          onRetry={retry}
        />

        <ContextColumn context={detailQuery.data?.bookingContext ?? null} />
      </div>
    </WorkspaceShell>
  );
}
