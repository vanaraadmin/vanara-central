# Vanara Central Workspace

## Passport Engine

### Architecture Freeze v1.0

**Status:** FROZEN

------------------------------------------------------------------------

# Overview

## Purpose

The Passport Engine is the Reception workspace subsystem responsible for
capturing passport images, validating that the captured document is a usable
passport biodata page, extracting structured passport data with OpenAI Vision,
allowing staff review, and persisting the resulting passport record against the
active Reception booking.

The module exists because Vanara Central must produce reliable guest document
data for operational check-in and TM30 reporting. The implementation is built
around the practical Reception workflow: a staff member opens a booking from the
Reception check-in sheet, captures or selects a passport image, reviews the
extracted fields, and saves a passport record linked to that booking.

The Passport Engine is not a standalone document-management platform. It is a
single-resort operational module optimized for the Vanara Reception use case.

## Goals

- Capture passport biodata pages from mobile camera, native camera, or file
  picker.
- Keep the acquisition flow recoverable from every failure state.
- Use AI for semantic passport understanding instead of relying exclusively on
  brittle local image heuristics.
- Prevent non-passport documents from reaching OCR when the classifier rejects
  them.
- Run structured OCR using OpenAI Responses API and strict JSON schemas.
- Validate MRZ format and check digits deterministically after OCR.
- Preserve primary OCR results when conditional verification times out.
- Require staff review before persistence.
- Persist one passport record per saved passport.
- Support multiple passport records per booking.
- Drive Reception checklist completion from persisted passport records only.
- Store passport images in Cloudflare R2 under the dedicated `passports/`
  prefix.
- Keep passport persistence, storage, OCR, and UI workflow responsibilities
  separated.

## Non-goals

- The Passport Engine does not submit TM30 data to the immigration portal.
- It does not automate browser interaction with external government systems.
- It does not edit Beds24 bookings.
- It does not determine check-out status.
- It does not replace the Reception check-in checklist.
- It does not provide a generic document-storage abstraction for every future
  document type.
- It does not expose public R2 URLs.
- It does not store original uploaded filenames.
- It does not implement antivirus scanning, upload streaming, background OCR
  jobs, rate limiting, or document galleries.

## Design Philosophy

The current implementation follows an AI-first, operator-reviewed design.

Local browser image analysis is used only for fast feedback and obvious capture
failures. It is intentionally lightweight. It should help staff place the
passport inside the landscape guide, avoid completely dark or severely blurred
frames, and keep the camera experience calm. It is not expected to prove that a
document is a passport.

OpenAI Vision performs semantic document understanding. The live preflight and
post-capture classifier decide whether the image shows a passport biodata page,
whether the document is inside the frame, and whether the MRZ is likely visible.

Deterministic backend validation is used where business correctness matters:
strict schemas, MRZ format checks, MRZ check digits, passport-number consensus,
mandatory TM30 field validation, and persistence provenance.

Staff review remains part of the critical path. The system may auto-verify
fields, but a passport record is saved only after the review screen and Save
action.

## Scope

The Passport Engine spans:

- Reception UI entry points.
- Full-screen passport workflow.
- Camera startup and fallback handling.
- Landscape passport guide and crop generation.
- Auto Capture and manual capture fallback.
- Live semantic preflight.
- Post-capture classification.
- OCR extraction.
- MRZ parsing and deterministic validation.
- Consensus and conditional verification.
- Review/edit UI.
- Save validation.
- R2 image storage.
- D1 passport persistence.
- Reception passport count refresh.
- TM30 export input data.
- Passport image retention cleanup.

------------------------------------------------------------------------

# High Level Architecture

## Overall Architecture

The implementation is split between frontend acquisition and backend document
processing.

``` text
Reception Check-in Sheet
    |
    | tap Passport registration
    v
PassportWorkflow full-screen layer
    |
    | live camera / native camera / library
    v
Capture and crop utilities
    |
    | live preflight / classification / OCR API calls
    v
Cloudflare Worker API
    |
    +--> OpenAI Responses API
    |
    +--> Passport Storage Service
    |       |
    |       v
    |     Cloudflare R2
    |
    +--> Booking Passport Service
            |
            v
          Cloudflare D1
```

## Main Modules

Frontend:

- `src/pages/ReceptionPage.tsx`
  Owns Reception booking context, opens the passport workflow, displays saved
  passport count, refreshes query state after save, and keeps the checklist
  status derived from backend data.

- `src/components/passport/PassportWorkflow.tsx`
  Owns the full-screen passport acquisition UI and connects workflow state to
  camera, preflight, OCR, review, save, retake, retry, and cancel actions.

- `src/components/passport/passport-messages.ts`
  Maps passport-specific message keys to user-visible fallback text.

- `src/utils/passport-workflow-state.ts`
  Defines the canonical reducer, workflow phases, actions, and state transition
  rules.

- `src/utils/passport-crop.ts`
  Defines the landscape passport guide aspect ratio and maps rendered guide
  coordinates to video/source crop coordinates.

- `src/utils/passport-quality.ts`
  Implements local pixel-analysis heuristics for live guidance and post-capture
  quality evaluation.

- `src/utils/passport-ready-latch.ts`
  Implements READY latching and the rules for ignoring temporary stability-only
  degradation.

- `src/utils/passport-auto-capture.ts`
  Implements Auto Capture dwell timing, candidate freshness, structural
  candidate validity, candidate selection, and timer preconditions.

- `src/services/reception.service.ts`
  Encodes/crops images client-side and calls Reception passport APIs.

Backend:

- `server/src/index.ts`
  Defines the Worker routes, authentication checks, structured API responses,
  passport event logging, upload rollback, and endpoint-level error mapping.

- `server/src/services/passport-upload.service.ts`
  Validates multipart uploads, MIME types, extensions, file sizes, and optional
  OCR crop files.

- `server/src/services/passport-storage.service.ts`
  Stores, reads, deletes, and checks passport objects in Cloudflare R2 through
  the native `env.R2_STORAGE` binding.

- `server/src/services/passport-live-preflight.service.ts`
  Runs the lightweight OpenAI live preflight request for camera guidance.

- `server/src/services/passport-classification.service.ts`
  Runs the post-capture OpenAI semantic document classification request.

- `server/src/services/passport-ocr.service.ts`
  Runs OCR, strict schema validation, visual/MRZ extraction, consensus,
  conditional verification, timeout handling, and review-data generation.

- `server/src/services/passport-consensus.service.ts`
  Builds deterministic field consensus and TM30 readiness from visual, MRZ, and
  parsed MRZ data.

- `server/src/services/passport-mrz.service.ts`
  Parses TD3 MRZ lines and validates check digits.

- `server/src/services/booking-passports.service.ts`
  Persists and retrieves passport records linked to Reception bookings.

- `server/src/services/passport-retention.service.ts`
  Deletes expired passport image records and R2 objects according to configured
  retention.

- `server/src/services/tm30-export.service.ts`
  Reads `booking_passports` rows that are TM30-ready and writes them into the
  official TM30 workbook.

## Responsibilities

The frontend is responsible for:

- Presenting a recoverable full-screen workflow.
- Managing camera lifecycle and fallback controls.
- Producing camera/file crops suitable for backend processing.
- Showing progress, errors, retry/retake actions, review fields, save blockers,
  and manual confirmation controls.
- Calling existing APIs.
- Refreshing the Reception passport count after save.

The backend is responsible for:

- Authentication and permission checks.
- Upload validation.
- R2 storage and rollback.
- OpenAI calls and strict schema enforcement.
- MRZ parsing and deterministic validation.
- Persistence rules.
- TM30 readiness calculation.
- Sensitive logging discipline.

## Component Relationships

``` text
ReceptionPage
    |
    +-- PassportStatusRow
    |       |
    |       +-- opens PassportManagementPanel when passports exist
    |       +-- opens PassportWorkflow for new capture
    |
    +-- PassportManagementPanel
    |       |
    |       +-- lists saved passports
    |       +-- opens existing passport review/detail
    |       +-- Add another passport -> PassportWorkflow
    |
    +-- PassportWorkflow
            |
            +-- PassportCameraStep
            +-- PassportProgressStep
            +-- PassportPreviewStep
            +-- PassportFailureStep
            +-- PassportReviewStep
```

------------------------------------------------------------------------

# UI Architecture

## Screens

The Passport Engine appears from the Reception check-in workflow.

The Reception card opens a booking details or completion sheet. The passport
row is an action row, not a manually toggleable checkbox. Completion is derived
from persisted passport records for the booking.

When the passport workflow opens, it uses a full-screen layer:

- `role="dialog"`
- `aria-modal="true"`
- compact fixed header
- content area
- bottom action area
- hidden file inputs for camera/library fallback

The underlying Reception sheet is not the active interaction surface while the
passport workflow is open.

## Fullscreen Workflow

`PassportWorkflow` renders only when `open` is true and the reducer phase is not
`CLOSED` or `COMPLETED`. The component creates a new `captureId` when opened.
That id is used to ignore stale classification, OCR, or save results from older
attempts.

The workflow is not implemented as a separate route. It is a React component
layer launched from Reception with booking context:

- `bookingId`
- `guestName`
- `isMobile`
- `onCancel`
- `onSaved`

## Navigation

There are three high-level navigation exits:

- Cancel: closes the workflow and returns to Reception without saving.
- Retake: discards the current attempt and returns to `CAMERA` with a new
  `captureId`.
- Save: persists the reviewed passport and returns to Reception through
  `onSaved`.

The workflow also contains fallback navigation from camera failure states:

- Retry camera
- Use native camera
- Choose from library

## Step Sequence

The normal sequence is:

``` text
CAMERA
  |
  | Auto Capture or manual Capture
  v
CAPTURED
  |
  | classify captured file
  v
CLASSIFYING
  |
  | accepted
  v
READY_FOR_OCR
  |
  | Scan Passport
  v
OCR_RUNNING
  |
  | success
  v
REVIEW
  |
  | Save Passport
  v
SAVING
  |
  | success
  v
COMPLETED
```

Failure paths are explicit:

- Classification rejection enters `REJECTED`.
- OCR failure enters `OCR_FAILED`.
- Save failure enters `SAVE_FAILED`.
- Retake returns to `CAMERA`.
- Cancel returns to `CLOSED`.

## Review Screen

The review screen displays editable fields:

- First name
- Middle name
- Last name
- Passport number
- Nationality
- Gender
- Birth date
- Expiry date

The Save button is disabled when the current draft has a blocking issue. The UI
shows the blocking reason instead of leaving the button grey without
explanation.

Save blockers include:

- Pending save.
- Missing mandatory TM30 fields.
- Passport-number confirmation required.

Mandatory TM30 review fields are:

- `firstName`
- `lastName`
- `passportNumber`
- `nationality`
- `gender`
- `birthDate`

## Retake

Retake increments the active capture id and dispatches `RETAKE`. The reducer
returns to `CAMERA` from any active phase except `CLOSED` and `COMPLETED`.

Retake clears the previous preview URL through the workflow dispatch wrapper.

## Retry

Retry is stage-specific:

- Camera retry restarts camera startup.
- OCR retry runs OCR again from `OCR_FAILED`.
- Classification rejection does not retry automatically; the operator retakes
  or chooses another image.

## Cancel

Cancel increments the active capture id, dispatches `CANCEL`, revokes preview
URLs where applicable, and calls `onCancel`.

Cancel is available from active workflow states. It stops camera resources when
camera cleanup runs.

## Save

Save calls:

``` text
POST /api/reception/stays/:bookingId/passports
```

with:

- `objectKey`
- reviewed `passport`
- embedded `passport.verification`

The backend validates mandatory fields, verification state, TM30 readiness, and
object key provenance before inserting the passport record.

## Auto Capture

Auto Capture is enabled by default for the live mobile camera path:

``` text
const autoCaptureEnabled = isMobile
```

It does not add a new reducer phase. It uses the same `captureFromCamera`
pipeline as manual capture.

Auto Capture starts only when:

- mobile live camera is active;
- camera state is ready;
- stream has a live video track;
- no capture is already in flight;
- no auto timer already exists;
- a valid recent READY candidate exists;
- the candidate is structurally valid.

Manual Capture remains visible as a fallback and cancels any pending auto timer.

------------------------------------------------------------------------

# Camera Pipeline

## Camera Lifecycle

The live camera path is used on mobile when possible. It calls
`navigator.mediaDevices.getUserMedia()` only after the `<video>` element exists.

The requested constraints are:

``` text
audio: false
video:
    facingMode: ideal environment
    width: ideal 3840
    height: ideal 2160
```

After the stream is acquired:

- the first video track is inspected for capabilities;
- continuous focus and continuous exposure are requested where supported;
- torch support is detected through `capabilities.torch`;
- video attributes are set explicitly:
  - `autoplay`
  - `muted`
  - `playsInline`
  - `playsinline`
  - `webkit-playsinline`
- `video.srcObject` is assigned;
- `loadedmetadata` or `canplay` is awaited;
- `video.play()` is awaited;
- a live video frame is required before the camera becomes ready.

Camera startup failures are mapped to specific messages:

- Camera permission denied.
- Camera unavailable.
- Another application may be using the camera.
- Camera opened but preview could not start.

The native camera/file fallback remains available.

## Guide System

The guide is landscape even when the phone remains portrait. The passport frame
uses:

``` text
PASSPORT_FRAME_ASPECT_RATIO = 1.42
PASSPORT_FRAME_WIDTH_RATIO = 0.86
PASSPORT_FRAME_MAX_WIDTH = 520
```

The guide is centered inside the rendered camera preview and constrained by
both preview width and height. This mirrors banking-style document capture:
the device stays vertical while the document frame remains horizontal.

## Crop

The capture crop is based on the visible guide, not the full portrait video
frame.

`videoGuideSourceCrop()` reads:

- actual source dimensions: `video.videoWidth`, `video.videoHeight`
- rendered dimensions: `getBoundingClientRect()` or client dimensions
- guide rectangle from `passportGuideRect()`
- object-fit mode: `cover`

`mapRenderedGuideToSourceCrop()` converts rendered guide coordinates back into
source pixels while accounting for object-fit scaling and hidden source area.

## Canonical Crop

For selected images from native camera or library, the frontend uses
`centerCropForAspectRatio()` to produce a landscape passport crop with the same
aspect ratio as the live guide.

For live capture, the guide crop is used directly.

The crop must pass `isCropAspectRatioValid()` with tolerance `0.015`.

## Frame Selection

The camera loop analyzes a low-resolution crop of the live guide every `700 ms`.
The analysis canvas is:

``` text
width = 360
height = round(360 / 1.42)
```

The canvas receives only the guide crop, not the full camera frame.

When semantic preflight returns ready, the component stores a full-resolution
`ReadyCaptureCandidate` containing:

- capture timestamp;
- crop validity;
- document coverage;
- edge variance;
- border edge ratio;
- generated `File`;
- capture debug geometry.

## READY Detection

READY requires cooperation between local live quality and OpenAI live preflight.

Local live quality is intentionally permissive. It blocks only obvious critical
failures:

- almost completely dark image;
- severely blurred image;
- document clearly too small;
- document clearly cropped/outside the guide.

OpenAI live preflight then decides whether:

- a biodata page is detected;
- the document is inside the frame;
- the MRZ is likely visible;
- confidence is at least the configured threshold.

`isPassportLivePreflightReady()` currently requires:

``` text
biodataPageDetected = true
documentInsideFrame = true
mrzLikelyVisible = true
confidence >= 0.72
```

## READY Latch

`passport-ready-latch.ts` keeps READY stable for normal human interaction.

The current latch value is:

``` text
PASSPORT_READY_LATCH_MS = 1200
```

Temporary `IMAGE_BLURRED` degradation is ignored while the latch is active.
Tiny movement during pointer/touch down is also ignored for stability-only
degradation.

Critical structural issues can cancel the latch:

- `DOCUMENT_CROPPED`
- `DOCUMENT_TOO_SMALL`
- `PASSPORT_NOT_DETECTED`

## Auto Capture

`passport-auto-capture.ts` defines:

``` text
PASSPORT_AUTO_CAPTURE_DWELL_MS = 400
```

Auto Capture starts a timer when all timer preconditions are true. The timer
captures after 400 ms if no structural cancellation occurred.

Candidate freshness requires the candidate to be within the current READY latch
window and no older than the latch window length.

Candidate structural validity requires:

- `cropValid = true`
- `documentCoverage >= 0.12`
- `borderEdgeRatio <= 0.58`

Candidate selection prefers:

1. structurally valid candidate over invalid candidate;
2. larger document coverage when the difference is meaningful;
3. higher edge variance when sharpness difference is meaningful;
4. newest candidate when quality is equivalent.

## Manual Fallback

Manual Capture remains available. It calls the same `captureFromCamera()`
function with `mode = "manual"`.

Manual capture:

- cancels any pending Auto Capture timer;
- respects the same readiness latch;
- uses the best READY candidate when available;
- falls back to the current guide crop if no candidate is usable.

## Failure Recovery

Camera failures expose:

- Retry camera
- Use native camera
- Choose from library

Auto Capture failures do not loop indefinitely. The implementation marks auto
capture as failed for that camera session and shows:

``` text
Automatic capture failed. Use manual Capture.
```

Manual capture remains available.

------------------------------------------------------------------------

# OCR Pipeline

## Classification

Post-capture classification is called after `CAPTURED`.

Frontend:

``` text
classifyPassportForScan(file)
```

Backend:

``` text
POST /api/reception/passports/classify
```

The frontend sends:

- normalized full image;
- MRZ crop.

The backend runs OpenAI semantic classification and returns:

- `classification`
- `decision`
- `timing`
- `requestId`

Classification does not extract identity fields. It only decides whether the
image is suitable for passport OCR.

## OCR

When classification is accepted, the workflow enters `READY_FOR_OCR`.

The operator presses Scan Passport. OCR is not started automatically from the
READY state.

Frontend:

``` text
uploadPassportForReview(file)
```

Backend:

``` text
POST /api/reception/passports/ocr
```

The frontend sends:

- normalized full image;
- passport-number crop;
- MRZ crop.

The backend stores the image in R2 first, then runs OCR. If OCR fails after the
upload, the R2 object is deleted best-effort.

## MRZ

MRZ parsing is deterministic and implemented in `passport-mrz.service.ts`.

The parser expects TD3 passport MRZ lines. It validates:

- line lengths;
- supported MRZ characters;
- document type prefix;
- passport-number check digit;
- birth-date check digit;
- expiry-date check digit;
- optional personal-number check digit;
- composite check digit;
- normalized birth and expiry dates.

The parser returns both field values and validation issues.

## Consensus

`buildPassportConsensus()` merges:

- visual extraction;
- MRZ-focused extraction;
- deterministic parsed MRZ.

It produces field verification for:

- passport number;
- first name;
- last name;
- nationality;
- gender;
- birth date;
- expiry date.

Passport number is auto-verified only when:

- parsed MRZ passport number exists;
- MRZ is valid;
- MRZ passport-number check digit passes;
- MRZ extraction candidates match parsed MRZ;
- visual extraction candidates match parsed MRZ.

If this does not hold, the passport number enters `NEEDS_CONFIRMATION` or
`MISSING`.

## Verification

The conditional verifier is not part of the normal path. It is invoked only when
`verificationTriggerCode()` detects a critical condition:

- `MRZ_CHECKSUM_FAILED`
- `PASSPORT_NUMBER_CONFLICT`
- `MANDATORY_FIELD_MISSING`
- `CRITICAL_CHARACTER_UNCERTAIN`

The verifier is focused on passport-number conflict resolution. It receives only
focused crops and candidate values. It does not receive the full passport image
or unrelated identity fields.

Verifier timeout does not discard primary OCR results. The workflow proceeds to
Review with manual confirmation required.

## Review

Review is mandatory before persistence. OCR output is never written to
`booking_passports` automatically by the current main UI flow.

The review screen allows editing of extracted fields. Editing the passport
number marks that field as requiring confirmation.

If verifier timeout or conflict requires manual confirmation, the review screen
shows:

- current verification state;
- visual and MRZ candidates where available;
- issues;
- Confirm Passport Number button;
- collapsible Technical details.

## Save

Save persists only after review validation passes.

The backend validates:

- `objectKey` exists and starts with `passports/`;
- `passport.verification.consensus.fields` exists;
- mandatory TM30 fields are present;
- passport-number state is `AUTO_VERIFIED` or `MANUALLY_VERIFIED`;
- if `tm30Ready` is false, manual passport-number confirmation is required.

On success, a new row is inserted in `booking_passports`.

------------------------------------------------------------------------

# AI Architecture

## Models Used

The current repository uses these model constants:

- Live preflight: `gpt-5.6-luna`
- Post-capture classification: `gpt-5.6-terra`
- Visual OCR: `gpt-5.6-terra`
- MRZ OCR: `gpt-5.6-terra`
- Conditional verifier: `gpt-5.6-sol`

## Purpose of Each Model

`gpt-5.6-luna` is used for lightweight live camera preflight. It receives a
low-detail frame and returns only a strict JSON decision about whether a
passport biodata page appears inside the guide.

`gpt-5.6-terra` is used for post-capture document classification. It receives a
high-detail normalized image and optional MRZ crop, and returns only semantic
document suitability flags.

`gpt-5.6-terra` is also used for OCR:

- visual biodata extraction;
- MRZ-focused critical extraction.

`gpt-5.6-sol` is used conditionally for focused passport-number verification
when deterministic validation finds a critical conflict.

## Execution Order

Normal mobile flow:

``` text
Local guide crop analysis
    |
    v
OpenAI live preflight
    |
    v
Auto Capture / manual Capture
    |
    v
OpenAI classification
    |
    v
OpenAI visual OCR + MRZ OCR
    |
    v
Deterministic MRZ parsing
    |
    v
Consensus
    |
    v
Conditional verifier only if needed
    |
    v
Review
    |
    v
Save
```

## Conditional Execution

The expensive/strict stages are conditional:

- Live preflight runs only when local live quality sees a document-like guide
  crop and enough time has passed since the previous request.
- Classification runs only after a captured/selected file exists.
- OCR runs only after classification accepts the image.
- Conditional verifier runs only for critical conflicts.

## Failure Handling

AI errors are translated into structured API errors with request ids when
available. The UI maps them into recoverable workflow states.

Live preflight failure does not create a passport record. It produces guidance
and leaves fallback capture paths available.

Classification failure or rejection sends the workflow to `REJECTED`.

OCR failure sends the workflow to `OCR_FAILED`, where retry scan and retake are
available.

Verifier timeout opens Review with manual confirmation rather than blocking the
workflow.

## Timeout Strategy

Current backend timeouts:

- Live preflight: `5_000 ms`
- Classification: `8_000 ms`
- Overall OCR: `15_000 ms`
- Visual OCR stage: `6_000 ms`
- MRZ OCR stage: `6_000 ms`
- Conditional verifier: `7_000 ms`

## Cost Philosophy

The implementation favors correctness over minimum OpenAI token cost. It uses
AI where semantic understanding is valuable and deterministic validation where
mathematical correctness is possible.

The normal path avoids unnecessary verifier calls when primary OCR and MRZ
validation are already consistent.

------------------------------------------------------------------------

# State Machine

## Complete State Diagram

``` text
CLOSED
  |
  | OPEN
  v
CAMERA
  |
  | CAPTURE
  v
CAPTURED
  |
  | START_CLASSIFICATION
  v
CLASSIFYING
  |                         |
  | CLASSIFICATION_ACCEPTED | CLASSIFICATION_REJECTED
  v                         v
READY_FOR_OCR              REJECTED
  |                         |
  | START_OCR               | RETAKE
  v                         v
OCR_RUNNING  <------------- CAMERA
  |
  | OCR_SUCCESS
  v
REVIEW
  |
  | START_SAVE
  v
SAVING
  |                         |
  | SAVE_SUCCESS            | SAVE_FAILURE
  v                         v
COMPLETED                  SAVE_FAILED
                              |
                              | START_SAVE
                              v
                            SAVING

Any active phase -- CANCEL --> CLOSED
Any active non-terminal phase -- RETAKE --> CAMERA
OCR_FAILED -- START_OCR --> OCR_RUNNING
```

## Reducer Responsibilities

The reducer owns canonical workflow transitions. It rejects stale or invalid
transitions by returning the existing state.

It is responsible for:

- opening the workflow;
- accepting captures;
- moving from captured to classification;
- moving from classification to ready/rejected;
- running OCR from ready or OCR failure;
- moving OCR success to review;
- preserving data on OCR failure;
- starting save from review or save failure;
- completing on save success;
- preserving review data on save failure;
- returning to camera on retake;
- closing on cancel.

## Events

Reducer events:

- `OPEN`
- `CAPTURE`
- `START_CLASSIFICATION`
- `CLASSIFICATION_ACCEPTED`
- `CLASSIFICATION_REJECTED`
- `START_OCR`
- `OCR_SUCCESS`
- `OCR_FAILURE`
- `START_SAVE`
- `SAVE_SUCCESS`
- `SAVE_FAILURE`
- `RETAKE`
- `CANCEL`

## Transitions

Transitions are guarded by phase and `captureId`. Async results from old
capture attempts are ignored because the action capture id must match the
current state capture id.

## Recovery Paths

- From `REJECTED`: retake or choose another image.
- From `OCR_FAILED`: retry scan or retake.
- From `SAVE_FAILED`: edit/confirm fields and save again, retake, or cancel.
- From camera failure: retry camera, use native camera, or choose from library.

## Cancellation

Cancellation is global from active states. It closes the workflow and prevents
stale async results from mutating the active workflow because the active capture
id is incremented before closing.

## Retry Logic

There is no automatic OCR retry loop.

Retries are explicit operator actions:

- retry camera;
- retry scan after OCR failure;
- retake photo.

The verifier also does not automatically retry after timeout.

------------------------------------------------------------------------

# Data Flow

## End-to-End Flow

``` text
Reception Stay
    |
    | load passports by booking id
    v
Passport checklist row
    |
    | tap
    v
PassportWorkflow
    |
    | capture/select image
    v
Captured passport file
    |
    | classify
    v
Ready for OCR
    |
    | scan
    v
R2 object + OCR result
    |
    | review/edit
    v
Reviewed passport payload
    |
    | save
    v
booking_passports row
    |
    | refresh query
    v
Reception checklist completed when count >= 1
    |
    | TM30 export date query
    v
Official TM30 workbook row
```

## Camera

Live camera captures are cropped from the visible landscape guide. The camera
stream is stopped on cancel, successful capture, retry, or component unmount.

## Capture

Captured images become `File` objects named `passport-capture.jpg` in the
browser workflow. Native/library files are center-cropped to the passport guide
aspect ratio before classification.

## OCR

Before OCR upload, `reception.service.ts` prepares:

- `passport-ocr.jpg`: normalized full image, max long edge 1800;
- `passport-number-crop.jpg`: right/top passport-number region, max long edge
  1000;
- `passport-mrz-crop.jpg`: lower MRZ region, max long edge 1600.

Images are JPEG encoded and mildly normalized with brightness/contrast filter.

## Consensus

The backend returns a `PassportData` object with embedded `verification`.

The review screen uses that embedded verification object to explain passport
number status, manual confirmation needs, and given-name review issues.

## Review

Review edits update the in-memory draft only. The database is not touched until
Save.

## Save

Save posts the reviewed payload to the booking-specific endpoint. The backend
persists one new passport row and returns that row. The frontend appends it to
the query cache and invalidates the booking passport query.

## Database

The persistent relationship is:

``` text
bookings.beds24_booking_id
    |
    | one-to-many
    v
booking_passports.booking_id
```

## TM30

TM30 export reads only:

- bookings for the selected arrival date;
- operational booking statuses;
- passport rows with `tm30_status = 'READY'`.

Each passport row becomes one TM30 workbook row.

------------------------------------------------------------------------

# Database Mapping

## Table

The Passport Engine stores records in `booking_passports`.

One row represents one uploaded and saved passport linked to a Reception
booking id.

## Fields

`id`

Primary key. Autoincrement integer.

`booking_id`

The Reception booking identifier. It references `bookings.beds24_booking_id`.
The Passport Engine does not invent a separate booking identifier.

`object_key`

R2 object key for the stored passport image. It is unique and must use the
`passports/` prefix.

`source`

Workflow provenance. Records created through the real Reception OCR flow use:

``` text
reception_ocr_flow
```

Reception passport completion counts only records with this source.

`first_name`

The given names selected by OCR consensus/review. In the current implementation,
all given names may be stored together in this field.

`middle_name`

An optional separate middle-name field. The current OCR consensus maps passport
given names into `firstName`, and `passportDataFromValidation()` sets
`middleName` to `null`. If the operator edits the review field, the edited
middle name can be saved.

`last_name`

The surname/family name.

`passport_number`

The reviewed passport number.

`nationality`

The reviewed nationality. TM30 export converts this through the TM30 nationality
mapping.

`gender`

Reviewed gender/sex value.

`birth_date`

Reviewed date of birth.

`expiry_date`

Reviewed expiry date when available.

`document_type`

Document type from visual extraction or parsed MRZ.

`issuing_country`

Issuing country from visual extraction or parsed MRZ.

`mrz_line_1`

Stored MRZ line 1 candidate.

`mrz_line_2`

Stored MRZ line 2 candidate.

`mrz_validation_json`

JSON snapshot of deterministic MRZ validation.

`field_verification_json`

JSON snapshot of field consensus and verification state.

`manual_corrections_json`

JSON snapshot of manual corrections supplied with the save payload. The current
frontend posts the reviewed passport object; manual correction metadata remains
minimal.

`quality_gate_json`

JSON snapshot currently saved as:

``` json
{ "status": "ACCEPTED_FOR_OCR" }
```

`ocr_model`

Model identifier recorded from OCR validation.

`ocr_schema_version`

Schema version recorded by OCR validation.

`tm30_status`

TM30 readiness status:

- `NOT_READY`
- `READY`
- `EXPORTED`

The insert logic sets this to `READY` when `validation.consensus.tm30Ready` is
true, otherwise `NOT_READY`.

`created_by`

Authenticated user id that created the passport record.

`verified_by`

Authenticated user id that verified/saved the passport record.

`verified_at`

Timestamp recorded at save time.

`created_at`

Creation timestamp.

## Name Handling

The current implementation treats passport given names as a single given-name
value.

`passport-consensus.service.ts` selects the most complete given-name string from
visual extraction and MRZ. It preserves multiple given names in order. For
example, if the passport/MRZ contains two given names, the consensus value may
be:

``` text
STEFANO GIUSEPPE
```

That value is mapped to `PassportData.firstName`.

`PassportData.middleName` remains `null` unless manually edited in Review or
provided through another payload path.

This is intentional in the current frozen implementation. Passports and MRZ
represent given names as a combined field, and TM30 can accept the combined
given-name value in the first-name column for the current operational process.

## TM30 Mapping

`tm30-export.service.ts` maps passport rows into the workbook as:

``` text
Column A -> first_name
Column B -> middle_name
Column C -> last_name
Column D -> gender
Column E -> passport_number
Column F -> nationality converted to TM30 country code
Column G -> birth_date
Column H -> booking departure_date
Column I -> booking phone/mobile
```

Because all given names are currently stored in `first_name`, TM30 column A may
contain multiple given names and column B may be blank. This reflects the
current accepted operational rule.

------------------------------------------------------------------------

# API Layer

## Internal APIs

The frontend uses these service functions:

- `loadBookingPassports(bookingId)`
- `uploadPassportForReview(file)`
- `classifyPassportForScan(file)`
- `livePassportPreflight(file)`
- `saveBookingPassport(bookingId, objectKey, passport)`
- `discardPassportUpload(objectKey)`

`uploadBookingPassport(bookingId, file)` also exists and calls the
booking-scoped OCR endpoint. The current full review workflow uses the separate
OCR-then-save path.

## Server Endpoints

`POST /api/reception/passports/live-preflight`

Receives multipart form data with `passport`. Runs lightweight OpenAI live
preflight and returns:

- `success`
- `preflight`
- `ready`
- `timing`
- `requestId`

`POST /api/reception/passports/classify`

Receives multipart form data with `passport` and optional `mrzCrop`. Runs
post-capture classification and returns:

- `success`
- `classification`
- `decision`
- `timing`
- `requestId`

`POST /api/reception/passports/ocr`

Receives multipart form data with `passport`, optional `passportNumberCrop`,
and optional `mrzCrop`. Stores the image in R2, runs OCR, rolls back R2 on OCR
failure, and returns:

- `success`
- `objectKey`
- `passport`
- `timing`
- `requestId`

`POST /api/reception/passports/discard`

Receives JSON with `objectKey`. Deletes the R2 object best-effort through the
Passport Storage service.

`GET /api/reception/stays/:bookingId/passports`

Validates the Reception stay exists and returns saved passport records for the
booking.

`POST /api/reception/stays/:bookingId/passports`

Receives reviewed passport JSON and persists a passport record linked to the
booking.

`POST /api/reception/stays/:bookingId/passports/ocr`

Legacy/alternate booking-scoped endpoint that stores, OCRs, and persists in one
request. It exists in the Worker and is covered by tests, but the current
full-screen review workflow uses OCR first, then explicit Save.

## Validation

Upload validation:

- required `passport` file;
- accepted MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/heic`
  - `image/heif`
- accepted extensions:
  - `jpg`
  - `jpeg`
  - `png`
  - `heic`
  - `heif`
- max size: 10 MB per image/crop;
- unsupported extra file fields are rejected.

Review-save validation:

- object key is required;
- object key must start with `passports/`;
- passport data must pass `validatePassportData()`;
- embedded verification consensus is required;
- mandatory TM30 fields must exist;
- passport number must be auto-verified or manually verified;
- unresolved OCR inconsistency blocks save unless passport number is manually
  verified.

## Contracts

All passport API responses use structured JSON. Failures return:

``` text
success: false
error:
    code
    message
    requestId when applicable
```

Authentication is required through the existing Vanara session mechanism.
Reception passport endpoints require `movements` access.

------------------------------------------------------------------------

# Error Handling

## Recoverable Errors

Recoverable UI errors include:

- camera unavailable;
- camera permission denied;
- live preflight unavailable;
- classification rejection;
- OCR timeout;
- OCR parse/schema failure;
- OCR model failure;
- save validation failure.

Each recoverable error has a visible next action:

- retry camera;
- use native camera;
- choose from library;
- retake photo;
- retry scan;
- confirm passport number;
- edit missing field;
- save again.

## Fatal Errors

The workflow has no user-facing fatal trap state. Backend failures can prevent a
record from being saved, but the UI remains recoverable through retry, retake,
or cancel.

## Retry

Retries are explicit. There is no automatic retry loop for OCR or verifier.

## Retake

Retake creates a new capture id. Stale async responses from the previous
attempt are ignored.

## Manual Confirmation

Manual passport-number confirmation is required when passport number consensus
is unresolved. The review screen provides a Confirm Passport Number button.

After confirmation:

- passport-number state becomes `MANUALLY_VERIFIED`;
- source becomes `manual`;
- issues/conflicts are cleared for that field;
- Save can become enabled if no other blockers remain.

## Save Blockers

The Save button is disabled with an explicit reason:

- Saving is already in progress.
- Missing TM30 field.
- Passport number requires confirmation.

The UI should never leave the Save button disabled without explaining why.

## R2 Rollback

If OCR fails after R2 upload, the object is deleted best-effort.

If persistence fails after OCR upload, the object is also deleted best-effort.

Rollback failures are logged as warnings and do not mask the original error.

------------------------------------------------------------------------

# Performance

## Rendering

The workflow keeps camera state in refs where continuous mutable state is
needed:

- media stream;
- semantic request ids;
- semantic in-flight flag;
- ready latch timestamp;
- pointer activity;
- last READY crop;
- last READY candidate;
- auto-capture timer and lock.

This prevents high-frequency camera metadata from becoming React state.

## Camera

The live analysis loop runs every `700 ms` and analyzes only a low-resolution
guide crop. This limits CPU use, canvas reads, and battery impact.

The video stream is stopped on cleanup paths to release camera resources.

## Auto Capture

Auto Capture avoids duplicate timers and duplicate captures. It keeps one
pending timer at a time and uses a shared capture-in-flight lock for auto and
manual capture.

## Memory

Preview blob URLs are tracked and revoked on cancel/retake/unmount where
applicable.

The frontend normalizes images before upload to reduce network payload:

- OCR full image max long edge: 1800
- classification image max long edge: 1800
- passport-number crop max long edge: 1000
- MRZ crop max long edge: 1600

## Network

The workflow calls AI endpoints conditionally:

- live preflight only after local document-like detection and throttling;
- classification only after capture;
- OCR only after classification acceptance;
- verifier only when consensus detects a critical issue.

## Current Limitations

- There is no dedicated frontend test runner configured in `package.json`.
- The client bundle currently triggers a Vite chunk-size advisory during build.
- Live preflight depends on network/OpenAI availability.
- HEIC/HEIF validation accepts the MIME type, but browser decoding support is
  platform-dependent.

------------------------------------------------------------------------

# Testing

## Testing Strategy

The Passport Engine is tested through focused server-side tests and source-level
UI regression guards.

The tests cover deterministic utility behavior, backend services, API behavior,
and source-level guarantees for the UI workflow.

## Implemented Tests

Passport-specific tests include:

- `server/tests/passport-auto-capture.test.ts`
- `server/tests/passport-capture-state.test.ts`
- `server/tests/passport-consensus.test.ts`
- `server/tests/passport-crop.test.ts`
- `server/tests/passport-quality.test.ts`
- `server/tests/passport-retention.test.ts`

Reception source guards include Passport tests in:

- `server/tests/reception-ui-source.test.ts`

Reception API tests include Passport OCR, classification, persistence, and
rollback coverage in:

- `server/tests/reception.test.ts`

## Regression Coverage

Current regression coverage includes:

- workflow reducer transitions;
- stale capture result protection;
- cancel from active phases;
- retake recovery;
- OCR failure recovery;
- save failure preservation;
- READY latch behavior;
- Auto Capture dwell and duplicate protection;
- guide crop mapping from rendered video to source pixels;
- portrait-phone to landscape-passport geometry;
- post-capture crop aspect ratio;
- pixel-buffer dimension safety;
- low-resolution rejection;
- dark/blur/glare/crop/MRZ quality issues;
- live guidance false-negative reductions;
- subdued indoor light handling;
- semantic rejection of non-passport images;
- OCR strict schema validation;
- visual/MRZ parallel extraction;
- conditional verifier invocation;
- verifier timeout fallback to manual confirmation;
- R2 rollback after OCR or persistence failure;
- multiple passports per booking;
- Reception checklist derivation from backend passport count;
- TM30 export with one or multiple passports.

## Known Gaps

- There is no browser automation test for the actual native iPhone camera
  permission UI.
- There is no dedicated frontend unit test script in `package.json`.
- Real passport OCR quality still requires Product Owner/manual validation
  because the system intentionally avoids storing synthetic production passport
  records for demonstration.

------------------------------------------------------------------------

# Security

## Passport Images

Passport images are stored in Cloudflare R2 using the native Worker binding:

``` text
env.R2_STORAGE
```

The code does not use S3 compatibility credentials, AWS SDK, access keys, or
secret keys for R2.

## Temporary Files

The frontend creates browser `File` objects and blob preview URLs during the
workflow. Preview URLs are revoked when no longer needed.

The backend does not store original uploaded filenames.

## Storage

Object keys are generated by the Passport Storage service:

``` text
passports/YYYY-MM-DD/<uuid>.<extension>
```

Callers do not provide the prefix.

`getPassport`, `deletePassport`, and `existsPassport` normalize lookup keys into
the `passports/` prefix.

## Privacy

Passport API logging records operational metadata, timings, flags, request ids,
object keys for rollback events, and technical status. It should not log raw
passport images.

OCR timing logs avoid identity values. Some rollback logs include object keys
because those are operational storage references.

## Sensitive Data

OpenAI API key is accessed only through the Worker environment binding
`OPENAI_API_KEY`.

Passport endpoints require existing authenticated session access.

## Retention

Passport image lifecycle is handled by `passport-retention.service.ts`.

The configured default retention is 45 days through
`PASSPORT_RETENTION_DAYS`. Expired passport records are deleted with their R2
objects by the retention task.

------------------------------------------------------------------------

# Technical Decisions

## Full-screen Workflow Instead of Embedded Card

The passport flow uses a full-screen layer because camera capture, preview,
classification, OCR, review, save, and failure recovery are too complex for a
small changing card inside the check-in sheet.

The Reception sheet remains the entry and return point.

## Reducer-owned State Machine

The workflow uses a discriminated reducer to prevent hidden boolean state from
creating impossible combinations. Every major step has an explicit phase.

## Capture Id for Stale Async Protection

Every capture attempt has a `captureId`. Async classification, OCR, and save
callbacks check the active id before updating state. This prevents old network
responses from corrupting a newer attempt.

## AI-first Semantic Understanding

The module uses OpenAI for semantic document understanding because local edge
and brightness heuristics are not reliable passport detectors in real hotel
lighting.

## Lightweight Local Live Checks

Local checks are kept lightweight so the camera remains responsive and battery
friendly. They block only obvious failures and leave semantic decisions to AI.

## Landscape Guide on Portrait Phone

The phone remains vertical while the guide is landscape. This matches real
passport biodata-page geometry and avoids forcing staff to rotate the phone.

## Auto Capture as Primary Mobile Capture

Auto Capture avoids tap-induced camera shake. Manual Capture remains visible as
fallback.

## Review Before Persistence

OCR never silently completes the business workflow. The operator must review
and save.

## Multiple Passports per Booking

The database allows many passport rows per booking. This supports bookings with
multiple guests.

## Provenance-based Completion

Reception completion counts only passports from `reception_ocr_flow`. This
prevents seed, legacy, synthetic, or manual SQL records from becoming checklist
completion unless explicitly migrated into the real source.

## Combined Given Names

All given names can be stored in `first_name`. This follows passport/MRZ
semantics and is accepted for the current TM30 operational process.

## Native R2 Binding Only

Storage uses Cloudflare's native R2 binding. This avoids S3 credentials and
keeps storage access inside the Worker trust boundary.

## Best-effort Rollback

R2 rollback after OCR or persistence failure is best-effort. Rollback failure is
logged but does not hide the original user-facing error.

------------------------------------------------------------------------

# Known Limitations

- The current UI has no dedicated frontend test runner configured.
- Native iPhone camera behavior cannot be fully automated in the current test
  suite.
- HEIC/HEIF support depends on browser/platform image handling.
- The booking-scoped OCR-and-save endpoint still exists alongside the current
  review-first UI path.
- `manual_corrections_json` is structurally present but not richly populated by
  the current frontend.
- TM30 name mapping keeps all given names in column A when `middle_name` is
  blank.
- Live preflight and OCR require OpenAI availability.

------------------------------------------------------------------------

# Future Evolution

Future changes should preserve the current architecture:

- Add richer manual correction metadata without changing the core save contract.
- Add a passport detail/read-only review view for saved records using existing
  `BookingPassport` data.
- Add browser-level frontend tests if a reliable mobile camera simulation
  strategy becomes available.
- Add additional document-specific services for future document types without
  turning Passport Storage into a generic storage abstraction.
- Extend TM30 export behavior only through explicit TM30 mapping changes, not
  through OCR or camera logic.
- Improve retention observability without changing the R2 storage contract.

Any future extension should keep:

- Reception as the entry point;
- PassportWorkflow as the acquisition workflow;
- reducer phases explicit;
- OCR and persistence separated;
- review before save;
- one booking to many passports;
- R2 behind `uploadPassport`, `getPassport`, `deletePassport`,
  `existsPassport`.

------------------------------------------------------------------------

# Freeze Status

## Architecture Status

Frozen. The Passport Engine architecture is organized around a full-screen
workflow, explicit reducer state machine, AI-first document understanding,
review-before-save, native R2 storage, and D1 booking-passport persistence.

## Implementation Status

Functionally complete for the current Reception and TM30 MVP scope.

Implemented:

- live camera;
- native camera fallback;
- library fallback;
- landscape guide;
- guide crop mapping;
- Auto Capture;
- manual capture fallback;
- live preflight;
- post-capture classification;
- OCR;
- MRZ parsing and check digits;
- consensus;
- conditional verification;
- verifier timeout fallback;
- review/edit;
- save;
- multiple passports per booking;
- TM30-ready persistence;
- R2 retention cleanup.

## QA Status

Automated tests cover the main deterministic and API paths. Product Owner
manual validation remains required for real device camera behavior and real
passport OCR quality.

## Production Readiness

Production-ready for controlled internal Reception use at Vanara Central.

The module intentionally relies on staff review before saving and avoids
synthetic production passport records for demonstration.

## Known Limitations

The known limitations listed above are accepted for the current freeze.

## Freeze Decision

The Passport Engine is considered frozen for the current MVP architecture and
implementation. Future work should be limited to targeted bug fixes discovered
through real operational use, or additive extensions that preserve the frozen
architecture.
