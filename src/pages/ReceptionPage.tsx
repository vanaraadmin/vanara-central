import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { DayPicker } from "react-day-picker";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import addressBookIcon from "../assets/img/address-book-light.svg";
import emailIcon from "../assets/img/envelope-light.svg";
import depositIcon from "../assets/img/hand-coins-light.svg";
import passportIcon from "../assets/img/identification-card-light.svg";
import keysIcon from "../assets/img/key-light.svg";
import roomInspectedIcon from "../assets/img/magnifying-glass-light.svg";
import selectionBackground from "../assets/img/selection-background.svg";
import whatsappIcon from "../assets/img/whatsapp-logo-light.svg";
import { PageError } from "../components/AsyncState";
import { PassportWorkflow } from "../components/passport/PassportWorkflow";
import WorkspaceShell from "../components/WorkspaceShell";
import { CalendarIcon, RoomIcon, UserIcon } from "../components/OperationsIcons";
import { loadCurrentUser } from "../services/auth.service";
import { completeReceptionCheckIn, completeReceptionCheckOut, loadBookingPassports, loadReceptionOverview, saveReceptionNotes, updateReceptionCheckIn } from "../services/reception.service";
import type { BookingPassport, PassportData, ReceptionOverview, ReceptionStay } from "../types/reception";
import { formatNationalityText } from "../utils/country-nationality";
import "../styles/ReceptionPage.css";

type ReceptionCardType = "arrival" | "departure";
type CleaningStatus = "clean" | "in_progress" | "dirty";
type ContactFeedback = "email" | "phone" | null;
type CompletionDraft = {
  passportRegistrationCompleted: boolean;
  depositCollected: boolean;
  roomInspected: boolean;
  keysReturned: boolean;
  depositReturned: boolean;
};
type PassportReviewState = { mode: "existing"; passport: BookingPassport };

type PassportVerificationBadge = {
  label: string;
  tone: "ready" | "warning" | "muted";
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

function cleaningStatusFromRoomStatus(roomStatus: string): CleaningStatus {
  if (roomStatus === "Ready") return "clean";
  if (roomStatus === "Cleaning") return "in_progress";
  return "dirty";
}

function HousekeepingStatusRow({ roomStatus }: { roomStatus: string }) {
  const cleaningStatus = cleaningStatusFromRoomStatus(roomStatus);
  const housekeepingLabel =
    cleaningStatus === "clean"
      ? "ROOM READY"
      : cleaningStatus === "in_progress"
        ? "ROOM IN PROGRESS"
        : "ROOM NOT READY";

  return (
    <div
      aria-label={`Housekeeping status: ${housekeepingLabel}`}
      className={`checkin-card__housekeeping checkin-card__housekeeping--${cleaningStatus}`}
    >
      <img
        alt=""
        aria-hidden="true"
        className={`checkin-card__housekeeping-icon checkin-card__housekeeping-icon--${cleaningStatus}`}
        src={selectionBackground}
      />
      <span className="checkin-card__housekeeping-label">{housekeepingLabel}</span>
    </div>
  );
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
    <details className="reception-note-details" onClick={(event) => event.stopPropagation()}>
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
      onClick={(event) => {
        event.stopPropagation();
        onRequest(stay, type);
      }}
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
  onDetailsRequest,
  queryKey,
  stay,
  type,
}: {
  canComplete: boolean;
  isToday: boolean;
  onContactRequest: (stay: ReceptionStay) => void;
  onCompletionRequest: (stay: ReceptionStay, type: ReceptionCardType) => void;
  onDetailsRequest: (stay: ReceptionStay) => void;
  queryKey: readonly ["reception", string];
  stay: ReceptionStay;
  type: ReceptionCardType;
}) {
  const nationality = formatNationalityText(stay.nationality);

  return (
    <article className={`reception-card reception-card--${type}`} onClick={() => onDetailsRequest(stay)}>
      <div className="reception-card__top">
        <div className="reception-room-chip">
          <RoomIcon />
          <span>{stay.roomName}</span>
        </div>
        <button
          aria-label={`Contact ${stay.guestName}`}
          className="reception-contact-trigger"
          onClick={(event) => {
            event.stopPropagation();
            onContactRequest(stay);
          }}
          type="button"
        >
          <img alt="" src={addressBookIcon} />
        </button>
      </div>

      <div className="reception-guest">
        <UserIcon />
        <div>
          <h3>{stay.guestName}</h3>
          {nationality ? <p className="reception-nationality">{nationality}</p> : null}
          <p className="reception-booking-source">{bookingSourceLabel(stay)}</p>
          {type === "arrival" && <HousekeepingStatusRow roomStatus={stay.roomStatus} />}
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
  onDetailsRequest,
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
  onDetailsRequest: (stay: ReceptionStay) => void;
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
            onDetailsRequest={onDetailsRequest}
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
  const queryClient = useQueryClient();
  const isMobilePassportActions = useMobilePassportActions();
  const [passportReview, setPassportReview] = useState<PassportReviewState | null>(null);
  const [passportManagerOpen, setPassportManagerOpen] = useState(false);
  const [passportWorkflowOpen, setPassportWorkflowOpen] = useState(false);
  const passportsQueryKey = ["reception-passports", request?.stay.bookingId] as const;
  const passports = useQuery({
    enabled: Boolean(request && request.type === "arrival"),
    queryKey: passportsQueryKey,
    queryFn: ({ signal }) => {
      if (!request || request.type !== "arrival") return Promise.resolve([] satisfies BookingPassport[]);
      return loadBookingPassports(request.stay.bookingId, signal);
    },
  });
  const passportCount = passports.data?.length ?? 0;

  useEffect(() => {
    if (!request || request.type !== "arrival" || passports.isLoading) return;
    const completed = passportCount > 0;
    if (draft.passportRegistrationCompleted !== completed) {
      onDraftChange({
        ...draft,
        passportRegistrationCompleted: completed,
      });
    }
  }, [draft, onDraftChange, passportCount, passports.isLoading, request]);

  if (!request) return null;

  const isArrival = request.type === "arrival";
  const hasDeposit = request.stay.checkIn.depositCollected || draft.depositCollected;
  const canComplete = isArrival
    ? !passports.isLoading && !passportWorkflowOpen && !passportReview
    : (
      draft.roomInspected
      && draft.keysReturned
      && (!hasDeposit || draft.depositReturned)
    );

  const title = isArrival ? "Complete Check-In" : "Complete Check-Out";
  const eyebrow = isArrival ? "Arrival Checklist" : "Departure Checklist";

  function openPassportFlow() {
    if (passportCount > 0) {
      setPassportManagerOpen(true);
      return;
    }
    openNewPassportCapture();
  }

  function openNewPassportCapture() {
    setPassportManagerOpen(false);
    setPassportReview(null);
    setPassportWorkflowOpen(true);
  }

  function closePassportReview() {
    setPassportReview(null);
  }

  async function handlePassportSaved(saved: BookingPassport) {
    queryClient.setQueryData<BookingPassport[]>(passportsQueryKey, (current) => [...(current ?? []), saved]);
    await queryClient.invalidateQueries({ queryKey: passportsQueryKey });
    onDraftChange({ ...draft, passportRegistrationCompleted: true });
    setPassportWorkflowOpen(false);
    setPassportManagerOpen(true);
  }

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

        {passportReview ? (
          <PassportReviewPanel
            error={null}
            isPending={false}
            key={`existing-${passportReview.passport.id}`}
            onCancel={closePassportReview}
            state={passportReview}
          />
        ) : passportManagerOpen ? (
            <PassportManagementPanel
            isPending={passportWorkflowOpen}
            onAddAnother={openNewPassportCapture}
            onBack={() => setPassportManagerOpen(false)}
            onOpenPassport={(passport) => {
              setPassportReview({ mode: "existing", passport });
              setPassportManagerOpen(false);
            }}
            passports={passports.data ?? []}
          />
        ) : (
          <>
            <div className="reception-sheet__checks">
              {isArrival ? (
                <>
              <PassportStatusRow
                count={passportCount}
                disabled={passports.isLoading}
                isPending={passportWorkflowOpen}
                label="Passport registration completed"
                missingText="Capture passport image"
                onClick={openPassportFlow}
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
          </>
        )}
      </div>
      {isArrival && (
        <PassportWorkflow
          bookingId={request.stay.bookingId}
          guestName={request.stay.guestName}
          isMobile={isMobilePassportActions}
          onCancel={() => setPassportWorkflowOpen(false)}
          onSaved={(saved) => void handlePassportSaved(saved)}
          open={passportWorkflowOpen}
        />
      )}
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

function BookingFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type PassportReviewField = "firstName" | "middleName" | "lastName" | "passportNumber" | "nationality" | "gender" | "birthDate" | "expiryDate";

const PASSPORT_REVIEW_FIELDS: Array<{ key: PassportReviewField; label: string }> = [
  { key: "firstName", label: "First name" },
  { key: "middleName", label: "Middle name" },
  { key: "lastName", label: "Last name" },
  { key: "passportNumber", label: "Passport number" },
  { key: "nationality", label: "Nationality" },
  { key: "gender", label: "Gender" },
  { key: "birthDate", label: "Birth date" },
  { key: "expiryDate", label: "Expiry date" },
];
function passportDataFromRecord(passport: BookingPassport): PassportData {
  return {
    firstName: passport.firstName,
    middleName: passport.middleName,
    lastName: passport.lastName,
    passportNumber: passport.passportNumber,
    nationality: passport.nationality,
    gender: passport.gender,
    birthDate: passport.birthDate,
    expiryDate: passport.expiryDate,
  };
}

function passportVerificationSummary(passport: PassportData): { state: string; issues: string[] } | null {
  const verification = passport.verification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) return null;
  const consensus = verification.consensus as { fields?: { passportNumber?: { state?: string; issues?: string[]; conflicts?: unknown[] } }; unresolvedCriticalConflicts?: number };
  const passportNumber = consensus.fields?.passportNumber;
  return {
    state: passportNumber?.state ?? "NEEDS_CONFIRMATION",
    issues: [
      ...(passportNumber?.issues ?? []),
      ...((passportNumber?.conflicts?.length ?? 0) > 0 ? ["PASSPORT_NUMBER_CONFLICT"] : []),
      ...((consensus.unresolvedCriticalConflicts ?? 0) > 0 ? ["UNRESOLVED_CRITICAL_FIELDS"] : []),
    ],
  };
}

function formatPassportTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function passportDisplayName(passport: BookingPassport): string {
  const parts = [passport.firstName, passport.middleName, passport.lastName]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Passport holder";
}

function passportVerificationBadge(passport: BookingPassport): PassportVerificationBadge {
  const verification = passport.fieldVerification;
  if (!verification || typeof verification !== "object" || !("consensus" in verification)) {
    return { label: "Review unavailable", tone: "muted" };
  }
  const consensus = verification.consensus as { tm30Ready?: boolean; unresolvedCriticalConflicts?: number };
  if (consensus.tm30Ready) return { label: "Verified", tone: "ready" };
  if ((consensus.unresolvedCriticalConflicts ?? 0) > 0) return { label: "Needs review", tone: "warning" };
  return { label: "Reviewed", tone: "muted" };
}

function PassportManagementPanel({
  isPending,
  onAddAnother,
  onBack,
  onOpenPassport,
  passports,
}: {
  isPending: boolean;
  onAddAnother: () => void;
  onBack: () => void;
  onOpenPassport: (passport: BookingPassport) => void;
  passports: BookingPassport[];
}) {
  return (
    <section className="passport-management" aria-label="Saved passports">
      <header>
        <span>Passport Registration</span>
        <h3>Saved passports</h3>
      </header>

      <div className="passport-management__list">
        {passports.map((passport) => {
          const verification = passportVerificationBadge(passport);
          const nationality = formatNationalityText(passport.nationality);
          return (
            <article className="passport-management-card" key={passport.id}>
              <div>
                <strong>{passportDisplayName(passport)}</strong>
                <span>{passport.passportNumber ?? "Passport number missing"}</span>
              </div>
              <dl>
                <div>
                  <dt>Nationality</dt>
                  <dd>{nationality ?? "Not available"}</dd>
                </div>
                <div>
                  <dt>Verification</dt>
                  <dd className={`passport-management-card__status passport-management-card__status--${verification.tone}`}>
                    {verification.label}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatPassportTimestamp(passport.createdAt)}</dd>
                </div>
              </dl>
              <button onClick={() => onOpenPassport(passport)} type="button">
                Open review
              </button>
            </article>
          );
        })}
      </div>

      <div className="reception-sheet__actions">
        <button disabled={isPending} onClick={onBack} type="button">Back</button>
        <button disabled={isPending} onClick={onAddAnother} type="button">Add another passport</button>
      </div>
    </section>
  );
}

function PassportReviewPanel({
  error,
  isPending,
  onCancel,
  state,
}: {
  error: string | null;
  isPending: boolean;
  onCancel: () => void;
  state: PassportReviewState;
}) {
  const [draft] = useState<PassportData>(() => passportDataFromRecord(state.passport));
  const verification = passportVerificationSummary(draft);

  return (
    <section className="passport-review" aria-label="Passport detail">
      <header>
        <span>Saved Passport</span>
        <h3>Passport registration completed</h3>
      </header>

      <div className="passport-review__fields">
        {PASSPORT_REVIEW_FIELDS.map((field) => (
          <label key={field.key}>
            <span>{field.label}</span>
            <input
              readOnly
              value={draft[field.key] ?? ""}
            />
          </label>
        ))}
      </div>

      {verification && (
        <section className="passport-review__verification" aria-label="Passport verification">
          <strong>Passport number: {verification.state.replace(/_/g, " ")}</strong>
          {verification.issues.length > 0 && (
            <ul>
              {verification.issues.map((issue) => <li key={issue}>{issue.replace(/_/g, " ")}</li>)}
            </ul>
          )}
        </section>
      )}

      {error && <p className="reception-modal__error" role="alert">{error}</p>}

      <div className="reception-sheet__actions">
        <button disabled={isPending} onClick={onCancel} type="button">
          Back
        </button>
      </div>
    </section>
  );
}

function useMobilePassportActions(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function PassportStatusRow({
  count,
  disabled,
  label = "Passport Acquired",
  missingText = "Upload passport image",
  isPending,
  onClick,
}: {
  count: number;
  disabled: boolean;
  label?: string;
  missingText?: string;
  isPending: boolean;
  onClick: () => void;
}) {
  const completed = count > 0;

  return (
    <button
      className={`reception-check-row reception-detail-action${completed ? " is-checked" : ""}`}
      disabled={disabled || isPending}
      onClick={onClick}
      type="button"
    >
      <span className="reception-check-row__content">
        <span className="reception-check-row__icon">
          <SheetIcon src={passportIcon} />
        </span>
        <span className="reception-check-row__label">
          {label}
          <small>{completed ? `${count} saved` : missingText}</small>
        </span>
      </span>

      <span aria-hidden="true" className={`reception-check-row__control${completed ? "" : " reception-check-row__control--warning"}`}>
        {completed ? (
          <svg viewBox="0 0 24 24">
            <path d="m6.5 12.5 3.5 3.5 7.5-8" />
          </svg>
        ) : (
          "!"
        )}
      </span>
    </button>
  );
}

function BookingDetailsSheet({
  onCancel,
  onStayUpdated,
  queryKey,
  stay,
  today,
}: {
  onCancel: () => void;
  onStayUpdated: (stay: ReceptionStay) => void;
  queryKey: readonly ["reception", string];
  stay: ReceptionStay | null;
  today: string;
}) {
  useSheetScrollLock(Boolean(stay));
  const queryClient = useQueryClient();
  const isMobilePassportActions = useMobilePassportActions();
  const [passportReview, setPassportReview] = useState<PassportReviewState | null>(null);
  const [passportManagerOpen, setPassportManagerOpen] = useState(false);
  const [passportWorkflowOpen, setPassportWorkflowOpen] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const passportsQueryKey = ["reception-passports", stay?.bookingId] as const;
  const passports = useQuery({
    enabled: Boolean(stay),
    queryKey: passportsQueryKey,
    queryFn: ({ signal }) => {
      if (!stay) return Promise.resolve([] satisfies BookingPassport[]);
      return loadBookingPassports(stay.bookingId, signal);
    },
  });
  const deposit = useMutation({
    mutationFn: async () => {
      if (!stay) throw new Error("Booking is unavailable.");
      return updateReceptionCheckIn(stay.bookingId, "depositCollected", !stay.checkIn.depositCollected);
    },
    onSuccess: (updated) => {
      setDepositError(null);
      onStayUpdated(updated);
      queryClient.setQueryData<ReceptionOverview>(queryKey, (current) => (current ? upsertStay(current, updated) : current));
    },
    onError: () => {
      setDepositError("Deposit status could not be saved.");
    },
  });
  if (!stay) return null;

  const showCheckInChecklist = stay.arrival === today;
  const passportCount = passports.data?.length ?? 0;

  function openPassportFlow() {
    if (passportCount > 0) {
      setPassportManagerOpen(true);
      return;
    }
    openNewPassportCapture();
  }

  function openNewPassportCapture() {
    setPassportManagerOpen(false);
    setPassportReview(null);
    setPassportWorkflowOpen(true);
  }

  function closePassportReview() {
    setPassportReview(null);
  }

  async function handlePassportSaved(saved: BookingPassport) {
    queryClient.setQueryData<BookingPassport[]>(passportsQueryKey, (current) => [...(current ?? []), saved]);
    await queryClient.invalidateQueries({ queryKey: passportsQueryKey });
    setPassportWorkflowOpen(false);
    setPassportManagerOpen(true);
  }

  return (
    <div
      aria-labelledby="reception-booking-details-title"
      aria-modal="true"
      className="reception-sheet reception-details-sheet"
      role="dialog"
    >
      <button
        aria-label="Close booking details"
        className="reception-sheet__scrim"
        onClick={onCancel}
        type="button"
      />

      <div className="reception-sheet__panel reception-details-sheet__panel">
        <div className="reception-sheet__handle" />

        <header className="reception-sheet__header">
          <span>Booking Details</span>
          <h2 id="reception-booking-details-title">{stay.guestName}</h2>
          <p>
            <strong>{stay.roomName}</strong>
            <span aria-hidden="true"> · </span>
            {bookingSourceLabel(stay)}
          </p>
        </header>

        <dl className="reception-stay-facts reception-details-facts" aria-label="Booking information">
          <BookingFact label="Check-in" value={formatFullDate(stay.arrival)} />
          <BookingFact label="Check-out" value={formatFullDate(stay.departure)} />
          <BookingFact label="Stay" value={stayDuration(stay.arrival, stay.departure)} />
          <BookingFact label="Guests" value={`${stay.adults} adults · ${stay.children} children`} />
          <BookingFact label="Reference" value={stay.bookingReference ?? "Not available"} />
          <BookingFact label="Status" value={stay.bookingStatus} />
        </dl>

        {showCheckInChecklist && (
          <section className="reception-details-checklist" aria-label="Check-in checklist">
            <span>Check-in Checklist</span>
            {passportReview ? (
              <PassportReviewPanel
                error={null}
                isPending={false}
                key={`existing-${passportReview.passport.id}`}
                onCancel={closePassportReview}
                state={passportReview}
              />
            ) : passportManagerOpen ? (
              <PassportManagementPanel
                isPending={passportWorkflowOpen}
                onAddAnother={openNewPassportCapture}
                onBack={() => setPassportManagerOpen(false)}
                onOpenPassport={(passport) => {
                  setPassportReview({ mode: "existing", passport });
                  setPassportManagerOpen(false);
                }}
                passports={passports.data ?? []}
              />
            ) : (
              <>
                <div className="reception-sheet__checks">
                  <ChecklistRow
                    checked={stay.checkIn.depositCollected}
                    icon={depositIcon}
                    label="Deposit Collected"
                    onChange={() => deposit.mutate()}
                  />
                  <PassportStatusRow
                    count={passportCount}
                    disabled={passports.isLoading}
                    isPending={passportWorkflowOpen}
                    onClick={openPassportFlow}
                  />
                </div>
                {depositError && <p className="reception-modal__error" role="alert">{depositError}</p>}
              </>
            )}
          </section>
        )}

        <InternalNotesField queryKey={queryKey} stay={stay} />

        <div className="reception-sheet__actions reception-sheet__actions--single">
          <button onClick={onCancel} type="button">
            Close
          </button>
        </div>
      </div>
      {showCheckInChecklist && (
        <PassportWorkflow
          bookingId={stay.bookingId}
          guestName={stay.guestName}
          isMobile={isMobilePassportActions}
          onCancel={() => setPassportWorkflowOpen(false)}
          onSaved={(saved) => void handlePassportSaved(saved)}
          open={passportWorkflowOpen}
        />
      )}
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
  const [detailsRequest, setDetailsRequest] = useState<ReceptionStay | null>(null);
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
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-ins." isToday={isToday} items={reception.data?.arrivals ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={arrivalTitle} type="arrival" onContactRequest={(stay) => { setContactFeedback(null); setContactRequest(stay); }} onDetailsRequest={setDetailsRequest} />
        <ReceptionSection canComplete={canComplete} empty="No scheduled check-outs." isToday={isToday} items={reception.data?.departures ?? []} onCompletionRequest={(stay, type) => { setCompletionError(null); setCompletionDraft(emptyCompletionDraft()); setCompletionRequest({ stay, type }); }} queryKey={queryKey} showSkeleton={showCardSkeletons} title={departureTitle} type="departure" onContactRequest={(stay) => { setContactFeedback(null); setContactRequest(stay); }} onDetailsRequest={setDetailsRequest} />
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
      <BookingDetailsSheet
        onCancel={() => setDetailsRequest(null)}
        onStayUpdated={setDetailsRequest}
        queryKey={queryKey}
        stay={detailsRequest}
        today={today}
      />
    </WorkspaceShell>
  );
}
