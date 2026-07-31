import { useState, type FormEvent } from "react";
import { DayPicker } from "react-day-picker";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageError } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { CalendarIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { loadCurrentUser } from "../services/auth.service";
import { completeReceptionCheckIn, completeReceptionCheckOut, loadReceptionOverview, saveReceptionNotes } from "../services/reception.service";
import type { ReceptionOverview, ReceptionStay } from "../types/reception";
import "../styles/ReceptionPage.css";

type ReceptionCardType = "arrival" | "departure";
type CompletionDraft = {
  passportPhotographed: boolean;
  depositCollected: boolean;
  roomInspected: boolean;
  keysReturned: boolean;
  depositReturned: boolean;
};

function emptyCompletionDraft(): CompletionDraft {
  return {
    passportPhotographed: false,
    depositCollected: false,
    roomInspected: false,
    keysReturned: false,
    depositReturned: false,
  };
}

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function formatFullDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+07:00`));
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function stayDuration(arrival: string, departure: string): string {
  const start = parseDateOnly(arrival).getTime();
  const end = parseDateOnly(departure).getTime();
  const nights = Math.max(0, Math.round((end - start) / 86_400_000));
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

function hasCompletionPermission(user: Awaited<ReturnType<typeof loadCurrentUser>> | undefined): boolean {
  return Boolean(user?.actionPermissions?.some((permission) => permission.action === "can_complete_checkin_checkout" && permission.allowed));
}

function bookingSourceLabel(stay: ReceptionStay): string {
  const raw = stay.bookingSource || stay.bookingReference || "";
  const value = raw.toLowerCase();
  if (value.includes("booking")) return "Booking.com";
  if (value.includes("airbnb")) return "Airbnb";
  if (value.includes("agoda")) return "Agoda";
  if (value.includes("traveloka")) return "Traveloka";
  if (value.includes("trip")) return "Trip.com";
  if (value.includes("direct")) return "Direct";
  return stay.bookingSource || "Direct";
}

function upsertStay(data: ReceptionOverview, updated: ReceptionStay): ReceptionOverview {
  const replace = (items: ReceptionStay[]) => items.map((item) => (item.bookingId === updated.bookingId ? updated : item));
  return {
    ...data,
    arrivals: replace(data.arrivals),
    departures: replace(data.departures),
  };
}

function InternalNotesField({ queryKey, stay }: { queryKey: readonly ["reception", string]; stay: ReceptionStay }) {
  const queryClient = useQueryClient();
  const [specialNotes, setSpecialNotes] = useState(stay.specialNotes ?? "");
  const mutation = useMutation({
    mutationFn: () => saveReceptionNotes(stay.bookingId, { specialNotes: specialNotes.trim() || null }),
    onSuccess: (updated) => {
      setSpecialNotes(updated.specialNotes ?? "");
      queryClient.setQueryData<ReceptionOverview>(queryKey, (current) => (current ? upsertStay(current, updated) : current));
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <details className="reception-note-details">
      <summary>Internal Notes</summary>
      <form className="reception-note-form" onSubmit={submit}>
        <label>
          <textarea
            maxLength={2000}
            onChange={(event) => setSpecialNotes(event.target.value)}
            placeholder="Add internal operational notes"
            rows={2}
            value={specialNotes}
          />
        </label>
        <div className="reception-note-form__actions">
          <button disabled={mutation.isPending} type="submit">{mutation.isPending ? "Saving…" : "Save"}</button>
          {mutation.isSuccess && <span>Saved</span>}
          {mutation.isError && <span className="is-error">Note could not be saved.</span>}
        </div>
      </form>
    </details>
  );
}

function CompletionAction({
  canComplete,
  isToday,
  onRequest,
  stay,
  type,
}: {
  canComplete: boolean;
  isToday: boolean;
  onRequest: (stay: ReceptionStay, type: ReceptionCardType) => void;
  stay: ReceptionStay;
  type: ReceptionCardType;
}) {
  const completed = type === "arrival" ? stay.checkIn.guestArrived : stay.checkOut.guestLeft || stay.checkOut.roomReleased;
  const label = type === "arrival" ? "Check-In Completed" : "Check-Out Completed";

  if (completed) {
    return <div className="reception-completion reception-completion--locked">✓ {label}</div>;
  }

  if (!isToday || !canComplete) return null;

  return (
    <button className="reception-completion" onClick={() => onRequest(stay, type)} type="button">
      ☐ {label}
    </button>
  );
}

function StayCard({
  canComplete,
  isToday,
  onCompletionRequest,
  queryKey,
  stay,
  type,
}: {
  canComplete: boolean;
  isToday: boolean;
  onCompletionRequest: (stay: ReceptionStay, type: ReceptionCardType) => void;
  queryKey: readonly ["reception", string];
  stay: ReceptionStay;
  type: ReceptionCardType;
}) {
  return (
    <article className={`reception-card reception-card--${type}`}>
      <div className="reception-card__top">
        <div className="reception-room-chip">
          <RoomIcon />
          <span>{stay.roomName}</span>
        </div>
      </div>

      <div className="reception-guest">
        <UserIcon />
        <div>
          <h3>
            {stay.guestName}
            {stay.nationalityFlagUrl && <img alt={stay.nationality ? `${stay.nationality} flag` : "Guest nationality"} className="reception-nationality-flag" src={stay.nationalityFlagUrl} />}
          </h3>
          <p className="reception-booking-source">{bookingSourceLabel(stay)}</p>
        </div>
      </div>

      {type === "arrival" && (
        <dl className="reception-stay-facts" aria-label="Stay information">
          <div>
            <dt>Check-out</dt>
            <dd>{formatFullDate(stay.departure)}</dd>
          </div>
          <div>
            <dt>Stay</dt>
            <dd>{stayDuration(stay.arrival, stay.departure)}</dd>
          </div>
        </dl>
      )}

      <CompletionAction canComplete={canComplete} isToday={isToday} onRequest={onCompletionRequest} stay={stay} type={type} />
      <InternalNotesField queryKey={queryKey} stay={stay} />
    </article>
  );
}

function ReceptionDatePicker({
  onChange,
  selectedDate,
  today,
}: {
  onChange: (date: string) => void;
  selectedDate: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(selectedDate);
  const todayDate = parseDateOnly(today);

  return (
    <div className="reception-date-picker">
      <button
        aria-expanded={open}
        className="reception-date-picker__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>Change Date</span>
        <strong>{formatDate(selectedDate)}</strong>
      </button>
      {open && (
        <div className="reception-date-picker__panel">
          <DayPicker
            captionLayout="dropdown"
            disabled={{ before: todayDate }}
            endMonth={addYears(todayDate, 2)}
            mode="single"
            onSelect={(date) => {
              if (!date) return;
              const next = formatDateOnly(date);
              if (next >= today) {
                onChange(next);
                setOpen(false);
              }
            }}
            selected={selected}
            startMonth={todayDate}
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}

function ReceptionSkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <article aria-hidden="true" className="reception-card reception-card--skeleton" key={index}>
          <div className="reception-skeleton reception-skeleton--room" />
          <div className="reception-skeleton reception-skeleton--guest" />
          <div className="reception-skeleton reception-skeleton--action" />
        </article>
      ))}
    </>
  );
}

function ReceptionSection({
  canComplete,
  empty,
  isToday,
  items,
  onCompletionRequest,
  queryKey,
  showSkeleton,
  title,
  type,
}: {
  canComplete: boolean;
  empty: string;
  isToday: boolean;
  items: ReceptionStay[];
  onCompletionRequest: (stay: ReceptionStay, type: ReceptionCardType) => void;
  queryKey: readonly ["reception", string];
  showSkeleton: boolean;
  title: string;
  type: ReceptionCardType;
}) {
  return (
    <section className={`reception-section reception-section--${type}`}>
      <header>
        <div>
          <CalendarIcon />
          <h2>{title}</h2>
        </div>
      </header>
      <div className="reception-list">
        {showSkeleton && items.length === 0 && <ReceptionSkeletonCards />}
        {!showSkeleton && items.length === 0 && <div className="reception-empty">{empty}</div>}
        {items.map((stay) => (
          <StayCard
            canComplete={canComplete}
            isToday={isToday}
            key={`${type}-${stay.bookingId}`}
            onCompletionRequest={onCompletionRequest}
            queryKey={queryKey}
            stay={stay}
            type={type}
          />
        ))}
      </div>
    </section>
  );
}

function CompletionModal({
  draft,
  error,
  isPending,
  onCancel,
  onConfirm,
  onDraftChange,
  request,
}: {
  draft: CompletionDraft;
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDraftChange: (draft: CompletionDraft) => void;
  request: { stay: ReceptionStay; type: ReceptionCardType } | null;
}) {
  if (!request) return null;
  const isArrival = request.type === "arrival";
  const hasDeposit = request.stay.checkIn.depositCollected || draft.depositCollected;
  const canComplete = isArrival || (draft.roomInspected && draft.keysReturned && (!hasDeposit || draft.depositReturned));
  const title = isArrival ? "Complete Check-in" : "Complete Check-out";

  return (
    <div aria-modal="true" className="reception-sheet" role="dialog">
      <button aria-label="Cancel" className="reception-sheet__scrim" disabled={isPending} onClick={onCancel} type="button" />
      <div className="reception-sheet__panel">
        <div className="reception-sheet__handle" />
        <header>
          <span>{request.stay.roomName}</span>
          <h2>{title}</h2>
          <p>{request.stay.guestName}</p>
        </header>
        <div className="reception-sheet__checks">
          {isArrival ? (
            <>
              <label>
                <span>Passport photographed</span>
                <input checked={draft.passportPhotographed} onChange={(event) => onDraftChange({ ...draft, passportPhotographed: event.target.checked })} type="checkbox" />
              </label>
              <label>
                <span>Deposit collected</span>
                <input checked={draft.depositCollected} onChange={(event) => onDraftChange({ ...draft, depositCollected: event.target.checked, depositReturned: event.target.checked ? draft.depositReturned : false })} type="checkbox" />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Room inspected</span>
                <input checked={draft.roomInspected} onChange={(event) => onDraftChange({ ...draft, roomInspected: event.target.checked })} type="checkbox" />
              </label>
              <label>
                <span>Keys returned</span>
                <input checked={draft.keysReturned} onChange={(event) => onDraftChange({ ...draft, keysReturned: event.target.checked })} type="checkbox" />
              </label>
              <div className="reception-sheet__deposit">
                <span>Deposit</span>
                {hasDeposit ? (
                  <label>
                    <span>Deposit returned</span>
                    <input checked={draft.depositReturned} onChange={(event) => onDraftChange({ ...draft, depositReturned: event.target.checked })} type="checkbox" />
                  </label>
                ) : (
                  <p>Deposit not collected<br />No refund required</p>
                )}
              </div>
            </>
          )}
        </div>
        {error && <p className="reception-modal__error">{error}</p>}
        <div className="reception-sheet__actions">
          <button disabled={isPending} onClick={onCancel} type="button">Cancel</button>
          <button disabled={isPending || !canComplete} onClick={onConfirm} type="button">{isPending ? "Saving..." : title}</button>
        </div>
      </div>
    </div>
  );
}

export default function ReceptionPage() {
  const today = bangkokToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const [completionRequest, setCompletionRequest] = useState<{ stay: ReceptionStay; type: ReceptionCardType } | null>(null);
  const [completionDraft, setCompletionDraft] = useState<CompletionDraft>(emptyCompletionDraft);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const queryKey = ["reception", selectedDate] as const;
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => loadCurrentUser(signal) });
  const reception = useQuery({
    queryKey,
    queryFn: ({ signal }) => loadReceptionOverview(selectedDate, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const queryClient = useQueryClient();
  const completion = useMutation({
    mutationFn: async ({ stay, type }: { stay: ReceptionStay; type: ReceptionCardType }) => (
      type === "arrival"
        ? completeReceptionCheckIn(stay.bookingId, {
          passportPhotographed: completionDraft.passportPhotographed,
          depositCollected: completionDraft.depositCollected,
        })
        : completeReceptionCheckOut(stay.bookingId, {
          roomInspected: completionDraft.roomInspected,
          keysReturned: completionDraft.keysReturned,
          depositReturned: stay.checkIn.depositCollected || completionDraft.depositCollected ? completionDraft.depositReturned : undefined,
        })
    ),
    onSuccess: (updated) => {
      queryClient.setQueryData<ReceptionOverview>(queryKey, (current) => (current ? upsertStay(current, updated) : current));
      setCompletionRequest(null);
      setCompletionDraft(emptyCompletionDraft());
      setCompletionError(null);
    },
    onError: (error) => {
      setCompletionError(error instanceof Error ? error.message : "Completion could not be saved.");
    },
  });
  const canComplete = hasCompletionPermission(currentUser.data);
  const isToday = selectedDate === today;
  const summary = reception.data?.summary ?? { arrivals: 0, departures: 0, inHouse: 0 };
  const arrivalTitle = isToday ? "Today's Check-Ins" : "Check-Ins";
  const departureTitle = isToday ? "Today's Check-Outs" : "Check-Outs";
  const showCardSkeletons = reception.isFetching && !reception.data;

  return (
    <WorkspaceShell title="Check-In / Out" workspace="reception" bodyClassName="reception-page">
      <div className="workspace-body-actions reception-date-actions">
        <span>{reception.data ? formatDate(reception.data.date) : formatDate(selectedDate)}</span>
        <button className="reception-today-chip" disabled={selectedDate === today} onClick={() => setSelectedDate(today)} type="button">Today</button>
        <ReceptionDatePicker onChange={setSelectedDate} selectedDate={selectedDate} today={today} />
      </div>

      <section className="reception-summary" aria-label="Reception Summary">
        <div><span>{arrivalTitle}</span><strong>{summary.arrivals}</strong></div>
        <div><span>{departureTitle}</span><strong>{summary.departures}</strong></div>
      </section>

      {reception.isError && !reception.data && <PageError onRetry={() => void reception.refetch()} />}

      <div className="reception-agenda" aria-busy={reception.isFetching}>
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-ins." isToday={isToday} items={reception.data?.arrivals ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={arrivalTitle} type="arrival" />
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-outs." isToday={isToday} items={reception.data?.departures ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={departureTitle} type="departure" />
      </div>

      <CompletionModal
        draft={completionDraft}
        error={completionError}
        isPending={completion.isPending}
        onCancel={() => {
          if (!completion.isPending) {
            setCompletionRequest(null);
            setCompletionDraft(emptyCompletionDraft());
          }
        }}
        onConfirm={() => {
          if (completionRequest) completion.mutate(completionRequest);
        }}
        onDraftChange={setCompletionDraft}
        request={completionRequest}
      />
    </WorkspaceShell>
  );
}
