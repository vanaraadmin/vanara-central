import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receptionPage = await readFile(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8");
const receptionCss = await readFile(new URL("../../src/styles/ReceptionPage.css", import.meta.url), "utf8");
const guestContactTrigger = await readFile(new URL("../../src/components/vanara/VanaraGuestContactTrigger.tsx", import.meta.url), "utf8");
const guestContactSheet = await readFile(new URL("../../src/components/vanara/VanaraGuestContactSheet.tsx", import.meta.url), "utf8");
const guestContactCss = await readFile(new URL("../../src/styles/VanaraGuestContact.css", import.meta.url), "utf8");
const operationalStatusPill = await readFile(new URL("../../src/components/rooms/OperationalStatusPill.tsx", import.meta.url), "utf8");
const operationalStatusPillCss = await readFile(new URL("../../src/styles/OperationalStatusPill.css", import.meta.url), "utf8");
const passportWorkflow = await readFile(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const passportMessages = await readFile(new URL("../../src/components/passport/passport-messages.ts", import.meta.url), "utf8");
const passportWorkflowState = await readFile(new URL("../../src/utils/passport-workflow-state.ts", import.meta.url), "utf8");
const receptionService = await readFile(new URL("../../src/services/reception.service.ts", import.meta.url), "utf8");
const serverReceptionService = await readFile(new URL("../src/services/reception.service.ts", import.meta.url), "utf8");
const passportCrop = await readFile(new URL("../../src/utils/passport-crop.ts", import.meta.url), "utf8");
const passportReview = await readFile(new URL("../../src/utils/passport-review.ts", import.meta.url), "utf8");
const countryNationality = await readFile(new URL("../../src/utils/country-nationality.ts", import.meta.url), "utf8");
const englishCopy = await readFile(new URL("../../src/i18n/en.ts", import.meta.url), "utf8");
const thaiCopy = await readFile(new URL("../../src/i18n/th.ts", import.meta.url), "utf8");
const bookingPassportsMigration = await readFile(new URL("../migrations/0013_booking_passports.sql", import.meta.url), "utf8");
const passportOcrAttemptsMigration = await readFile(new URL("../migrations/0049_passport_ocr_attempts.sql", import.meta.url), "utf8");

test("booking details sheet renders as a fullscreen glass sheet", () => {
  assert.match(receptionPage, /function BookingDetailsSheet/);
  assert.match(receptionPage, /useSheetScrollLock\(Boolean\(stay\)\)/);
  assert.match(receptionPage, /className="reception-sheet reception-details-sheet"/);
  assert.match(receptionPage, /className="reception-sheet__scrim"/);
  assert.match(receptionPage, /reception-details-sheet__panel/);
  const bookingDetailsSheet = receptionPage.match(/function BookingDetailsSheet[\s\S]*?export default function ReceptionPage/)?.[0] ?? "";
  assert.doesNotMatch(bookingDetailsSheet, /reception-sheet__handle/);
  assert.match(receptionCss, /\.reception-sheet\s*\{[\s\S]*z-index:\s*var\(--vc-z-modal\);[\s\S]*align-items:\s*stretch;/);
  assert.match(receptionCss, /\.reception-sheet__panel\s*\{[\s\S]*height:\s*100dvh;[\s\S]*max-height:\s*none;[\s\S]*contain:\s*layout paint;[\s\S]*border-radius:\s*0;[\s\S]*background:[\s\S]*#071f18;/);
  assert.match(receptionPage, /const root = document\.documentElement;[\s\S]*body\.style\.position = "fixed";[\s\S]*window\.scrollTo\(0, scrollY\);/);
});

test("booking details and guest contacts share hardened mobile overlay containment", () => {
  assert.match(guestContactSheet, /useContactSheetScrollLock\(Boolean\(contact\)\)/);
  assert.match(guestContactSheet, /const root = document\.documentElement;[\s\S]*root\.style\.overflow = "hidden";[\s\S]*body\.style\.position = "fixed";[\s\S]*window\.scrollTo\(0, scrollY\);/);
  assert.match(guestContactCss, /\.vanara-guest-contact-sheet\s*\{[\s\S]*z-index:\s*var\(--vc-z-modal\);[\s\S]*width:\s*100vw;[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*0;/);
  const contactPanelCss = guestContactCss.match(/\.vanara-guest-contact-sheet__panel\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(contactPanelCss, /height:\s*100%/);
  assert.match(contactPanelCss, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(contactPanelCss, /overflow:\s*hidden/);
  assert.match(contactPanelCss, /background:[\s\S]*#071f18/);
  assert.match(guestContactSheet, /className="vanara-guest-contact-sheet__scroll"[\s\S]*className="vanara-guest-contact-sheet__header"[\s\S]*className="vanara-guest-contact-sheet__actions"/);
  assert.match(guestContactCss, /\.vanara-guest-contact-sheet__scroll\s*\{[\s\S]*min-height:\s*0;[\s\S]*align-content:\s*start;[\s\S]*overflow-y:\s*auto;[\s\S]*-webkit-overflow-scrolling:\s*touch;/);
  assert.match(guestContactCss, /\.vanara-guest-contact-sheet__footer\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*2;[\s\S]*background:[\s\S]*#071f18;/);
  assert.doesNotMatch(guestContactCss, /\.vanara-guest-contact-sheet__panel\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(guestContactCss, /\.vanara-guest-contact-sheet__footer\s*\{[^}]*position:\s*sticky/);
  assert.match(guestContactCss, /@media \(min-width:\s*1024px\)[\s\S]*\.vanara-guest-contact-sheet__panel\s*\{[\s\S]*width:\s*min\(100%, 540px\);[\s\S]*height:\s*auto;[\s\S]*max-height:\s*calc\(100dvh - 48px\);[\s\S]*border-radius:\s*30px;/);
  assert.match(receptionCss, /\.reception-sheet__panel\s*\{[\s\S]*height:\s*100dvh;[\s\S]*contain:\s*layout paint;[\s\S]*background:[\s\S]*#071f18;/);
});

test("every Arrivals and Departures operational sheet uses one opaque contained surface", () => {
  const completionModal = receptionPage.match(/function CompletionModal[\s\S]*?type PassportReviewField/)?.[0] ?? "";
  const bookingDetailsSheet = receptionPage.match(/function BookingDetailsSheet[\s\S]*?export default function ReceptionPage/)?.[0] ?? "";
  assert.match(completionModal, /className="reception-sheet"/);
  assert.match(completionModal, /className="reception-sheet__panel"/);
  assert.match(completionModal, /<PassportManagementPanel/);
  assert.match(completionModal, /<PassportReviewPanel/);
  assert.match(completionModal, /<PassportWorkflow/);
  assert.match(bookingDetailsSheet, /className="reception-sheet reception-details-sheet"/);
  assert.match(receptionCss, /\.reception-sheet__panel\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*background:[\s\S]*#071f18;/);
  assert.match(receptionCss, /\.reception-sheet__actions\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;[\s\S]*z-index:\s*2;[\s\S]*background:[\s\S]*#071f18;/);
  assert.match(receptionCss, /@media \(min-width:\s*1024px\)[\s\S]*\.reception-sheet__panel\s*\{[\s\S]*width:\s*min\(100%, 540px\);[\s\S]*height:\s*auto;[\s\S]*max-height:\s*calc\(100dvh - 48px\);[\s\S]*border-radius:\s*30px;/);
});

test("passport capture and review stay opaque and scroll inside the viewport", () => {
  assert.match(receptionCss, /\.passport-workflow\s*\{[\s\S]*z-index:\s*var\(--vc-z-modal\);[\s\S]*width:\s*100vw;[\s\S]*height:\s*100dvh;[\s\S]*box-sizing:\s*border-box;[\s\S]*contain:\s*layout paint;[\s\S]*overflow:\s*hidden;[\s\S]*background:\s*var\(--vc-color-sand-100\);/);
  assert.match(receptionCss, /\.passport-workflow__content\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/);
  assert.match(receptionCss, /\.passport-review-actions,[\s\S]*\.passport-workflow__actions\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/);
});

test("booking details relabel the existing Beds value as Country while passport fields stay Nationality", () => {
  assert.match(englishCopy, /country:\s*"Country"/);
  assert.match(englishCopy, /nationality:\s*"Nationality"/);
  assert.match(thaiCopy, /country:\s*"ประเทศ"/);
  assert.match(thaiCopy, /nationality:\s*"สัญชาติ"/);
  assert.match(receptionPage, /\{ label: translate\("country"\), value: nationality \?\? translate\("notAvailable"\) \}/);
  assert.match(receptionPage, /\{ key: "nationality", label: "Nationality" \}/);
  assert.match(passportReview, /\{ key: "nationality", label: "Nationality" \}/);
  assert.match(serverReceptionService, /nationality:\s*row\.country \|\| row\.country_code \|\| null/);
  assert.doesNotMatch(receptionPage, /stay\.country|countryCodeToCountry/);
});

test("deposit collection uses persisted reception state in details and completion flows", () => {
  const completionDraft = receptionPage.match(/type CompletionDraft = \{[\s\S]*?\};/)?.[0] ?? "";
  const completionModal = receptionPage.match(/function CompletionModal[\s\S]*?type PassportReviewField/)?.[0] ?? "";
  assert.doesNotMatch(completionDraft, /depositCollected/);
  assert.match(completionModal, /updateReceptionCheckIn\(request\.stay\.bookingId, "depositCollected", checked\)/);
  assert.match(completionModal, /checked=\{request\.stay\.checkIn\.depositCollected\}/);
  assert.match(completionModal, /queryClient\.setQueryData<ReceptionOverview>\(queryKey/);
  assert.match(receptionPage, /depositCollected:\s*stay\.checkIn\.depositCollected/);
  assert.doesNotMatch(receptionPage, /depositCollected:\s*completionDraft\.depositCollected/);
});

test("mobile reception cards and action rows are width-contained without clipping", () => {
  assert.match(receptionCss, /\.reception-page\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*box-sizing:\s*border-box;/);
  assert.match(receptionCss, /@media \(max-width:\s*767px\)[\s\S]*\.reception-card__top\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(receptionCss, /@media \(max-width:\s*767px\)[\s\S]*\.reception-card__quick-actions\s*\{[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(receptionCss, /\.reception-page[^}]*overflow-x:\s*hidden/);
});

test("passport review hides audit-only OCR issues and only compares genuinely different numbers", () => {
  assert.match(passportWorkflow, /passportNumberCandidatesDiffer\(\s*verification\.visualCandidate,\s*verification\.mrzCandidate,?\s*\)/);
  assert.doesNotMatch(passportWorkflow, /verification\.issues\.includes\("PASSPORT_NUMBER_(?:CONFLICT|MISMATCH)"\)/);
  assert.doesNotMatch(passportWorkflow, /\{verification\.issues\.length > 0 && \(/);
  assert.match(passportWorkflow, /\{passportNumberHasConflict \? \(/);
  assert.match(passportMessages, /"passport\.openAiTimeout":\s*"passportCheckTimedOut"/);
  assert.doesNotMatch(passportMessages, /"passport\.openAiTimeout":\s*"OpenAI timeout\."/);
  assert.match(receptionCss, /\.passport-workflow \.passport-review__verification\s*\{[\s\S]*color:\s*#4b3212;[\s\S]*background:/);
});

test("reception contact icon uses the current Design System color and centered trigger", () => {
  assert.match(receptionPage, /VanaraGuestContactTrigger/);
  assert.match(receptionPage, /VanaraGuestContactSheet/);
  assert.match(guestContactTrigger, /export function AddressBookIcon/);
  assert.match(guestContactTrigger, /<AddressBookIcon \/>/);
  assert.match(guestContactSheet, /<AddressBookIcon \/>/);
  assert.doesNotMatch(receptionPage, /addressBookIcon|address-book-light/);
  assert.match(guestContactCss, /\.vanara-guest-contact-trigger\s*\{[\s\S]*display:\s*grid;[\s\S]*place-items:\s*center;/);
  assert.match(guestContactCss, /\.vanara-guest-contact-icon\s*\{[\s\S]*stroke:\s*currentColor;/);
  assert.doesNotMatch(receptionCss, /reception-contact-trigger|reception-address-book-icon/);
});

test("actionable today booking cards start completion while details remain secondary or fallback", () => {
  assert.match(receptionPage, /function canCompleteReception/);
  assert.match(receptionPage, /user\?\.isOwner[\s\S]*user\?\.views\.includes\("staff"\)[\s\S]*permission\.module === "movements"/);
  assert.doesNotMatch(receptionPage, /function hasCompletionPermission/);
  assert.match(receptionPage, /const completed = type === "arrival"[\s\S]*stay\.checkOut\.guestLeft \|\| stay\.checkOut\.roomReleased/);
  assert.match(receptionPage, /const canStartCompletion = isToday && canComplete && !completed/);
  assert.match(receptionPage, /if \(canStartCompletion\) \{[\s\S]*onCompletionRequest\(stay, type\);[\s\S]*return;[\s\S]*\}[\s\S]*onDetailsRequest\(stay\);/);
  assert.match(receptionPage, /\{translate\("details"\)\}/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onDetailsRequest\(stay\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onContactRequest\(contact\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onRequest\(stay, type\)/);
});

test("future arrival cards expose only Details and Address Book for every role", () => {
  const stayCard = receptionPage.match(/function StayCard[\s\S]*?function ReceptionDatePicker/)?.[0] ?? "";
  assert.match(stayCard, /\{translate\("details"\)\}/);
  assert.match(stayCard, /<VanaraGuestContactTrigger/);
  assert.match(stayCard, /stay\.roomId && \(isToday \|\| type !== "arrival"\)/);
  assert.doesNotMatch(stayCard, /user\?\.isOwner|currentUser|role ===/);
  assert.match(receptionCss, /\.reception-card__quick-actions \.vc-secondary-action,[\s\S]*min-height:\s*var\(--vc-touch-min\);[\s\S]*line-height:\s*1;[\s\S]*white-space:\s*nowrap;/);
});

test("check-in and check-out cards render nationality text without flags", async () => {
  assert.match(receptionPage, /import \{ formatNationalityText \} from "\.\.\/utils\/country-nationality";/);
  assert.match(receptionPage, /const nationality = formatNationalityText\(stay\.nationality\);/);
  assert.match(countryNationality, /export function countryCodeToNationality/);
  assert.match(receptionPage, /\{nationality \? <p className="reception-nationality">\{nationality\}<\/p> : null\}/);
  assert.match(receptionPage, /<p className="reception-booking-source">\{bookingSourceLabel\(stay, translate\)\}<\/p>/);
  assert.doesNotMatch(receptionPage, /reception-nationality-flag|nationalityFlagUrl|nationalityFlag/);
  assert.doesNotMatch(receptionPage, /UNKNOWN|N\/A|Guest nationality/);
  assert.match(receptionCss, /\.reception-nationality \{/);
  assert.match(receptionCss, /text-transform:\s*uppercase/);
  assert.match(receptionCss, /font-size:\s*var\(--vc-type-body-sm\)/);
  assert.match(receptionCss, /font-weight:\s*var\(--vc-weight-semibold\)/);
  const nationalityCss = receptionCss.match(/\.reception-nationality\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(nationalityCss, /border|border-radius|box-shadow/);
  assert.doesNotMatch(receptionCss, /\.reception-nationality-flag/);
});

test("Reception displays Direct source as localized Front Desk without changing the source contract", () => {
  assert.match(receptionPage, /function bookingSourceLabel\(stay: ReceptionStay, translate: \(key: string\) => string\): string/);
  assert.match(receptionPage, /value\.includes\("direct"\)\) return translate\("frontDesk"\)/);
  assert.match(receptionPage, /return stay\.bookingSource \|\| translate\("frontDesk"\)/);
  assert.doesNotMatch(receptionPage, /return "Direct"|return stay\.bookingSource \|\| "Direct"/);
});

test("Reception suppresses floating navigation while operational overlays are open", () => {
  assert.match(receptionPage, /suppressStickyNavigation=\{Boolean\(completionRequest \|\| contactRequest \|\| detailsRequest\)\}/);
  assert.match(receptionPage, /<CompletionModal/);
  assert.match(receptionPage, /<VanaraGuestContactSheet/);
  assert.match(receptionPage, /<BookingDetailsSheet/);
});

test("check-in cards expose housekeeping-only cleaning labels", () => {
  assert.match(receptionPage, /import OperationalStatusPill from "\.\.\/components\/rooms\/OperationalStatusPill"/);
  assert.match(receptionPage, /translateStaffLabel\(roomStatus, translate\)/);
  assert.match(receptionPage, /<OperationalStatusPill emphasis label=\{housekeepingLabel\} tone=\{roomStatusTone\(roomStatus\)\} \/>/);
  assert.match(receptionPage, /normalized === "clean"[\s\S]*return "success"/);
  assert.match(receptionPage, /normalized === "cleaning"[\s\S]*return "info"/);
  assert.match(receptionPage, /normalized === "dirty"[\s\S]*return "warning"/);
  assert.match(operationalStatusPill, /import "\.\.\/\.\.\/styles\/OperationalStatusPill\.css"/);
  assert.match(operationalStatusPillCss, /\.operational-status-pill--success/);
  assert.match(operationalStatusPillCss, /\.operational-status-pill--info/);
  assert.match(operationalStatusPillCss, /\.operational-status-pill--warning/);
  assert.doesNotMatch(receptionPage, /selectionBackground|checkin-card__housekeeping-icon/);
  assert.doesNotMatch(receptionCss, /selection-background\.svg|checkin-card__housekeeping-icon/);
  assert.match(serverReceptionService, /status:\s*"Clean"/);
  assert.match(serverReceptionService, /status:\s*"Dirty"/);
  assert.match(serverReceptionService, /status:\s*"Cleaning In Progress"/);
  assert.doesNotMatch(receptionPage, /ROOM READY|ROOM NOT READY|ROOM IN PROGRESS/);
  assert.doesNotMatch(serverReceptionService, /status:\s*"Not Ready"|status:\s*"Maintenance"|status:\s*"Out Of Service"|operationalAvailability/);
});

test("check-in checklist is visible only for today's arrival", () => {
  assert.match(receptionPage, /const showCheckInChecklist = stay\.arrival === today;/);
  assert.match(receptionPage, /{showCheckInChecklist && \(/);
});

test("passport acquired status is derived from backend data and refreshed after OCR upload", () => {
  assert.match(receptionPage, /loadBookingPassports\(stay\.bookingId, signal\)/);
  assert.match(receptionPage, /const passportCount = passports\.data\?\.length \?\? 0;/);
  assert.match(passportWorkflow, /classifyPassportForScan/);
  assert.match(passportWorkflow, /uploadPassportForReview\(bookingId, slotKey, current\.file\)/);
  assert.match(passportWorkflow, /saveBookingPassport\(bookingId, current\.objectKey, passport\)/);
  assert.match(receptionPage, /queryClient\.invalidateQueries\({ queryKey: passportsQueryKey }\)/);
});

test("complete check-in passport row is an action derived from persisted booking passports", () => {
  const passportRow = receptionPage.match(/<PassportStatusRow[\s\S]*?label=\{translate\("passportRegistrationCompleted"\)\}[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(passportRow);
  assert.doesNotMatch(passportRow, /onChange=/);
  assert.match(receptionPage, /label=\{translate\("passportRegistrationCompleted"\)\}/);
  assert.match(receptionPage, /function openPassportFlow\(\)/);
  assert.match(receptionPage, /setPassportManagerOpen\(true\)/);
  assert.match(receptionPage, /function openNewPassportCapture\(\)/);
  assert.match(receptionPage, /onClick=\{openPassportFlow\}/);
  assert.match(receptionPage, /<PassportWorkflow/);
  assert.match(receptionPage, /loadBookingPassports\(request\.stay\.bookingId, signal\)/);
  assert.match(passportWorkflow, /classifyPassportForScan/);
  assert.match(passportWorkflow, /uploadPassportForReview\(bookingId, slotKey, current\.file\)/);
  assert.match(passportWorkflow, /saveBookingPassport\(bookingId, current\.objectKey, passport\)/);
  assert.match(receptionPage, /passportRegistrationCompleted: completed/);
});

test("saved passports open a management panel and add another reuses the same capture pipeline", () => {
  assert.match(receptionPage, /function PassportManagementPanel/);
  assert.match(receptionPage, /translate\("savedPassports"\)/);
  assert.match(receptionPage, /translate\("addAnotherPassport"\)/);
  assert.match(receptionPage, /onAddAnother=\{openNewPassportCapture\}/);
  assert.match(receptionPage, /onOpenPassport=\{\(passport\) => \{/);
  assert.match(receptionPage, /passports=\{passports\.data \?\? \[\]\}/);
  assert.match(receptionPage, /queryClient\.setQueryData<BookingPassport\[\]>\(passportsQueryKey, \(current\) => \[\.\.\.\(current \?\? \[\]\), saved\]\)/);
});

test("booking passports schema allows one booking to have many passport records", () => {
  assert.doesNotMatch(bookingPassportsMigration, /UNIQUE\s*\(\s*booking_id\s*\)/i);
  assert.match(bookingPassportsMigration, /object_key TEXT NOT NULL UNIQUE/);
  assert.match(bookingPassportsMigration, /CREATE INDEX idx_booking_passports_booking\s+ON booking_passports\(booking_id, created_at\)/);
});

test("paid passport OCR attempts persist provider recovery without duplicate POSTs", () => {
  assert.match(passportWorkflow, /passportCaptureSlotKey\(bookingId, file\)/);
  assert.match(passportWorkflow, /classifyPassportForScan\(bookingId, slotKey, file\)/);
  assert.match(passportWorkflow, /uploadPassportForReview\(bookingId, slotKey, current\.file\)/);
  assert.match(receptionService, /formData\.set\("bookingId", String\(bookingId\)\)/);
  assert.match(receptionService, /formData\.set\("passportSlotKey", slotKey\)/);
  assert.match(passportOcrAttemptsMigration, /UNIQUE \(booking_id, slot_key, image_sha256\)/);
  assert.match(passportOcrAttemptsMigration, /client_request_id TEXT NOT NULL/);
  assert.match(passportOcrAttemptsMigration, /response_id TEXT/);
  assert.match(passportOcrAttemptsMigration, /state IN \('PENDING', 'SUBMITTING', 'POLLING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW'\)/);
});

test("passport action opens a capture panel before file selection and OCR", () => {
  assert.match(receptionPage, /<PassportWorkflow/);
  assert.match(passportWorkflow, /function PassportCameraStep/);
  assert.doesNotMatch(passportWorkflow, /Preview captured photo/);
  assert.doesNotMatch(passportWorkflow, /Continue to check/);
  assert.match(passportWorkflow, /livePassportPreflight/);
  assert.match(passportWorkflow, /semanticPreflight\.ready/);
  assert.match(passportWorkflow, /translate\("takePhoto"\)/);
  assert.match(passportWorkflow, /translate\("useNativeCamera"\)/);
  assert.match(passportWorkflow, /translate\("chooseFromLibrary"\)/);
  assert.match(passportWorkflow, /translate\("uploading"\)/);
  assert.match(passportWorkflow, /translate\("readingPassport"\)/);
  assert.match(passportWorkflow, /translate\("verifyingDetails"\)/);
  assert.match(passportWorkflow, /PASSPORT_IMAGE_ACCEPT/);
  assert.match(passportWorkflow, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(passportWorkflow, /dispatch\(\{ type: "CAPTURE"/);
  assert.match(passportWorkflow, /processSelectedImageFile\(file\)/);
  assert.match(passportWorkflow, /cropSelectedImageToPassportFrame\(file\)/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "START_CLASSIFICATION"/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "CLASSIFICATION_ACCEPTED"/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "CLASSIFICATION_REJECTED"/);
  assert.match(passportWorkflow, /translate\("scanPassport"\)/);
  assert.doesNotMatch(passportWorkflow, /quality\.status !== "ACCEPTED_FOR_OCR"/);
});

test("mobile Safari camera startup waits for a live video preview before analysis and capture", () => {
  assert.match(passportWorkflow, /const video = videoRef\.current;/);
  assert.match(passportWorkflow, /navigator\.mediaDevices\.getUserMedia\(\{\s*audio: false,\s*video: \{\s*facingMode: \{ ideal: "environment" \},\s*width: \{ ideal: 3840 \},\s*height: \{ ideal: 2160 \}/s);
  assert.match(passportWorkflow, /focusMode = "continuous"/);
  assert.match(passportWorkflow, /exposureMode = "continuous"/);
  assert.match(passportWorkflow, /capabilities\.torch === true/);
  assert.match(passportWorkflow, /translate\("torchOn"\)/);
  assert.match(passportWorkflow, /translate\("torchOff"\)/);
  assert.match(passportWorkflow, /video\.srcObject = stream/);
  assert.match(passportWorkflow, /video\.autoplay = true/);
  assert.match(passportWorkflow, /video\.muted = true/);
  assert.match(passportWorkflow, /video\.playsInline = true/);
  assert.match(passportWorkflow, /video\.setAttribute\("playsinline", ""\)/);
  assert.match(passportWorkflow, /video\.setAttribute\("webkit-playsinline", ""\)/);
  assert.match(passportWorkflow, /await waitForVideoEvent\(video, \["loadedmetadata", "canplay"\], 4_000\)/);
  assert.match(passportWorkflow, /await video\.play\(\)/);
  assert.match(passportWorkflow, /await waitForLiveVideoFrame\(video, stream, 2_500\)/);
  assert.match(passportWorkflow, /track\.readyState === "live"/);
  assert.match(passportWorkflow, /if \(cameraState !== "ready"\) return undefined;/);
  assert.match(passportWorkflow, /if \(!liveTrack\) return;/);
});

test("live passport guidance analyzes the landscape guide crop instead of the full portrait phone frame", async () => {
  const receptionCss = await readFile(new URL("../../src/styles/ReceptionPage.css", import.meta.url), "utf8");
  assert.match(passportCrop, /export const PASSPORT_FRAME_ASPECT_RATIO = 1\.42/);
  assert.match(passportCrop, /export function passportGuideRect/);
  assert.match(passportCrop, /export function mapRenderedGuideToSourceCrop/);
  assert.match(passportWorkflow, /function videoGuideSourceCrop\(video: HTMLVideoElement\)/);
  assert.match(passportWorkflow, /canvas\.height = Math\.max\(1, Math\.round\(360 \/ PASSPORT_FRAME_ASPECT_RATIO\)\)/);
  assert.match(passportWorkflow, /const mapped = videoGuideSourceCrop\(video\)/);
  assert.match(passportWorkflow, /context\.drawImage\(video, crop\.sx, crop\.sy, crop\.sw, crop\.sh, 0, 0, canvas\.width, canvas\.height\)/);
  assert.match(passportWorkflow, /isCropAspectRatioValid\(crop\)/);
  assert.match(receptionCss, /\.passport-camera__frame \{/);
  assert.match(receptionCss, /aspect-ratio: 1\.42;/);
  assert.match(receptionCss, /width: min\(86%, 520px\);/);
  assert.doesNotMatch(receptionCss, /inset: 18% 8%/);
});

test("passport capture layout stays viewport-contained and captures only the guide crop", async () => {
  const receptionCss = await readFile(new URL("../../src/styles/ReceptionPage.css", import.meta.url), "utf8");
  assert.match(receptionCss, /\.passport-workflow \{[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/);
  assert.match(passportWorkflow, /const mapped = videoGuideSourceCrop\(video\)/);
  assert.match(passportWorkflow, /canvas\.width = Math\.max\(1, Math\.round\(crop\.sw\)\)/);
  assert.match(passportWorkflow, /context\.drawImage\(video, crop\.sx, crop\.sy, crop\.sw, crop\.sh, 0, 0, canvas\.width, canvas\.height\)/);
  assert.match(passportWorkflow, /finalBlobBytes: blob\.size/);
  assert.match(passportWorkflow, /centerCropForAspectRatio\(sourceWidth, sourceHeight\)/);
  assert.match(receptionCss, /\.passport-camera \{[\s\S]*aspect-ratio: 1\.42;[\s\S]*max-height: 45dvh;/);
  assert.match(receptionCss, /\.passport-capture__preview \{[\s\S]*max-height: 42dvh;[\s\S]*object-fit: contain;/);
});

test("live passport guidance uses weighted readiness and hides advisory diagnostics in production UI", () => {
  assert.match(passportWorkflow, /liveQuality\?\.blockingIssue/);
  assert.match(passportWorkflow, /semanticPreflight\.ready/);
  assert.match(passportWorkflow, /translate\("searchingForPassport"\)/);
  assert.match(passportWorkflowState, /phase: "READY_FOR_OCR"/);
  assert.doesNotMatch(passportWorkflow, /Ready to scan language belongs here/);
});

test("failed live camera preview exposes deterministic native fallback and cleanup", () => {
  assert.match(passportWorkflow, /translate\("cameraPreviewFailed"\)/);
  assert.match(passportWorkflow, /translate\("cameraUnavailable"\)/);
  assert.match(passportWorkflow, /const stopCamera = useCallback\(\(\) =>/);
  assert.match(passportWorkflow, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(passportWorkflow, /translate\("retryCamera"\)/);
  assert.match(passportWorkflow, /capture="environment"/);
  assert.match(passportWorkflow, /onClick=\{onTakePhoto\}/);
});

test("passport OCR result must be reviewed before persistence", () => {
  assert.match(passportWorkflow, /function PassportReviewStep/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "OCR_SUCCESS", captureId, objectKey: result\.objectKey, passport: result\.passport }\)/);
  assert.match(passportWorkflow, /translate\("savePassport"\)/);
  assert.match(passportWorkflowState, /phase: "REVIEW"/);
  assert.match(receptionPage, /setPassportReview\({ mode: "existing", passport }\)/);
});

test("verification timeout opens review with manual confirmation and technical details collapsed", () => {
  assert.match(passportWorkflow, /translate\("passportCheckTimedOut"\)/);
  assert.match(passportWorkflow, /translate\("confirmPassportNumber"\)/);
  assert.match(passportWorkflow, /MANUALLY_VERIFIED/);
  assert.doesNotMatch(passportWorkflow, /verification\.issues\.map/);
  assert.doesNotMatch(passportWorkflow, /passportNameReviewSummary/);
  assert.match(passportWorkflow, /missingRequiredFields\.length === 0/);
  assert.match(passportWorkflow, /<details className="passport-review__technical">/);
  assert.match(passportWorkflow, /<summary>\{translate\("details"\)\}<\/summary>/);
  assert.doesNotMatch(passportWorkflow, /<p className="passport-capture__hint">Request ID:/);
});

test("passport review save button always explains disabled state", () => {
  assert.match(passportReview, /TM30_REQUIRED_REVIEW_FIELDS/);
  assert.match(passportReview, /Missing TM30 field:/);
  assert.doesNotMatch(passportWorkflow, /Passport number requires confirmation\./);
  assert.match(passportWorkflow, /passport-review__save-reason/);
  assert.match(passportWorkflow, /disabled=\{Boolean\(saveDisabledReason\)\}/);
  assert.match(passportWorkflow, /markPassportNumberNeedsConfirmation/);
  assert.doesNotMatch(passportWorkflow, /passportNameReviewSummary/);
  assert.doesNotMatch(passportWorkflow, /translate\("passportGivenNamesNeedReview"\)/);
});

test("passport review is a compact quick review with one sticky action bar", () => {
  const reviewStep = passportWorkflow.match(/function PassportReviewStep[\s\S]*?function updateDraftField/)?.[0] ?? "";
  const reviewCss = receptionCss.match(/\.passport-review\s*\{[\s\S]*?\.passport-management/)?.[0] ?? "";
  assert.match(passportWorkflow, /reviewingPassport \? translate\("reviewPassport"\) : translate\("passportRegistration"\)/);
  assert.doesNotMatch(reviewStep, /Passport OCR Review|Review extracted fields/);
  assert.match(reviewStep, /className="passport-workflow__actions passport-review-actions"/);
  assert.match(reviewCss, /\.passport-review-actions/);
  assert.match(reviewCss, /position:\s*sticky/);
  assert.match(reviewCss, /min-height:\s*44px/);
  assert.match(reviewCss, /var\(--vc-safe-bottom\)/);
});

test("passport camera latches READY through tap micro-movement", () => {
  assert.match(passportWorkflow, /nextReadyLatchUntil\(true, Date\.now\(\)\)/);
  assert.match(passportWorkflow, /shouldIgnoreReadyDegradationDuringTap/);
  assert.match(passportWorkflow, /shouldIgnoreTemporaryReadyDegradation/);
  assert.match(passportWorkflow, /shouldCancelReadyLatch/);
  assert.match(passportWorkflow, /lastReadyCropRef/);
  assert.match(passportWorkflow, /lastReadyCandidateRef/);
  assert.match(passportWorkflow, /readyCaptureCandidate/);
  assert.match(passportWorkflow, /onCaptureFile\(candidate\.file, candidate\.debug\)/);
  assert.match(passportWorkflow, /pointerActiveRef/);
});

test("passport camera supports auto capture without changing the workflow reducer", () => {
  assert.match(passportWorkflow, /autoCaptureEnabled = isMobile/);
  assert.match(passportWorkflow, /autoCaptureInFlightRef/);
  assert.match(passportWorkflow, /autoCaptureTimerRef/);
  assert.match(passportWorkflow, /PASSPORT_AUTO_CAPTURE_DWELL_MS/);
  assert.match(passportWorkflow, /scheduleAutoCapture/);
  assert.match(passportWorkflow, /captureFromCamera\("auto"\)/);
  assert.match(passportWorkflow, /captureFromCamera\("manual"\)/);
  assert.match(passportWorkflow, /cancelAutoCaptureTimer\(\)/);
  assert.match(passportWorkflow, /selectBestAutoCaptureCandidate/);
  assert.match(passportWorkflow, /onCaptureFile\(candidate\.file, candidate\.debug\)/);
  assert.doesNotMatch(passportWorkflowState, /AUTO_CAPTURE/);
});

test("passport OCR upload sends full image plus passport number and MRZ crops", () => {
  assert.match(receptionService, /function cropPassportImage/);
  assert.match(receptionService, /function encodePassportImage/);
  assert.match(receptionService, /OCR_FULL_IMAGE_MAX_LONG_EDGE = 1800/);
  assert.match(receptionService, /CLASSIFICATION_IMAGE_MAX_LONG_EDGE = 1800/);
  assert.match(receptionService, /PASSPORT_NUMBER_CROP_MAX_LONG_EDGE = 1000/);
  assert.match(receptionService, /MRZ_CROP_MAX_LONG_EDGE = 1600/);
  assert.match(receptionService, /imageOrientation: "from-image"/);
  assert.match(receptionService, /context\.filter = "brightness\(1\.04\) contrast\(1\.12\)"/);
  assert.match(receptionService, /appendPassportOcrImages\(formData, file\)/);
  assert.match(receptionService, /formData\.set\("passport", normalized\)/);
  assert.match(receptionService, /formData\.set\("passportNumberCrop", passportNumberCrop\)/);
  assert.match(receptionService, /formData\.set\("mrzCrop", mrzCrop\)/);
  assert.match(receptionService, /appendPassportClassificationImages\(formData, file\)/);
});

test("deposit collected uses existing reception check-in persistence", () => {
  assert.match(receptionPage, /updateReceptionCheckIn\(stay\.bookingId, "depositCollected", !stay\.checkIn\.depositCollected\)/);
});
