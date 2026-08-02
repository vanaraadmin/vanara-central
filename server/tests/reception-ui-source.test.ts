import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const receptionPage = await readFile(new URL("../../src/pages/ReceptionPage.tsx", import.meta.url), "utf8");
const passportWorkflow = await readFile(new URL("../../src/components/passport/PassportWorkflow.tsx", import.meta.url), "utf8");
const passportWorkflowState = await readFile(new URL("../../src/utils/passport-workflow-state.ts", import.meta.url), "utf8");
const receptionService = await readFile(new URL("../../src/services/reception.service.ts", import.meta.url), "utf8");
const passportCrop = await readFile(new URL("../../src/utils/passport-crop.ts", import.meta.url), "utf8");
const bookingPassportsMigration = await readFile(new URL("../migrations/0013_booking_passports.sql", import.meta.url), "utf8");

test("booking details sheet reuses the existing reception sheet structure", () => {
  assert.match(receptionPage, /function BookingDetailsSheet/);
  assert.match(receptionPage, /useSheetScrollLock\(Boolean\(stay\)\)/);
  assert.match(receptionPage, /className="reception-sheet reception-details-sheet"/);
  assert.match(receptionPage, /className="reception-sheet__scrim"/);
  assert.match(receptionPage, /reception-details-sheet__panel/);
  assert.match(receptionPage, /className="reception-sheet__handle"/);
});

test("booking cards open booking details without replacing existing contact and completion actions", () => {
  assert.match(receptionPage, /onDetailsRequest\(stay\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onContactRequest\(stay\)/);
  assert.match(receptionPage, /event\.stopPropagation\(\);\s*onRequest\(stay, type\)/);
});

test("check-in and check-out cards render nationality text without flags", async () => {
  const receptionCss = await readFile(new URL("../../src/styles/ReceptionPage.css", import.meta.url), "utf8");
  assert.match(receptionPage, /function formatNationality\(value: string \| null\): string \| null/);
  assert.match(receptionPage, /cleaned \? cleaned\.toUpperCase\(\) : null/);
  assert.match(receptionPage, /const nationality = formatNationality\(stay\.nationality\);/);
  assert.match(receptionPage, /\{nationality \? <p className="reception-nationality">\{nationality\}<\/p> : null\}/);
  assert.match(receptionPage, /<p className="reception-booking-source">\{bookingSourceLabel\(stay\)\}<\/p>/);
  assert.doesNotMatch(receptionPage, /reception-nationality-flag|nationalityFlagUrl|nationalityFlag/);
  assert.doesNotMatch(receptionPage, /UNKNOWN|N\/A|Guest nationality/);
  assert.match(receptionCss, /\.reception-nationality \{/);
  assert.match(receptionCss, /text-transform:\s*uppercase/);
  assert.match(receptionCss, /font-size:\s*0\.84rem/);
  assert.match(receptionCss, /font-weight:\s*650/);
  const nationalityCss = receptionCss.match(/\.reception-nationality\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(nationalityCss, /border|border-radius|box-shadow/);
  assert.doesNotMatch(receptionCss, /\.reception-nationality-flag/);
});

test("check-in checklist is visible only for today's arrival", () => {
  assert.match(receptionPage, /const showCheckInChecklist = stay\.arrival === today;/);
  assert.match(receptionPage, /{showCheckInChecklist && \(/);
});

test("passport acquired status is derived from backend data and refreshed after OCR upload", () => {
  assert.match(receptionPage, /loadBookingPassports\(stay\.bookingId, signal\)/);
  assert.match(receptionPage, /const passportCount = passports\.data\?\.length \?\? 0;/);
  assert.match(passportWorkflow, /classifyPassportForScan/);
  assert.match(passportWorkflow, /uploadPassportForReview\(current\.file\)/);
  assert.match(passportWorkflow, /saveBookingPassport\(bookingId, current\.objectKey, passport\)/);
  assert.match(receptionPage, /queryClient\.invalidateQueries\({ queryKey: passportsQueryKey }\)/);
});

test("complete check-in passport row is an action derived from persisted booking passports", () => {
  const passportRow = receptionPage.match(/<PassportStatusRow[\s\S]*?label="Passport registration completed"[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(passportRow);
  assert.doesNotMatch(passportRow, /onChange=/);
  assert.match(receptionPage, /label="Passport registration completed"/);
  assert.match(receptionPage, /function openPassportFlow\(\)/);
  assert.match(receptionPage, /setPassportManagerOpen\(true\)/);
  assert.match(receptionPage, /function openNewPassportCapture\(\)/);
  assert.match(receptionPage, /onClick=\{openPassportFlow\}/);
  assert.match(receptionPage, /<PassportWorkflow/);
  assert.match(receptionPage, /loadBookingPassports\(request\.stay\.bookingId, signal\)/);
  assert.match(passportWorkflow, /classifyPassportForScan/);
  assert.match(passportWorkflow, /uploadPassportForReview\(current\.file\)/);
  assert.match(passportWorkflow, /saveBookingPassport\(bookingId, current\.objectKey, passport\)/);
  assert.match(receptionPage, /passportRegistrationCompleted: completed/);
});

test("saved passports open a management panel and add another reuses the same capture pipeline", () => {
  assert.match(receptionPage, /function PassportManagementPanel/);
  assert.match(receptionPage, /Saved passports/);
  assert.match(receptionPage, /Add another passport/);
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

test("passport action opens a capture panel before file selection and OCR", () => {
  assert.match(receptionPage, /<PassportWorkflow/);
  assert.match(passportWorkflow, /function PassportCameraStep/);
  assert.doesNotMatch(passportWorkflow, /Preview captured photo/);
  assert.doesNotMatch(passportWorkflow, /Continue to check/);
  assert.match(passportWorkflow, /livePassportPreflight/);
  assert.match(passportWorkflow, /semanticPreflight\.ready/);
  assert.match(passportWorkflow, /Take photo/);
  assert.match(passportWorkflow, /Use native camera/);
  assert.match(passportWorkflow, /Choose from library/);
  assert.match(passportWorkflow, /Uploading/);
  assert.match(passportWorkflow, /Reading passport/);
  assert.match(passportWorkflow, /Verifying details/);
  assert.match(passportWorkflow, /PASSPORT_IMAGE_ACCEPT/);
  assert.match(passportWorkflow, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(passportWorkflow, /dispatch\(\{ type: "CAPTURE"/);
  assert.match(passportWorkflow, /processSelectedImageFile\(file\)/);
  assert.match(passportWorkflow, /cropSelectedImageToPassportFrame\(file\)/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "START_CLASSIFICATION"/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "CLASSIFICATION_ACCEPTED"/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "CLASSIFICATION_REJECTED"/);
  assert.match(passportWorkflow, /Scan Passport/);
  assert.doesNotMatch(passportWorkflow, /quality\.status !== "ACCEPTED_FOR_OCR"/);
});

test("mobile Safari camera startup waits for a live video preview before analysis and capture", () => {
  assert.match(passportWorkflow, /const video = videoRef\.current;/);
  assert.match(passportWorkflow, /navigator\.mediaDevices\.getUserMedia\(\{\s*audio: false,\s*video: \{\s*facingMode: \{ ideal: "environment" \},\s*width: \{ ideal: 3840 \},\s*height: \{ ideal: 2160 \}/s);
  assert.match(passportWorkflow, /focusMode = "continuous"/);
  assert.match(passportWorkflow, /exposureMode = "continuous"/);
  assert.match(passportWorkflow, /capabilities\.torch === true/);
  assert.match(passportWorkflow, /Torch on/);
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
  assert.match(passportWorkflow, /Searching for passport/);
  assert.match(passportWorkflowState, /phase: "READY_FOR_OCR"/);
  assert.doesNotMatch(passportWorkflow, /Ready to scan language belongs here/);
});

test("failed live camera preview exposes deterministic native fallback and cleanup", () => {
  assert.match(passportWorkflow, /Camera opened but preview could not start\. Use native camera instead\./);
  assert.match(passportWorkflow, /Camera permission denied/);
  assert.match(passportWorkflow, /Another application may be using the camera/);
  assert.match(passportWorkflow, /const stopCamera = useCallback\(\(\) =>/);
  assert.match(passportWorkflow, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(passportWorkflow, /Retry camera/);
  assert.match(passportWorkflow, /capture="environment"/);
  assert.match(passportWorkflow, /onClick=\{onTakePhoto\}/);
});

test("passport OCR result must be reviewed before persistence", () => {
  assert.match(passportWorkflow, /function PassportReviewStep/);
  assert.match(passportWorkflow, /dispatchBase\(\{ type: "OCR_SUCCESS", captureId, objectKey: result\.objectKey, passport: result\.passport }\)/);
  assert.match(passportWorkflow, /Save Passport/);
  assert.match(passportWorkflowState, /phase: "REVIEW"/);
  assert.match(receptionPage, /setPassportReview\({ mode: "existing", passport }\)/);
});

test("verification timeout opens review with manual confirmation and technical details collapsed", () => {
  assert.match(passportWorkflow, /Automatic verification took too long\. Please confirm the highlighted field\./);
  assert.match(passportWorkflow, /Confirm Passport Number/);
  assert.match(passportWorkflow, /MANUALLY_VERIFIED/);
  assert.match(passportWorkflow, /<details className="passport-review__technical">/);
  assert.match(passportWorkflow, /<summary>Technical details<\/summary>/);
  assert.doesNotMatch(passportWorkflow, /<p className="passport-capture__hint">Request ID:/);
});

test("passport review save button always explains disabled state", () => {
  assert.match(passportWorkflow, /TM30_REQUIRED_REVIEW_FIELDS/);
  assert.match(passportWorkflow, /Missing TM30 field:/);
  assert.match(passportWorkflow, /Passport number requires confirmation\./);
  assert.match(passportWorkflow, /passport-review__save-reason/);
  assert.match(passportWorkflow, /disabled=\{Boolean\(saveDisabledReason\)\}/);
  assert.match(passportWorkflow, /markPassportNumberNeedsConfirmation/);
  assert.match(passportWorkflow, /passportNameReviewSummary/);
  assert.match(passportWorkflow, /Given names need review/);
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
