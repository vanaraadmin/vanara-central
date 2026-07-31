import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { DayPicker } from "react-day-picker";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import addressBookIcon from "../assets/img/address-book-light.svg";
import emailIcon from "../assets/img/envelope-light.svg";
import depositIcon from "../assets/img/hand-coins-light.svg";
import passportIcon from "../assets/img/identification-card-light.svg";
import keysIcon from "../assets/img/key-light.svg";
import roomInspectedIcon from "../assets/img/magnifying-glass-light.svg";
import whatsappIcon from "../assets/img/whatsapp-logo-light.svg";
import { PageError } from "../components/AsyncState";
import WorkspaceShell from "../components/WorkspaceShell";
import { CalendarIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { loadCurrentUser } from "../services/auth.service";
import { completeReceptionCheckIn, completeReceptionCheckOut, loadReceptionOverview, saveReceptionNotes } from "../services/reception.service";
import type { ReceptionOverview, ReceptionStay } from "../types/reception";
import "../styles/ReceptionPage.css";

type ReceptionCardType = "arrival" | "departure";
type ContactFeedback = "email" | "phone" | null;
type CompletionDraft = {
  passportRegistrationCompleted: boolean;
  depositCollected: boolean;
  roomInspected: boolean;
  keysReturned: boolean;
  depositReturned: boolean;
};

function emptyCompletionDraft(): CompletionDraft {
  return {
    passportRegistrationCompleted: false,
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

function normalizeWhatsappPhone(phone: string | null): string | null {
  const raw = phone?.trim() ?? "";
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Beds24 may contain Thai local numbers such as 0812345678.
  // WhatsApp requires the international format without "+" or spaces.
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    digits = `66${digits.slice(1)}`;
  }

  return digits.length >= 7 ? digits : null;
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

function SheetIcon({ alt = "", src }: { alt?: string; src: string }) {
  return <img alt={alt} className="reception-sheet-icon" src={src} />;
}

function useSheetScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}

function ChecklistRow({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon: string;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`reception-check-row${checked ? " is-checked" : ""}`}>
      <input
        checked={checked}
        className="reception-check-row__input"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />

      <span className="reception-check-row__content">
        <span className="reception-check-row__icon">
          <SheetIcon src={icon} />
        </span>
        <span className="reception-check-row__label">{label}</span>
      </span>

      <span aria-hidden="true" className="reception-check-row__control">
        <svg viewBox="0 0 24 24">
          <path d="m6.5 12.5 3.5 3.5 7.5-8" />
        </svg>
      </span>
    </label>
  );
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
  const completed = type === "arrival"
    ? stay.checkIn.guestArrived
    : stay.checkOut.guestLeft || stay.checkOut.roomReleased;

  const completedLabel = type === "arrival"
    ? "Check-In Completed"
    : "Check-Out Completed";

  const actionLabel = type === "arrival"
    ? "Complete Check-In"
    : "Complete Check-Out";

  if (completed) {
    return (
      <div className="reception-completion reception-completion--locked">
        <span aria-hidden="true" className="reception-completion__status">✓</span>
        <span>{completedLabel}</span>
      </div>
    );
  }

  if (!isToday || !canComplete) return null;

  return (
    <button
      className="reception-completion"
      onClick={() => onRequest(stay, type)}
      type="button"
    >
      <span aria-hidden="true" className="reception-completion__status reception-completion__status--open" />
      <span>{actionLabel}</span>
    </button>
  );
}

function StayCard({
  canComplete,
  isToday,
  onContactRequest,
  onCompletionRequest,
  queryKey,
  stay,
  type,
}: {
  canComplete: boolean;
  isToday: boolean;
  onContactRequest: (stay: ReceptionStay) => void;
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
        <button aria-label={`Contact ${stay.guestName}`} className="reception-contact-trigger" onClick={() => onContactRequest(stay)} type="button">
          <img alt="" src={addressBookIcon} />
        </button>
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
  onContactRequest,
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
  onContactRequest: (stay: ReceptionStay) => void;
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
            onContactRequest={onContactRequest}
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
  useSheetScrollLock(Boolean(request));

  if (!request) return null;

  const isArrival = request.type === "arrival";
  const hasDeposit = request.stay.checkIn.depositCollected || draft.depositCollected;
  const canComplete = isArrival
    || (
      draft.roomInspected
      && draft.keysReturned
      && (!hasDeposit || draft.depositReturned)
    );

  const title = isArrival ? "Complete Check-In" : "Complete Check-Out";
  const eyebrow = isArrival ? "Arrival Checklist" : "Departure Checklist";

  return (
    <div
      aria-labelledby="reception-completion-title"
      aria-modal="true"
      className="reception-sheet"
      role="dialog"
    >
      <button
        aria-label="Close checklist"
        className="reception-sheet__scrim"
        disabled={isPending}
        onClick={onCancel}
        type="button"
      />

      <div className="reception-sheet__panel">
        <div className="reception-sheet__handle" />

        <header className="reception-sheet__header">
          <span>{eyebrow}</span>
          <h2 id="reception-completion-title">{title}</h2>
          <p>
            <strong>{request.stay.guestName}</strong>
            <span aria-hidden="true"> · </span>
            {request.stay.roomName}
          </p>
        </header>

        <div className="reception-sheet__checks">
          {isArrival ? (
            <>
              <ChecklistRow
                checked={draft.passportRegistrationCompleted}
                icon={passportIcon}
                label="Passport registration completed"
                onChange={(checked) => onDraftChange({
                  ...draft,
                  passportRegistrationCompleted: checked,
                })}
              />

              <ChecklistRow
                checked={draft.depositCollected}
                icon={depositIcon}
                label="Deposit collected"
                onChange={(checked) => onDraftChange({
                  ...draft,
                  depositCollected: checked,
                  depositReturned: checked ? draft.depositReturned : false,
                })}
              />
            </>
          ) : (
            <>
              <ChecklistRow
                checked={draft.roomInspected}
                icon={roomInspectedIcon}
                label="Room inspected"
                onChange={(checked) => onDraftChange({
                  ...draft,
                  roomInspected: checked,
                })}
              />

              <ChecklistRow
                checked={draft.keysReturned}
                icon={keysIcon}
                label="Keys returned"
                onChange={(checked) => onDraftChange({
                  ...draft,
                  keysReturned: checked,
                })}
              />

              <section className="reception-sheet__deposit" aria-label="Deposit status">
                <span>Deposit</span>

                {hasDeposit ? (
                  <ChecklistRow
                    checked={draft.depositReturned}
                    icon={depositIcon}
                    label="Deposit returned"
                    onChange={(checked) => onDraftChange({
                      ...draft,
                      depositReturned: checked,
                    })}
                  />
                ) : (
                  <div className="reception-sheet__deposit-empty">
                    <span aria-hidden="true" className="reception-sheet__deposit-empty-icon">✓</span>
                    <p>
                      <strong>No deposit collected</strong>
                      <span>No refund is required for this booking.</span>
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {error && (
          <p className="reception-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="reception-sheet__actions">
          <button disabled={isPending} onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={isPending || !canComplete} onClick={onConfirm} type="button">
            {isPending ? "Saving..." : title}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactSheet({
  feedback,
  onCancel,
  onFeedback,
  stay,
}: {
  feedback: ContactFeedback;
  onCancel: () => void;
  onFeedback: (feedback: ContactFeedback) => void;
  stay: ReceptionStay | null;
}) {
  useSheetScrollLock(Boolean(stay));

  if (!stay) return null;

  const whatsappPhone = normalizeWhatsappPhone(stay.phone);
  const email = stay.email?.trim() || null;

  function openWhatsapp() {
    if (!whatsappPhone) {
      onFeedback("phone");
      return;
    }

    onFeedback(null);
    window.open(
      `https://wa.me/${whatsappPhone}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openEmail() {
    if (!email) {
      onFeedback("email");
      return;
    }

    onFeedback(null);
    window.location.href = `mailto:${email}`;
  }

  return (
    <div
      aria-labelledby="reception-contact-title"
      aria-modal="true"
      className="reception-sheet reception-contact-sheet"
      role="dialog"
    >
      <button
        aria-label="Close contact options"
        className="reception-sheet__scrim"
        onClick={onCancel}
        type="button"
      />

      <div className="reception-sheet__panel reception-contact-sheet__panel">
        <div className="reception-sheet__handle" />

        <header className="reception-contact-header">
          <span className="reception-contact-header__icon" aria-hidden="true">
            <img alt="" src={addressBookIcon} />
          </span>

          <div>
            <span>Guest Contact</span>
            <h2 id="reception-contact-title">Contact Guest</h2>
            <p>
              <strong>{stay.guestName}</strong>
              <span aria-hidden="true"> · </span>
              {stay.roomName}
            </p>
          </div>
        </header>

        <div className="reception-contact-actions">
          <button
            className="reception-contact-action reception-contact-action--primary"
            onClick={openWhatsapp}
            type="button"
          >
            <span className="reception-contact-action__icon">
              <SheetIcon src={whatsappIcon} />
            </span>

            <span className="reception-contact-action__copy">
              <strong>WhatsApp</strong>
              <small>{whatsappPhone ? "Open guest conversation" : "Phone number unavailable"}</small>
            </span>

            <span aria-hidden="true" className="reception-contact-action__arrow">›</span>
          </button>

          <button
            className="reception-contact-action"
            onClick={openEmail}
            type="button"
          >
            <span className="reception-contact-action__icon">
              <SheetIcon src={emailIcon} />
            </span>

            <span className="reception-contact-action__copy">
              <strong>Email</strong>
              <small>{email ? email : "Email address unavailable"}</small>
            </span>

            <span aria-hidden="true" className="reception-contact-action__arrow">›</span>
          </button>
        </div>

        {feedback === "phone" && (
          <p className="reception-contact-feedback" role="status">
            Phone number not available
          </p>
        )}

        {feedback === "email" && (
          <p className="reception-contact-feedback" role="status">
            Email not available
          </p>
        )}

        <div className="reception-sheet__actions reception-sheet__actions--single">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
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
  const [contactRequest, setContactRequest] = useState<ReceptionStay | null>(null);
  const [contactFeedback, setContactFeedback] = useState<ContactFeedback>(null);
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
          passportRegistrationCompleted: completionDraft.passportRegistrationCompleted,
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
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-ins." isToday={isToday} items={reception.data?.arrivals ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={arrivalTitle} type="arrival" onContactRequest={(stay) => { setContactFeedback(null); setContactRequest(stay); }} />
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-outs." isToday={isToday} items={reception.data?.departures ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={departureTitle} type="departure" onContactRequest={(stay) => { setContactFeedback(null); setContactRequest(stay); }} />
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
      <ContactSheet
        feedback={contactFeedback}
        onCancel={() => {
          setContactRequest(null);
          setContactFeedback(null);
        }}
        onFeedback={setContactFeedback}
        stay={contactRequest}
      />
    </WorkspaceShell>
  );
}
