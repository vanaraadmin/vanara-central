import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError } from "../components/AsyncState";
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
import { useLanguage } from "../providers/language.context";
import "../styles/messages.css";

const GROUPS: Array<{ id: GuestMessageInboxGroup; labelKey: string; tone: string }> = [
  { id: "needsReply", labelKey: "guestMessagesNeedsReply", tone: "orange" },
  { id: "waitingGuest", labelKey: "guestMessagesWaitingGuest", tone: "grey" },
  { id: "closed", labelKey: "closed", tone: "green" },
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

function formatDay(value: string | null): string {
  if (!value) return "Conversation";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Conversation";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

type Translate = ReturnType<typeof useLanguage>["translate"];

function groupLabel(group: GuestMessageInboxGroup, translate: Translate): string {
  const key = GROUPS.find((item) => item.id === group)?.labelKey ?? "messages";
  return translate(key);
}

function emptyGroupMessage(group: GuestMessageInboxGroup, searching: boolean, translate: Translate): string {
  if (searching) return translate("guestMessagesNoSearchResults");
  if (group === "needsReply") return translate("guestMessagesNoDraftsWaiting");
  if (group === "waitingGuest") return translate("guestMessagesNoReplyRequired");
  return translate("guestMessagesNoClosedConversations");
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
  const { translate } = useLanguage();
  return (
    <button
      type="button"
      className={`messages-inbox-row ${active ? "is-active" : ""}`}
      onClick={() => onSelect(conversation.conversationId)}
      aria-current={active ? "true" : undefined}
      aria-label={`${conversation.guestName}, ${conversation.room}, ${conversation.otaLabel}`}
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
        <span className="messages-inbox-row__badge" aria-label={translate("guestMessagesUnreadCount", { count: conversation.unreadCount })}>
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
  const { translate } = useLanguage();
  return (
    <VanaraGlassRegion className="messages-inbox" ariaLabelledBy="messages-inbox-title">
      <VanaraSectionHeader
        eyebrow={translate("guestMessagesInbox")}
        headingId="messages-inbox-title"
        meta={loading ? translate("guestMessagesSyncing") : translate("guestMessagesLive")}
        title={translate("guestMessages")}
      />

      <label className="messages-search">
        <span className="vc-sr-only">{translate("guestMessagesSearchConversations")}</span>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={translate("guestMessagesSearchPlaceholder")}
          aria-label={translate("guestMessagesSearchPlaceholder")}
        />
      </label>

      <div className="messages-inbox__groups">
        {GROUPS.map((group) => {
          const items = conversationsByGroup[group.id] ?? [];
          return (
            <section className="messages-inbox-group" key={group.id}>
              <div className={`messages-inbox-group__heading messages-state--${group.tone}`}>
                <span>{translate(group.labelKey)}</span>
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
                <p className="messages-inbox-group__empty">{emptyGroupMessage(group.id, Boolean(search.trim()), translate)}</p>
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

function MessagesSkeleton({ rows = 4 }: { rows?: number }) {
  const { translate } = useLanguage();
  return (
    <div className="messages-skeleton" aria-label={translate("guestMessagesLoadingConversations")} aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span className="messages-skeleton__line" key={index} />
      ))}
    </div>
  );
}

function TimelineBubble({ actions, item }: { actions: DraftActionHandlers; item: GuestMessageTimelineItem }) {
  const { translate } = useLanguage();
  const label = item.kind === "draft" ? translate("guestMessagesDraft") : item.sender;
  const canActOnDraft = item.kind === "draft" && (item.status === "READY" || item.status === "DELIVERY_FAILED");
  return (
    <article className={`messages-bubble messages-bubble--${item.kind}`}>
      <div className="messages-bubble__meta">
        <span>{label}</span>
        <time>{formatTime(item.timestamp)}</time>
      </div>
      {item.kind === "draft" ? (
        <div className="messages-bubble__draft-header">
          <span>{translate("guestMessagesDraft")}</span>
          <strong>{item.status}</strong>
        </div>
      ) : null}
      <p>{item.message}</p>
      {canActOnDraft ? (
        <DraftActions actions={actions} item={item} key={`${item.draftId ?? item.id}:${item.message}`} />
      ) : null}
    </article>
  );
}

function DraftActions({ actions, item }: { actions: DraftActionHandlers; item: GuestMessageTimelineItem }) {
  const { translate } = useLanguage();
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
      setError(caught instanceof Error ? caught.message : translate("guestMessagesReviewActionFailed"));
    }
  };

  if (!canReview) {
    return (
      <div className="messages-draft-actions" aria-label={translate("guestMessagesDraftReviewActions")}>
        <button className="vc-secondary-action" type="button" disabled>
          {translate("readOnly")}
        </button>
      </div>
    );
  }
  const activeDraftId = draftId!;

  return (
    <div className="messages-draft-actions" aria-label={translate("guestMessagesDraftReviewActions")}>
      {editing ? (
        <div className="messages-draft-editor">
          <label>
            <span className="vc-sr-only">{translate("guestMessagesEditDraft")}</span>
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
              onClick={() => run(() => actions.onSave(activeDraftId, draftText), translate("guestMessagesDraftSaved"))}
            >
              {translate("saveDraft")}
            </button>
            <button
              className="vc-primary-action"
              type="button"
              disabled={actions.busy || !draftText.trim()}
              onClick={() => run(() => actions.onApproveEdited(activeDraftId, draftText), translate("guestMessagesEditedReplySent"))}
            >
              {translate("guestMessagesApproveAndSend")}
            </button>
            <button className="vc-secondary-action" type="button" disabled={actions.busy} onClick={() => setEditing(false)}>
              {translate("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            className="vc-primary-action"
            type="button"
            disabled={actions.busy}
            onClick={() => run(() => actions.onApprove(activeDraftId), translate("guestMessagesReplySent"))}
          >
            {item.status === "DELIVERY_FAILED" ? translate("guestMessagesRetrySend") : translate("guestMessagesApprove")}
          </button>
          <button className="vc-secondary-action" type="button" disabled={actions.busy} onClick={() => setEditing(true)}>
            {translate("edit")}
          </button>
          <button
            className="vc-secondary-action"
            type="button"
            disabled={actions.busy}
            onClick={() => run(() => actions.onReject(activeDraftId), translate("guestMessagesDraftRejected"))}
          >
            {translate("reject")}
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
  onClose,
  onRetry,
}: {
  actions: DraftActionHandlers;
  conversation: GuestMessageTimelineItem[];
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { translate } = useLanguage();
  const hasReadyDraft = conversation.some((item) => item.kind === "draft" && item.status === "READY");

  if (loading) {
    return (
      <VanaraGlassSheet className="messages-conversation" ariaLabel={translate("guestMessagesConversation")}>
        <div className="messages-conversation__header">
          <span>{translate("guestMessagesConversation")}</span>
          <strong>{translate("loading")}</strong>
        </div>
        <MessagesSkeleton rows={5} />
      </VanaraGlassSheet>
    );
  }

  if (conversation.length === 0) {
    return (
      <VanaraGlassSheet className="messages-conversation" ariaLabel={translate("guestMessagesConversation")}>
        <div className="messages-empty">
          <h2>{translate("guestMessagesNoConversationSelected")}</h2>
          <p>{translate("guestMessagesSelectFromInbox")}</p>
          <button className="vc-secondary-action" type="button" onClick={onRetry}>
            {translate("refresh")}
          </button>
        </div>
      </VanaraGlassSheet>
    );
  }

  return (
    <VanaraGlassSheet className="messages-conversation" ariaLabel={translate("guestMessagesConversationTimeline")} variant="elevated">
      <div className="messages-conversation__header">
        <span>{translate("guestMessagesConversation")}</span>
        <div className="messages-conversation__header-actions">
          <strong>{hasReadyDraft ? translate("guestMessagesDraftReady") : translate("readOnly")}</strong>
          <button className="vc-secondary-action" type="button" onClick={onClose}>
            {translate("guestMessagesCompact")}
          </button>
        </div>
      </div>
      <div className="messages-timeline">
        {conversation.map((item, index) => {
          const previous = conversation[index - 1];
          const showDay = index === 0 || formatDay(previous?.timestamp ?? null) !== formatDay(item.timestamp);
          return (
            <div className="messages-timeline__entry" key={item.id}>
              {showDay ? <time className="messages-day-separator">{formatDay(item.timestamp)}</time> : null}
              <TimelineBubble actions={actions} item={item} />
            </div>
          );
        })}
      </div>
    </VanaraGlassSheet>
  );
}

function ContextColumn({ context }: { context: GuestMessageBookingContext | null }) {
  const { translate } = useLanguage();
  const rows = context ? [
    [translate("guest"), context.guest],
    [translate("arrival"), context.arrival ?? "-"],
    [translate("departure"), context.departure ?? "-"],
    [translate("room"), context.room],
    [translate("guestMessagesTravelPhase"), context.travelPhase],
    [translate("provider"), context.provider],
    [translate("guestMessagesChannel"), context.channel],
    [translate("guestMessagesAccommodation"), context.accommodation],
    [translate("guestMessagesBookingStatus"), context.bookingStatus],
  ] : [];

  return (
    <VanaraGlassRegion className="messages-context" ariaLabelledBy="messages-context-title">
      <VanaraSectionHeader
        eyebrow={translate("readOnly")}
        headingId="messages-context-title"
        title={translate("guestMessagesBookingContext")}
      />
      {context ? (
        <details className="messages-context__details">
          <summary>{translate("bookingDetails")}</summary>
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
        <p className="messages-context__empty">{translate("guestMessagesContextEmpty")}</p>
      )}
    </VanaraGlassRegion>
  );
}

function ConversationSelectionEmpty() {
  const { translate } = useLanguage();
  return (
    <VanaraGlassRegion className="messages-selection-empty" ariaLabelledBy="messages-selection-empty-title">
      <div className="messages-empty">
        <span className="messages-empty__mark" aria-hidden="true" />
        <h2 id="messages-selection-empty-title">{translate("guestMessagesSelectConversation")}</h2>
        <p>{translate("guestMessagesChooseConversation")}</p>
      </div>
    </VanaraGlassRegion>
  );
}

export default function MessagesPage() {
  const { translate } = useLanguage();
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
    return "";
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
      <WorkspaceShell title={translate("messages")} workspace="messages" bodyClassName="messages-page" wide>
        <PageError onRetry={retry} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title={translate("messages")}
      stickyNavigationTitle={translate("messages")}
      workspace="messages"
      bodyClassName="messages-page"
      wide
    >
      <div className="workspace-body-actions">
        <span>{detailQuery.data ? groupLabel(detailQuery.data.conversation.group, translate) : translate("guestMessages")}</span>
        <button className="vc-secondary-action" type="button" onClick={retry}>
          {translate("refresh")}
        </button>
      </div>

      <div className="messages-layout">
        <InboxColumn
          activeConversationId={activeConversationId}
          conversationsByGroup={inboxQuery.data?.groups ?? { needsReply: [], waitingGuest: [], closed: [] }}
          loading={inboxQuery.isFetching}
          onSearch={setSearch}
          onSelect={(conversationId) => {
            setSelectedConversationId((current) => (current === conversationId ? "" : conversationId));
          }}
          search={search}
        />

        {activeConversationId ? (
          <>
            <ConversationColumn
              actions={draftActions}
              conversation={detailQuery.data?.timeline ?? []}
              loading={detailQuery.isLoading}
              onClose={() => setSelectedConversationId("")}
              onRetry={retry}
            />

            <ContextColumn context={detailQuery.data?.bookingContext ?? null} />
          </>
        ) : (
          <ConversationSelectionEmpty />
        )}
      </div>
    </WorkspaceShell>
  );
}
