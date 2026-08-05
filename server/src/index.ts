import { Hono, type Context } from "hono";
import { getDashboard, getDashboardOverview } from "./services/dashboard.service.js";
import { getStaffOverview, type StaffOverviewBindings } from "./services/staff-overview.service.js";
import { createRoomMaintenanceTicket, createRoomNote, getRoomDetail, normalizeRoomHousekeepingInput, normalizeRoomNoteInput, normalizeStartRoomStandardCleaningInput, startRoomStandardCleaning, updateRoomHousekeepingStatus, type RoomDetailBindings } from "./services/room-detail.service.js";
import { getRoomsWorkspaceOverview, type RoomsWorkspaceBindings } from "./services/rooms-workspace.service.js";
import { getTodayDashboard } from "./services/today.service.js";
import { syncProperties, type PropertySyncBindings } from "./services/property-sync.service.js";
import { syncOfferPrices, type OfferPricesSyncBindings } from "./services/offer-prices.service.js";
import { syncBookings, type BookingsSyncBindings } from "./services/bookings-sync.service.js";
import { listImportedMessages, syncMessages, type MessagesSyncBindings } from "./services/messages-sync.service.js";
import { getGuestMessageConversation, listGuestMessageConversations, type GuestMessagesWorkspaceBindings } from "./services/guest-messages-workspace.service.js";
import { approveMessageDraft, canReviewGuestMessages, editMessageDraft, MessageReviewError, rejectMessageDraft, type MessageReviewBindings } from "./services/message-review.service.js";
import { generatePendingWarapornDrafts, generateWarapornDraft, WarapornDraftError, type WarapornDraftBindings } from "./services/waraporn-draft.service.js";
import { syncAvailabilityCache, type AvailabilitySyncBindings } from "./services/availability-cache.service.js";
import { AvailabilityPricesError, getAvailabilityPrices } from "./services/availability-prices.service.js";
import { getAvailability } from "./services/availability-read.service.js";
import { getArrivalsDeparturesAgenda, type MovementsBindings } from "./services/arrivals-departures.service.js";
import { completeReceptionEvent, getReceptionOverview, getReceptionStay, normalizeCompleteReceptionCheckInInput, normalizeCompleteReceptionCheckOutInput, normalizeReceptionCheckInInput, normalizeReceptionCheckOutInput, normalizeReceptionNotesInput, receptionCompletionErrorStatus, resolveReceptionRoomAlert, updateReceptionAction, updateReceptionNotes, type ReceptionAlertType, type ReceptionBindings } from "./services/reception.service.js";
import { getHousekeepingOverview, housekeepingWorkflowErrorStatus, listAssignableHousekeepingUsers, normalizeHousekeepingAssignmentInput, normalizeHousekeepingChecklistInput, normalizeHousekeepingWorkflowInput, updateHousekeepingAssignment, updateHousekeepingChecklist, updateHousekeepingWorkflow, type HousekeepingBindings } from "./services/housekeeping-overview.service.js";
import { HousekeepingTaskDomainError } from "./services/housekeeping-task-domain.service.js";
import { getHousekeepingV2Overview, HousekeepingV2DateError, normalizeHousekeepingV2Date, type HousekeepingV2Bindings } from "./services/housekeeping-v2-overview.service.js";
import { assignHousekeepingV2Task, createHousekeepingV2OnDemandCleaning, forceHousekeepingV2RoomRelease, getHousekeepingV2RoomDetail, HousekeepingV2RoomError, markHousekeepingV2LinenRequired, normalizeForceReleaseInput, normalizeLinenRequiredInput, normalizeOnDemandCleaningInput, normalizeTaskActionInput, normalizeTaskAssignmentInput, performHousekeepingV2TaskAction, type HousekeepingV2RoomBindings } from "./services/housekeeping-v2-room.service.js";
import { normalizeRoomOperationalAvailabilityInput, updateRoomOperationalAvailability } from "./services/room-operational-state.service.js";
import { clearChatAnnouncement, createChatMessage, createGroupChat, getChatConversation, getChatUnreadSummary, listChatConversations, listChatMessages, listChatUsers, markChatConversationRead, normalizeAnnouncementInput, normalizeChatUserId, normalizeGroupChatInput, normalizeMessageInput, normalizeReactionInput, openPrivateChat, setChatAnnouncement, toggleChatMessageReaction, translateChatMessage, type ChatBindings } from "./services/chat.service.js";
import { addMaintenanceNote, addMaintenancePhoto, assignMaintenanceTicket, createMaintenanceTicket, getMaintenanceTicket, listAssignableMaintenanceUsers, listMaintenanceRoomTargets, listMaintenanceTickets, maintenanceErrorStatus, normalizeCreateMaintenanceTicketInput, normalizeMaintenanceAssignmentInput, normalizeMaintenanceNoteInput, normalizeMaintenanceOutOfServiceInput, normalizeMaintenancePhotoInput, normalizeMaintenanceStatusInput, normalizeUpdateMaintenanceTicketInput, transitionMaintenanceTicket, updateMaintenanceOutOfService, updateMaintenanceTicket, type MaintenanceBindings, type MaintenanceStatus } from "./services/maintenance.service.js";
import { createProcurementRequest, getOwnerProcurementRequest, listActiveProcurementItems, listProcurementRequests, normalizeCreateProcurementRequestInput, normalizeUpdateProcurementRequestInput, updateProcurementRequestStatus, type ProcurementBindings, type ProcurementStatus } from "./services/procurement.service.js";
import { extractPassportReview, PassportOcrError, validatePassportData, type PassportData, type PassportOcrBindings, type PassportReviewValidation } from "./services/passport-ocr.service.js";
import { classifyPassportImageWithTiming, decidePassportClassification, PassportClassificationError, type PassportClassificationBindings } from "./services/passport-classification.service.js";
import { isPassportLivePreflightReady, PassportLivePreflightError, runPassportLivePreflight, type PassportLivePreflightBindings } from "./services/passport-live-preflight.service.js";
import { deletePassport, uploadPassport, type PassportStorageBindings, type UploadedPassport } from "./services/passport-storage.service.js";
import { normalizePassportImageFormData, passportImageDiagnostics, PassportUploadError } from "./services/passport-upload.service.js";
import { createBookingPassport, listBookingPassports, type BookingPassportBindings } from "./services/booking-passports.service.js";
import { cleanupExpiredPassports, PASSPORT_RETENTION_CRON, type PassportRetentionBindings } from "./services/passport-retention.service.js";
import { generateTm30Workbook, listTm30PassportRows, normalizeTm30Date, type Tm30Bindings } from "./services/tm30-export.service.js";
import { authenticateBeds24Webhook, Beds24WebhookError, logBeds24WebhookFailure, parseBeds24WebhookRequest, recordBeds24Webhook, validateBeds24WebhookMethod, WEBHOOK_SECRET_HEADER, type Beds24WebhookBindings } from "./services/beds24-webhook.service.js";
import { buildWarapornKbRecoveryZip, getWarapornKbBackupManifest, listWarapornKbBackups, warapornKbBackupErrorStatus, type WarapornKbBackupBindings } from "./services/waraporn-kb-backup.service.js";
import {
  AuthenticationError,
  ForbiddenError,
  authOptions,
  canCompleteReception,
  createInitialOwner,
  createUser,
  disableUser,
  hasModulePermission,
  isOwner,
  listUsers,
  login,
  logout,
  makeExpiredSessionCookie,
  makeSessionCookie,
  normalizeCreateUserInput,
  normalizeLoginInput,
  normalizeUpdateUserInput,
  publicCurrentUser,
  requireModulePermission,
  requireOwner,
  requireView,
  resolveCurrentUser,
  updateUser,
  type AuthBindings,
  type CurrentUser,
  type ModuleKey,
} from "./services/current-user.service.js";

export interface Bindings extends PropertySyncBindings, OfferPricesSyncBindings, BookingsSyncBindings, MessagesSyncBindings, GuestMessagesWorkspaceBindings, MessageReviewBindings, WarapornDraftBindings, AvailabilitySyncBindings, HousekeepingBindings, HousekeepingV2Bindings, HousekeepingV2RoomBindings, MovementsBindings, ReceptionBindings, RoomDetailBindings, RoomsWorkspaceBindings, StaffOverviewBindings, ChatBindings, MaintenanceBindings, ProcurementBindings, AuthBindings, PassportStorageBindings, PassportOcrBindings, PassportClassificationBindings, PassportLivePreflightBindings, BookingPassportBindings, PassportRetentionBindings, Tm30Bindings, Beds24WebhookBindings, WarapornKbBackupBindings {
  BEDS24_BASE_URL: string;
  BEDS24_LONG_LIFE_TOKEN: string;
  WARAPORN_VECTOR_STORE_ID?: string;
  WARAPORN_KB_ARCHIVE: R2Bucket;
  VANARA_DATABASE_ENVIRONMENT: string;
  VANARA_DATABASE_NAME: string;
  VANARA_DATABASE_ID: string;
  DB: D1Database;
  ASSETS: { fetch: typeof fetch };
}

type AppContext = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();
const DEFAULT_BEDS24_BASE_URL = "https://api.beds24.com/v2";
const TM30_TEMPLATE_ASSET_PATH = "/TM30_template/Template-InformAccom-ImportExcel.xlsx";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function apiErrorStatus(error: unknown): 400 | 401 | 403 {
  if (error instanceof AuthenticationError) return 401;
  return error instanceof ForbiddenError ? 403 : 400;
}
function protectedErrorStatus(error: unknown): 401 | 403 | 500 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  return 500;
}
function housekeepingV2RoomErrorStatus(error: unknown): 400 | 401 | 403 | 404 | 409 | 500 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof HousekeepingV2RoomError) return error.status;
  if (error instanceof HousekeepingV2DateError) return 400;
  if (error instanceof HousekeepingTaskDomainError) return error.code === "housekeeping_task_stale_version" || error.code === "housekeeping_duplicate_task" ? 409 : 400;
  return 500;
}

function passportUploadErrorStatus(error: unknown): 400 | 401 | 403 | 413 | 502 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PassportUploadError && error.code === "passport_upload_too_large") return 413;
  if (error instanceof PassportUploadError && error.code === "passport_storage_failed") return 502;
  return error instanceof PassportOcrError || error instanceof PassportClassificationError || error instanceof PassportLivePreflightError ? 502 : 400;
}

function warapornDraftErrorStatus(error: unknown): 400 | 401 | 403 | 404 | 500 | 502 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof WarapornDraftError) return error.status;
  return 500;
}

function messageReviewErrorStatus(error: unknown): 400 | 401 | 403 | 404 | 409 | 500 | 502 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof MessageReviewError) return error.status;
  return 500;
}

function passportUploadError(error: unknown, requestId?: string): { code: string; message: string; requestId?: string } {
  if (error instanceof PassportOcrError) return { code: error.code, message: error.message, requestId };
  if (error instanceof PassportClassificationError) return { code: error.code, message: error.message, requestId };
  if (error instanceof PassportLivePreflightError) return { code: error.code, message: error.message, requestId };
  if (error instanceof PassportUploadError) return { code: error.code, message: error.message };
  if (error instanceof AuthenticationError) return { code: "authentication_required", message: error.message };
  if (error instanceof ForbiddenError) return { code: "forbidden", message: error.message };
  return { code: "passport_upload_invalid", message: errorMessage(error) };
}

function logPassportEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event));
}

function passportObjectKeyFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("objectKey" in payload) || typeof payload.objectKey !== "string") {
    throw new PassportUploadError("Passport object key is required.", "passport_upload_invalid");
  }
  const objectKey = payload.objectKey.trim();
  if (!objectKey.startsWith("passports/")) {
    throw new PassportUploadError("Passport object key is invalid.", "passport_upload_invalid");
  }
  return objectKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reviewedPassportPayload(payload: unknown): { objectKey: string; passport: PassportData; validation: PassportReviewValidation; manualCorrections: unknown } {
  if (!payload || typeof payload !== "object" || !("passport" in payload)) {
    throw new PassportUploadError("Reviewed passport payload is required.", "passport_upload_invalid");
  }
  const passport = validatePassportData(payload.passport);
  const verification = isRecord(payload.passport) ? payload.passport.verification : null;
  if (!isRecord(verification) || !isRecord(verification.consensus) || !isRecord(verification.consensus.fields)) {
    throw new PassportUploadError("Passport verification data is required.", "passport_upload_invalid");
  }
  const fields = verification.consensus.fields as Record<string, unknown>;
  const passportNumberField = isRecord(fields.passportNumber) ? fields.passportNumber : null;
  const passportNumberState = passportNumberField?.state;
  const tm30Ready = verification.consensus.tm30Ready === true;
  const requiredFields = [
    ["firstName", "first name", passport.firstName],
    ["lastName", "last name", passport.lastName],
    ["passportNumber", "passport number", passport.passportNumber],
    ["nationality", "nationality", passport.nationality],
    ["gender", "gender", passport.gender],
    ["birthDate", "birth date", passport.birthDate],
  ] as const;
  const missingField = requiredFields.find(([, , value]) => typeof value !== "string" || value.trim() === "");
  if (missingField) {
    throw new PassportUploadError(`TM30 mandatory field missing: ${missingField[1]}.`, "passport_upload_invalid");
  }
  if (passportNumberState !== "AUTO_VERIFIED" && passportNumberState !== "MANUALLY_VERIFIED") {
    throw new PassportUploadError("Passport number could not be verified.", "passport_upload_invalid");
  }
  if (!tm30Ready && passportNumberState !== "MANUALLY_VERIFIED") {
    throw new PassportUploadError("OCR inconsistency detected.", "passport_upload_invalid");
  }
  return {
    objectKey: passportObjectKeyFromPayload(payload),
    passport,
    validation: verification as unknown as PassportReviewValidation,
    manualCorrections: isRecord(payload) && "manualCorrections" in payload ? payload.manualCorrections : {},
  };
}

async function storePassportUpload(env: Bindings, upload: { bytes: ArrayBuffer; contentType: "image/jpeg" | "image/png" | "image/heic" | "image/heif" }): Promise<UploadedPassport> {
  try {
    return await uploadPassport(env, {
      body: upload.bytes,
      contentType: upload.contentType,
    });
  } catch {
    throw new PassportUploadError("Passport image storage failed.", "passport_storage_failed");
  }
}

async function rollbackPassportUpload(env: Bindings, objectKey: string, reason: "ocr_failed" | "passport_persistence_failed"): Promise<void> {
  try {
    await deletePassport(env, objectKey);
    console.log(JSON.stringify({
      event: "passport_orphan_rollback",
      objectKey,
      reason,
      status: "deleted",
    }));
  } catch (error) {
    console.warn(JSON.stringify({
      event: "passport_orphan_rollback_failed",
      objectKey,
      reason,
      level: "warning",
      error: errorMessage(error),
    }));
  }
}

function configured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSyncConfig(env: Bindings): void {
  if (!env.DB) {
    throw new Error("D1 binding DB is missing. Check wrangler.jsonc and run local dev through npm run dev.");
  }

  const baseUrl = env.BEDS24_BASE_URL?.trim() || DEFAULT_BEDS24_BASE_URL;
  try {
    new URL(baseUrl);
  } catch {
    throw new Error("BEDS24_BASE_URL is invalid. Set a valid URL in wrangler.jsonc or local config.");
  }

  if (!configured(env.BEDS24_LONG_LIFE_TOKEN)) {
    throw new Error("BEDS24_LONG_LIFE_TOKEN is missing. For local sync tests, create a root .dev.vars file. Do not commit secrets.");
  }
}

function conversationIdParam(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/i.test(trimmed)) {
    throw new Error("conversation id is invalid.");
  }
  return trimmed;
}
function positiveIntegerParam(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function authenticated(c: AppContext, module: ModuleKey, action: "access" | "edit" = "access"): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  requireView(user, module === "settings" || module === "owner-dashboard" ? "owner" : "staff");
  requireModulePermission(user, module, action);
  return user;
}

async function chatMember(c: AppContext): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  if (!user.views.includes("staff") && !user.views.includes("owner")) {
    throw new ForbiddenError("Staff or Owner access is required.");
  }
  if (!isOwner(user) && !hasModulePermission(user, "chat", "access")) {
    throw new ForbiddenError("Chat access is required.");
  }
  return user;
}

function canCreateMaintenanceIssue(user: CurrentUser): boolean {
  return (
    hasModulePermission(user, "maintenance", "access")
    || hasModulePermission(user, "rooms", "access")
    || hasModulePermission(user, "housekeeping", "access")
    || hasModulePermission(user, "movements", "access")
  );
}

function canEditMaintenanceIssue(user: CurrentUser): boolean {
  return ["Owner", "Manager", "Maintenance"].includes(user.role) && hasModulePermission(user, "maintenance", "edit");
}

async function maintenanceIssueCreator(c: AppContext): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  requireView(user, "staff");
  if (!canCreateMaintenanceIssue(user)) throw new ForbiddenError();
  return user;
}

async function maintenanceIssueContributor(c: AppContext): Promise<CurrentUser> {
  return maintenanceIssueCreator(c);
}

async function maintenanceIssueEditor(c: AppContext): Promise<CurrentUser> {
  const user = await authenticated(c, "maintenance", "edit");
  if (!canEditMaintenanceIssue(user)) throw new ForbiddenError("Only Maintenance, Manager or Owner may edit maintenance tickets.");
  return user;
}

async function owner(c: AppContext, action: "access" | "edit" = "access"): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  requireOwner(user);
  requireModulePermission(user, "settings", action);
  return user;
}

async function guestMessagesReader(c: AppContext): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  if (!user.views.includes("staff") && !user.views.includes("owner")) {
    throw new ForbiddenError("Staff view access is required.");
  }
  return user;
}

async function guestMessagesReviewer(c: AppContext): Promise<CurrentUser> {
  const user = await guestMessagesReader(c);
  if (!canReviewGuestMessages(user)) {
    throw new ForbiddenError("Messages review access is required.");
  }
  return user;
}

async function syncCommercialCaches(env: Bindings) {
  const offers = await syncOfferPrices(env, { batchDays: 30, startOffset: 0 });
  const availability = await syncAvailabilityCache(env, { batchDays: 30, startOffset: 0 });
  return { offers, availability };
}

async function healthHandler(c: AppContext) {
  let d1: { status: "ok" } | { status: "error"; message: string };

  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
    d1 = { status: "ok" };
  } catch (error) {
    d1 = {
      status: "error",
      message: `${errorMessage(error)}. The runtime must connect to the configured production D1 database; local fallback databases are disabled.`,
    };
  }

  const baseUrl = c.env.BEDS24_BASE_URL?.trim() || DEFAULT_BEDS24_BASE_URL;
  const baseUrlValid = (() => {
    try {
      new URL(baseUrl);
      return true;
    } catch {
      return false;
    }
  })();

  const ok = d1.status === "ok" && baseUrlValid;

  return c.json({
    ok,
    worker: "ok",
    api: "ok",
    d1,
    config: {
      beds24BaseUrl: baseUrlValid ? "configured" : "invalid",
      beds24Token: configured(c.env.BEDS24_LONG_LIFE_TOKEN) ? "configured" : "missing-local-only",
      databaseEnvironment: c.env.VANARA_DATABASE_ENVIRONMENT,
      databaseName: c.env.VANARA_DATABASE_NAME,
      databaseId: c.env.VANARA_DATABASE_ID,
      databaseBinding: "DB",
      databaseType: "Cloudflare D1",
    },
  }, ok ? 200 : 503);
}

async function loadTm30Template(c: AppContext): Promise<ArrayBuffer> {
  const response = await c.env.ASSETS.fetch(new Request(new URL(TM30_TEMPLATE_ASSET_PATH, c.req.url)));
  if (!response.ok) throw new Error("Official TM30 template is unavailable.");
  return response.arrayBuffer();
}

app.get("/", (c) => c.json({ status: "ok", project: "Vanara Central" }));
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.all("/api/webhooks/beds24", async (c) => {
  try {
    validateBeds24WebhookMethod(c.req.method);
    await authenticateBeds24Webhook(c.env, c.req.header(WEBHOOK_SECRET_HEADER) ?? null);
    const input = await parseBeds24WebhookRequest(c.req.raw);
    await recordBeds24Webhook(c.env, input);
    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Beds24WebhookError) {
      return c.json({ success: false, error: { code: error.code, message: error.message } }, error.status);
    }
    logBeds24WebhookFailure(error);
    return c.json({ success: false, error: { code: "webhook_internal_error", message: "Webhook could not be processed." } }, 500);
  }
});
app.post("/api/auth/bootstrap-owner", async (c) => {
  try {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
    if ((count?.total ?? 0) > 0) throw new ForbiddenError("Bootstrap is available only before the first user exists.");
    const payload = await c.req.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new Error("Bootstrap payload is required.");
    const input = normalizeCreateUserInput({
      fullName: "fullName" in payload ? payload.fullName : undefined,
      profilePhotoUrl: "profilePhotoUrl" in payload ? payload.profilePhotoUrl : null,
      role: "Owner",
      preferredLanguage: "preferredLanguage" in payload ? payload.preferredLanguage : "en",
      username: "username" in payload ? payload.username : undefined,
      email: "email" in payload ? payload.email : null,
      password: "password" in payload ? payload.password : undefined,
      status: "active",
      views: ["owner", "staff"],
      permissions: authOptions.modules.map((module) => ({ module, canAccess: true, canEdit: true })),
    });
    return c.json({ success: true, data: await createInitialOwner(c.env, input) }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});
app.post("/api/auth/login", async (c) => {
  try {
    const payload = await c.req.json().catch(() => null);
    const session = await login(c.env, normalizeLoginInput(payload));
    c.header("Set-Cookie", makeSessionCookie(session.token, session.expiresAt, new URL(c.req.url).protocol === "https:"));
    return c.json({ success: true, data: publicCurrentUser(session.user) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/auth/logout", async (c) => {
  await logout(c);
  c.header("Set-Cookie", makeExpiredSessionCookie(new URL(c.req.url).protocol === "https:"));
  return c.json({ success: true });
});

app.get("/api/current-user", async (c) => {
  try {
    return c.json({ success: true, data: publicCurrentUser(await resolveCurrentUser(c)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/users", async (c) => {
  try {
    await owner(c, "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listUsers(c.env) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/users", async (c) => {
  try {
    await owner(c, "edit");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await createUser(c.env, normalizeCreateUserInput(payload)) }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.patch("/api/users/:id", async (c) => {
  try {
    await owner(c, "edit");
    const payload = await c.req.json().catch(() => null);
    const user = await updateUser(c.env, c.req.param("id"), normalizeUpdateUserInput(payload));
    if (!user) return c.json({ success: false, error: "User not found" }, 404);
    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/users/:id/disable", async (c) => {
  try {
    await owner(c, "edit");
    const user = await disableUser(c.env, c.req.param("id"));
    if (!user) return c.json({ success: false, error: "User not found" }, 404);
    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/management/waraporn-kb-backups", async (c) => {
  try {
    await owner(c, "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listWarapornKbBackups(c.env) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, protectedErrorStatus(error));
  }
});

app.get("/api/management/waraporn-kb-backups/:backupId", async (c) => {
  try {
    await owner(c, "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getWarapornKbBackupManifest(c.env, c.req.param("backupId")) });
  } catch (error) {
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : warapornKbBackupErrorStatus(error);
    return c.json({ success: false, error: errorMessage(error) }, status);
  }
});

app.get("/api/management/waraporn-kb-backups/:backupId/download", async (c) => {
  try {
    await owner(c, "access");
    const result = await buildWarapornKbRecoveryZip(c.env, c.req.param("backupId"));
    c.header("Cache-Control", "no-store");
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="waraporn-kb-${result.backupId}.zip"`);
    const body = result.zip.buffer.slice(result.zip.byteOffset, result.zip.byteOffset + result.zip.byteLength) as ArrayBuffer;
    return c.body(body);
  } catch (error) {
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : warapornKbBackupErrorStatus(error);
    return c.json({ success: false, error: errorMessage(error) }, status);
  }
});

app.get("/api/availability", async (c) => {
  try {
    await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json({ success: true, data: await getAvailability(c.env, { from, to }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/availability-prices", async (c) => {
  try {
    await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    const arrival = c.req.query("arrival");
    const departure = c.req.query("departure");
    if (!arrival || !departure) throw new AvailabilityPricesError("availability_prices_missing_dates");
    return c.json({ success: true, data: await getAvailabilityPrices(c.env.DB, { arrival, departure }) });
  } catch (error) {
    if (error instanceof AvailabilityPricesError) return c.json({ success: false, error: error.code }, 400);
    if (error instanceof AuthenticationError || error instanceof ForbiddenError) {
      return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
    }
    console.error(JSON.stringify({ message: "Availability prices request failed", error: "availability_prices_unavailable", path: "/api/availability-prices" }));
    return c.json({ success: false, error: "availability_prices_unavailable" }, 500);
  }
});

app.get("/api/availability/unit/:id", async (c) => {
  try {
    await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    const unitId = positiveIntegerParam(c.req.param("id"), "unit id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json({ success: true, data: await getAvailability(c.env, { unitId, from, to }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/availability/date/:date", async (c) => {
  try {
    await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getAvailability(c.env, { date: c.req.param("date") }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/dashboard", async (c) => {
  try {
    await authenticated(c, "dashboard", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getDashboard(c.env) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Dashboard request failed",
      error: errorMessage(error),
      path: "/api/dashboard",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Dashboard data is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/dashboard/overview", async (c) => {
  try {
    await authenticated(c, "owner-dashboard", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getDashboardOverview(c.env) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Dashboard overview request failed",
      error: errorMessage(error),
      path: "/api/dashboard/overview",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Dashboard overview is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/owner/tm30/export", async (c) => {
  try {
    await authenticated(c, "owner-dashboard", "access");
    const date = normalizeTm30Date(c.req.query("date"));
    const template = await loadTm30Template(c);
    const rows = await listTm30PassportRows(c.env, date);
    const exportResult = await generateTm30Workbook(template, rows);
    if (exportResult.missingFields.length > 0) {
      return c.json({ success: false, error: "TM30 export has missing required fields.", missingFields: exportResult.missingFields }, 422);
    }
    c.header("Cache-Control", "no-store");
    c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    c.header("Content-Disposition", `attachment; filename="TM30-${date}.xlsx"`);
    const body = exportResult.workbook.buffer.slice(exportResult.workbook.byteOffset, exportResult.workbook.byteOffset + exportResult.workbook.byteLength) as ArrayBuffer;
    return c.body(body);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, protectedErrorStatus(error));
  }
});

app.get("/api/staff/overview", async (c) => {
  try {
    const user = await resolveCurrentUser(c);
    requireView(user, "staff");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getStaffOverview(c.env, user) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Staff overview request failed",
      error: errorMessage(error),
      path: "/api/staff/overview",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Staff overview is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});




app.get("/api/rooms", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getRoomsWorkspaceOverview(c.env, undefined, user) });
  } catch (error) {
    console.error(JSON.stringify({ message: "Rooms workspace request failed", error: errorMessage(error), path: "/api/rooms" }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Rooms workspace is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/rooms/:id", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const room = await getRoomDetail(c.env, roomId, user);

    if (!room) {
      return c.json({ success: false, error: "Room not found" }, 404);
    }

    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/rooms/:id/on-demand-cleaning", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    requireModulePermission(user, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    await createHousekeepingV2OnDemandCleaning(c.env, user, roomId, normalizeOnDemandCleaningInput(payload), c.req.query("date"));
    c.header("Cache-Control", "no-store");
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/rooms/:id/standard-cleaning/start", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    requireModulePermission(user, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => ({}));
    const room = await startRoomStandardCleaning(c.env, roomId, normalizeStartRoomStandardCleaningInput(payload), user);
    if (!room) return c.json({ success: false, error: "Room not found" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.patch("/api/rooms/:id/housekeeping", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const room = await updateRoomHousekeepingStatus(c.env, roomId, normalizeRoomHousekeepingInput(payload), user);
    if (!room) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: room });
  } catch (error) {
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError
      ? apiErrorStatus(error)
      : error instanceof HousekeepingTaskDomainError
        ? housekeepingV2RoomErrorStatus(error)
        : 400;
    return c.json({ success: false, error: errorMessage(error) }, status);
  }
});

app.patch("/api/rooms/:id/operational-availability", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const availability = await updateRoomOperationalAvailability(c.env, roomId, normalizeRoomOperationalAvailabilityInput(payload), user);
    if (!availability) return c.json({ success: false, error: "Room not found" }, 404);
    const room = await getRoomDetail(c.env, roomId, user);
    if (!room) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.post("/api/rooms/:id/notes", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const note = await createRoomNote(c.env, roomId, normalizeRoomNoteInput(payload), user);
    if (!note) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: note }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/rooms/:id/maintenance/tickets", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    if (!canCreateMaintenanceIssue(user)) throw new ForbiddenError();
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const ticket = await createRoomMaintenanceTicket(c.env, roomId, payload, user);
    if (!ticket) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: ticket }, 201);
  } catch (error) {
    const status = errorMessage(error) === "Room not found." ? 404 : apiErrorStatus(error);
    return c.json({ success: false, error: errorMessage(error) }, status);
  }
});
app.get("/api/movements", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getArrivalsDeparturesAgenda(c.env) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Arrivals and departures request failed",
      error: errorMessage(error),
      path: "/api/movements",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Arrivals and departures are temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/reception", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getReceptionOverview(c.env, c.req.query("date")) });
  } catch (error) {
    console.error(JSON.stringify({ message: "Reception overview request failed", error: errorMessage(error), path: "/api/reception" }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Reception data is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.post("/api/reception/passports/ocr", async (c) => {
  const requestId = crypto.randomUUID();
  try {
    await authenticated(c, "movements", "access");
    const upload = await normalizePassportImageFormData(await c.req.formData());
    const fullImage = passportImageDiagnostics(upload.bytes, upload.contentType);
    const passportNumberCrop = passportImageDiagnostics(upload.passportNumberCrop, upload.contentType);
    const mrzCrop = passportImageDiagnostics(upload.mrzCrop, upload.contentType);
    logPassportEvent({
      event: "passport_ocr_started",
      requestId,
      fullImage,
      passportNumberCrop,
      mrzCrop,
    });
    const stored = await storePassportUpload(c.env, upload);
    let passport: PassportData;
    try {
      passport = await extractPassportReview(c.env, {
        image: upload.bytes,
        contentType: upload.contentType,
        passportNumberCrop: upload.passportNumberCrop,
        mrzCrop: upload.mrzCrop,
      });
    } catch (error) {
      await rollbackPassportUpload(c.env, stored.objectKey, "ocr_failed");
      throw error;
    }
    logPassportEvent({
      event: "passport_ocr_timing",
      requestId,
      model: passport.verification?.timing?.model,
      pass1Ms: passport.verification?.timing?.pass1Ms,
      pass2Ms: passport.verification?.timing?.pass2Ms,
      consensusMs: passport.verification?.timing?.consensusMs,
      totalMs: passport.verification?.timing?.totalMs,
      pass1Status: passport.verification?.timing?.pass1Status,
      pass2Status: passport.verification?.timing?.pass2Status,
      pass1OpenAiRequestId: passport.verification?.timing?.pass1OpenAiRequestId,
      pass2OpenAiRequestId: passport.verification?.timing?.pass2OpenAiRequestId,
      pass1Attempts: passport.verification?.timing?.pass1Attempts,
      pass2Attempts: passport.verification?.timing?.pass2Attempts,
      deterministicValidationMs: passport.verification?.timing?.deterministicValidationMs,
      conditionalVerificationMs: passport.verification?.timing?.conditionalVerificationMs,
      conditionalVerificationInvoked: passport.verification?.timing?.conditionalVerificationInvoked,
      visualModel: passport.verification?.timing?.visualModel,
      mrzModel: passport.verification?.timing?.mrzModel,
      visualMs: passport.verification?.timing?.visualMs,
      mrzMs: passport.verification?.timing?.mrzMs,
      mergeMs: passport.verification?.timing?.mergeMs,
      verifierMs: passport.verification?.timing?.verifierMs,
      visualStatus: passport.verification?.timing?.visualStatus,
      mrzStatus: passport.verification?.timing?.mrzStatus,
      visualOpenAiRequestId: passport.verification?.timing?.visualOpenAiRequestId,
      mrzOpenAiRequestId: passport.verification?.timing?.mrzOpenAiRequestId,
      verifierOpenAiRequestId: passport.verification?.timing?.verifierOpenAiRequestId,
      verifierTriggerCode: passport.verification?.timing?.verifierTriggerCode,
      verifierTimedOut: passport.verification?.timing?.verifierTimedOut,
      manualConfirmationRequired: passport.verification?.timing?.manualConfirmationRequired,
      parseStatus: "ok",
    });

    return c.json({
      success: true,
      objectKey: stored.objectKey,
      passport,
      timing: passport.verification?.timing,
      requestId,
    });
  } catch (error) {
    logPassportEvent({
      event: "passport_ocr_failed",
      requestId,
      code: error instanceof PassportOcrError ? error.code : error instanceof PassportUploadError ? error.code : "unknown",
      stage: error instanceof PassportOcrError ? error.stage : undefined,
    });
    return c.json({ success: false, error: passportUploadError(error, requestId) }, passportUploadErrorStatus(error));
  }
});

app.post("/api/reception/passports/classify", async (c) => {
  const requestId = crypto.randomUUID();
  try {
    await authenticated(c, "movements", "access");
    const upload = await normalizePassportImageFormData(await c.req.formData());
    const image = passportImageDiagnostics(upload.bytes, upload.contentType);
    const mrzCrop = passportImageDiagnostics(upload.mrzCrop, upload.contentType);
    logPassportEvent({
      event: "passport_classification_started",
      requestId,
      image,
      mrzCrop,
    });
    const result = await classifyPassportImageWithTiming(c.env, {
      image: upload.bytes,
      contentType: upload.contentType,
      mrzCrop: upload.mrzCrop,
    });
    const decision = decidePassportClassification(result.classification);
    logPassportEvent({
      event: "passport_classification_timing",
      requestId,
      model: result.timing.model,
      classificationMs: result.timing.classificationMs,
      httpStatus: result.timing.httpStatus,
      openAiRequestId: result.timing.openAiRequestId,
      flags: {
        isPassport: result.classification.isPassport,
        isPassportBiodataPage: result.classification.isPassportBiodataPage,
        passportConfidence: result.classification.passportConfidence,
        passportComplete: result.classification.passportComplete,
        mrzVisible: result.classification.mrzVisible,
        excessiveGlare: result.classification.excessiveGlare,
        unreadableBlur: result.classification.unreadableBlur,
        unreadableDarkness: result.classification.unreadableDarkness,
      },
      decisionCode: decision.code,
    });
    return c.json({
      success: true,
      classification: result.classification,
      decision,
      timing: result.timing,
      requestId,
    });
  } catch (error) {
    logPassportEvent({
      event: "passport_classification_failed",
      requestId,
      code: error instanceof PassportClassificationError ? error.code : error instanceof PassportUploadError ? error.code : "unknown",
    });
    return c.json({ success: false, error: passportUploadError(error, requestId) }, passportUploadErrorStatus(error));
  }
});

app.post("/api/reception/passports/live-preflight", async (c) => {
  const requestId = crypto.randomUUID();
  try {
    await authenticated(c, "movements", "access");
    const upload = await normalizePassportImageFormData(await c.req.formData());
    const image = passportImageDiagnostics(upload.bytes, upload.contentType);
    const result = await runPassportLivePreflight(c.env, {
      image: upload.bytes,
      contentType: upload.contentType,
    });
    const ready = isPassportLivePreflightReady(result.preflight);
    logPassportEvent({
      event: "passport_live_preflight_timing",
      requestId,
      model: result.timing.model,
      livePreflightMs: result.timing.livePreflightMs,
      httpStatus: result.timing.httpStatus,
      openAiRequestId: result.timing.openAiRequestId,
      image,
      flags: {
        biodataPageDetected: result.preflight.biodataPageDetected,
        documentInsideFrame: result.preflight.documentInsideFrame,
        mrzLikelyVisible: result.preflight.mrzLikelyVisible,
        confidence: result.preflight.confidence,
      },
      instruction: result.preflight.instruction,
      ready,
    });
    return c.json({
      success: true,
      preflight: result.preflight,
      ready,
      timing: result.timing,
      requestId,
    });
  } catch (error) {
    logPassportEvent({
      event: "passport_live_preflight_failed",
      requestId,
      code: error instanceof PassportLivePreflightError ? error.code : error instanceof PassportUploadError ? error.code : "unknown",
    });
    return c.json({ success: false, error: passportUploadError(error, requestId) }, passportUploadErrorStatus(error));
  }
});

app.post("/api/reception/passports/discard", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    const objectKey = passportObjectKeyFromPayload(await c.req.json().catch(() => null));
    await deletePassport(c.env, objectKey);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: passportUploadError(error) }, passportUploadErrorStatus(error));
  }
});

app.get("/api/reception/stays/:bookingId/passports", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    c.header("Cache-Control", "no-store");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const stay = await getReceptionStay(c.env, bookingId);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: await listBookingPassports(c.env, bookingId) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/reception/stays/:bookingId/passports", async (c) => {
  let objectKey: string | null = null;
  try {
    const user = await authenticated(c, "movements", "access");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const stay = await getReceptionStay(c.env, bookingId);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    const input = reviewedPassportPayload(await c.req.json().catch(() => null));
    objectKey = input.objectKey;
    const passport = await createBookingPassport(c.env, {
      bookingId,
      objectKey: input.objectKey,
      passport: input.passport,
      validation: input.validation,
      manualCorrections: input.manualCorrections,
      createdBy: user.id,
      verifiedBy: user.id,
    });
    return c.json({ success: true, data: passport }, 201);
  } catch (error) {
    if (objectKey) await rollbackPassportUpload(c.env, objectKey, "passport_persistence_failed");
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.post("/api/reception/stays/:bookingId/passports/ocr", async (c) => {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticated(c, "movements", "access");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const stay = await getReceptionStay(c.env, bookingId);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    const upload = await normalizePassportImageFormData(await c.req.formData());
    logPassportEvent({
      event: "passport_ocr_started",
      requestId,
      fullImage: passportImageDiagnostics(upload.bytes, upload.contentType),
      passportNumberCrop: passportImageDiagnostics(upload.passportNumberCrop, upload.contentType),
      mrzCrop: passportImageDiagnostics(upload.mrzCrop, upload.contentType),
      bookingScoped: true,
    });
    const stored = await storePassportUpload(c.env, upload);
    let passport: PassportData;
    try {
      passport = await extractPassportReview(c.env, {
        image: upload.bytes,
        contentType: upload.contentType,
        passportNumberCrop: upload.passportNumberCrop,
        mrzCrop: upload.mrzCrop,
      });
      if (!passport.verification) throw new PassportOcrError("Passport verification data is missing.", "passport_schema_invalid");
      await createBookingPassport(c.env, {
        bookingId,
        objectKey: stored.objectKey,
        passport,
        validation: passport.verification,
        manualCorrections: {},
        createdBy: user.id,
        verifiedBy: user.id,
      });
    } catch (error) {
      await rollbackPassportUpload(c.env, stored.objectKey, error instanceof PassportOcrError ? "ocr_failed" : "passport_persistence_failed");
      throw error;
    }
    logPassportEvent({
      event: "passport_ocr_timing",
      requestId,
      model: passport.verification?.timing?.model,
      pass1Ms: passport.verification?.timing?.pass1Ms,
      pass2Ms: passport.verification?.timing?.pass2Ms,
      consensusMs: passport.verification?.timing?.consensusMs,
      totalMs: passport.verification?.timing?.totalMs,
      pass1Status: passport.verification?.timing?.pass1Status,
      pass2Status: passport.verification?.timing?.pass2Status,
      pass1OpenAiRequestId: passport.verification?.timing?.pass1OpenAiRequestId,
      pass2OpenAiRequestId: passport.verification?.timing?.pass2OpenAiRequestId,
      pass1Attempts: passport.verification?.timing?.pass1Attempts,
      pass2Attempts: passport.verification?.timing?.pass2Attempts,
      deterministicValidationMs: passport.verification?.timing?.deterministicValidationMs,
      conditionalVerificationMs: passport.verification?.timing?.conditionalVerificationMs,
      conditionalVerificationInvoked: passport.verification?.timing?.conditionalVerificationInvoked,
      visualModel: passport.verification?.timing?.visualModel,
      mrzModel: passport.verification?.timing?.mrzModel,
      visualMs: passport.verification?.timing?.visualMs,
      mrzMs: passport.verification?.timing?.mrzMs,
      mergeMs: passport.verification?.timing?.mergeMs,
      verifierMs: passport.verification?.timing?.verifierMs,
      visualStatus: passport.verification?.timing?.visualStatus,
      mrzStatus: passport.verification?.timing?.mrzStatus,
      visualOpenAiRequestId: passport.verification?.timing?.visualOpenAiRequestId,
      mrzOpenAiRequestId: passport.verification?.timing?.mrzOpenAiRequestId,
      verifierOpenAiRequestId: passport.verification?.timing?.verifierOpenAiRequestId,
      verifierTriggerCode: passport.verification?.timing?.verifierTriggerCode,
      verifierTimedOut: passport.verification?.timing?.verifierTimedOut,
      manualConfirmationRequired: passport.verification?.timing?.manualConfirmationRequired,
      parseStatus: "ok",
    });

    return c.json({
      success: true,
      objectKey: stored.objectKey,
      passport,
      timing: passport.verification?.timing,
      requestId,
    });
  } catch (error) {
    logPassportEvent({
      event: "passport_ocr_failed",
      requestId,
      code: error instanceof PassportOcrError ? error.code : error instanceof PassportUploadError ? error.code : "unknown",
      stage: error instanceof PassportOcrError ? error.stage : undefined,
      bookingScoped: true,
    });
    return c.json({ success: false, error: passportUploadError(error, requestId) }, passportUploadErrorStatus(error));
  }
});

app.get("/api/reception/stays/:bookingId", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    c.header("Cache-Control", "no-store");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const stay = await getReceptionStay(c.env, bookingId);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.patch("/api/reception/stays/:bookingId/check-in", async (c) => {
  try {
    const user = await authenticated(c, "movements", "edit");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const payload = await c.req.json().catch(() => null);
    const stay = await updateReceptionAction(c.env, bookingId, normalizeReceptionCheckInInput(payload), user);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/reception/stays/:bookingId/check-in-completed", async (c) => {
  try {
    const user = await authenticated(c, "movements", "access");
    if (!canCompleteReception(user)) throw new ForbiddenError();
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const payload = await c.req.json().catch(() => ({}));
    const stay = await completeReceptionEvent(c.env, bookingId, "check-in", user, normalizeCompleteReceptionCheckInInput(payload));
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : receptionCompletionErrorStatus(error));
  }
});

app.patch("/api/reception/stays/:bookingId/check-out", async (c) => {
  try {
    const user = await authenticated(c, "movements", "edit");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const payload = await c.req.json().catch(() => null);
    const stay = await updateReceptionAction(c.env, bookingId, normalizeReceptionCheckOutInput(payload), user);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/reception/stays/:bookingId/check-out-completed", async (c) => {
  try {
    const user = await authenticated(c, "movements", "access");
    if (!canCompleteReception(user)) throw new ForbiddenError();
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const payload = await c.req.json().catch(() => ({}));
    const stay = await completeReceptionEvent(c.env, bookingId, "check-out", user, normalizeCompleteReceptionCheckOutInput(payload));
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : receptionCompletionErrorStatus(error));
  }
});

app.post("/api/reception/stays/:bookingId/alerts/:type/resolve", async (c) => {
  try {
    const user = await authenticated(c, "movements", "access");
    if (!canCompleteReception(user)) throw new ForbiddenError();
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const type = c.req.param("type") as ReceptionAlertType;
    if (type !== "passport_missing" && type !== "deposit_pending") throw new Error("Reception alert type is invalid.");
    const stay = await resolveReceptionRoomAlert(c.env, bookingId, type, user);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : receptionCompletionErrorStatus(error));
  }
});

app.post("/api/reception/stays/:bookingId/notes", async (c) => {
  try {
    const user = await authenticated(c, "movements", "edit");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const payload = await c.req.json().catch(() => null);
    const stay = await updateReceptionNotes(c.env, bookingId, normalizeReceptionNotesInput(payload), user);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    return c.json({ success: true, data: stay });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});
app.get("/api/housekeeping", async (c) => {
  try {
    await authenticated(c, "housekeeping", "access");
    c.header("Cache-Control", "no-store");
    return c.json({
      success: true,
      data: await getHousekeepingOverview(c.env),
    });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Housekeeping overview request failed",
      error: errorMessage(error),
      path: "/api/housekeeping",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Housekeeping data is temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/housekeeping/v2/summary", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "access");
    const date = normalizeHousekeepingV2Date(c.req.query("date"));
    c.header("Cache-Control", "no-store");
    const overview = await getHousekeepingV2Overview(c.env, user, date);
    return c.json({
      success: true,
      data: overview.summary,
      meta: {
        operationalDate: overview.operationalDate,
        generatedAt: overview.generatedAt,
        generation: overview.meta.generation,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Housekeeping v2 summary request failed", error: errorMessage(error), path: "/api/housekeeping/v2/summary" }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError || error instanceof HousekeepingV2DateError ? errorMessage(error) : "Housekeeping summary is temporarily unavailable",
    }, error instanceof HousekeepingV2DateError ? 400 : protectedErrorStatus(error));
  }
});

app.get("/api/housekeeping/v2/tasks", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "access");
    const date = normalizeHousekeepingV2Date(c.req.query("date"));
    c.header("Cache-Control", "no-store");
    return c.json({
      success: true,
      data: await getHousekeepingV2Overview(c.env, user, date),
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "Housekeeping v2 tasks request failed", error: errorMessage(error), path: "/api/housekeeping/v2/tasks" }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError || error instanceof HousekeepingV2DateError ? errorMessage(error) : "Housekeeping tasks are temporarily unavailable",
    }, error instanceof HousekeepingV2DateError ? 400 : protectedErrorStatus(error));
  }
});

app.get("/api/housekeeping/v2/rooms/:unitId", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "access");
    const unitId = positiveIntegerParam(c.req.param("unitId"), "room id");
    const room = await getHousekeepingV2RoomDetail(c.env, user, unitId, c.req.query("date"));
    if (!room) return c.json({ success: false, error: "Room not found" }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: room });
  } catch (error) {
    console.error(JSON.stringify({ message: "Housekeeping v2 room request failed", error: errorMessage(error), path: "/api/housekeeping/v2/rooms/:unitId" }));
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/rooms/:unitId/on-demand-cleaning", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const unitId = positiveIntegerParam(c.req.param("unitId"), "room id");
    const payload = await c.req.json().catch(() => null);
    const room = await createHousekeepingV2OnDemandCleaning(c.env, user, unitId, normalizeOnDemandCleaningInput(payload), c.req.query("date"));
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/rooms/:unitId/linen-required", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const unitId = positiveIntegerParam(c.req.param("unitId"), "room id");
    const payload = await c.req.json().catch(() => null);
    const room = await markHousekeepingV2LinenRequired(c.env, user, unitId, normalizeLinenRequiredInput(payload), c.req.query("date"));
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/claim", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "claim", normalizeTaskActionInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.patch("/api/housekeeping/v2/tasks/:taskId/assignment", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    requireOwner(user);
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await assignHousekeepingV2Task(c.env, user, taskId, normalizeTaskAssignmentInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/release-claim", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "release-claim", normalizeTaskActionInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/start", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "start", normalizeTaskActionInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/complete", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "complete", normalizeTaskActionInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/skip", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "skip", normalizeTaskActionInput(payload, { reasonRequired: true })) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/cancel", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "cancel", normalizeTaskActionInput(payload, { reasonRequired: true })) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/reopen", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await performHousekeepingV2TaskAction(c.env, user, taskId, "reopen", normalizeTaskActionInput(payload, { reasonRequired: true })) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.post("/api/housekeeping/v2/tasks/:taskId/force-release", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    requireOwner(user);
    const taskId = positiveIntegerParam(c.req.param("taskId"), "task id");
    const payload = await c.req.json().catch(() => null);
    return c.json({ success: true, data: await forceHousekeepingV2RoomRelease(c.env, user, taskId, normalizeForceReleaseInput(payload)) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, housekeepingV2RoomErrorStatus(error));
  }
});

app.get("/api/housekeeping/assignable-users", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listAssignableHousekeepingUsers(c.env, user) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : housekeepingWorkflowErrorStatus(error));
  }
});

app.patch("/api/housekeeping/rooms/:id", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const overview = await updateHousekeepingWorkflow(c.env, roomId, normalizeHousekeepingWorkflowInput(payload), user);
    if (!overview) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: overview });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : housekeepingWorkflowErrorStatus(error));
  }
});

app.patch("/api/housekeeping/rooms/:id/assignment", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const overview = await updateHousekeepingAssignment(c.env, roomId, normalizeHousekeepingAssignmentInput(payload), user);
    if (!overview) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: overview });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : housekeepingWorkflowErrorStatus(error));
  }
});

app.patch("/api/housekeeping/rooms/:id/checklist", async (c) => {
  try {
    const user = await authenticated(c, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const overview = await updateHousekeepingChecklist(c.env, roomId, normalizeHousekeepingChecklistInput(payload), user);
    if (!overview) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: overview });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});
app.get("/api/procurement/items", async (c) => {
  try {
    await authenticated(c, "procurement", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listActiveProcurementItems(c.env) });
  } catch (error) {
    console.error(JSON.stringify({ message: "Procurement items request failed", error: errorMessage(error), path: "/api/procurement/items" }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Supply items are temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.post("/api/procurement/requests", async (c) => {
  try {
    const payload = await c.req.json().catch(() => null);
    const input = normalizeCreateProcurementRequestInput(payload);
    const user = await authenticated(c, "procurement", "access");
    const request = await createProcurementRequest(c.env, input, user);
    return c.json({ success: true, data: request }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/procurement/requests", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const user = await authenticated(c, "procurement", "access");
    const status = c.req.query("status") as ProcurementStatus | "all" | undefined;
    return c.json({ success: true, data: await listProcurementRequests(c.env, user, status) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/procurement/requests/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const user = await authenticated(c, "procurement", "access");
    const requestId = positiveIntegerParam(c.req.param("id"), "request id");
    const request = await getOwnerProcurementRequest(c.env, requestId, user);
    if (!request) return c.json({ success: false, error: "Supply request not found" }, 404);
    return c.json({ success: true, data: request });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.patch("/api/procurement/requests/:id", async (c) => {
  try {
    const user = await authenticated(c, "procurement", "edit");
    const requestId = positiveIntegerParam(c.req.param("id"), "request id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeUpdateProcurementRequestInput(payload);
    const request = await updateProcurementRequestStatus(c.env, requestId, input, user);
    if (!request) return c.json({ success: false, error: "Supply request not found" }, 404);
    return c.json({ success: true, data: request });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});
app.get("/api/maintenance/tickets", async (c) => {
  try {
    await authenticated(c, "maintenance", "access");
    c.header("Cache-Control", "no-store");
    const status = c.req.query("status") as MaintenanceStatus | "All" | undefined;
    const search = c.req.query("search");
    return c.json({ success: true, data: await listMaintenanceTickets(c.env, { status, search }) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Maintenance tickets request failed",
      error: errorMessage(error),
      path: "/api/maintenance/tickets",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Maintenance tickets are temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/maintenance/assignable-users", async (c) => {
  try {
    await maintenanceIssueCreator(c);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listAssignableMaintenanceUsers(c.env) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/maintenance/rooms", async (c) => {
  try {
    await maintenanceIssueCreator(c);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listMaintenanceRoomTargets(c.env) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/maintenance/tickets/:id", async (c) => {
  try {
    await authenticated(c, "maintenance", "access");
    c.header("Cache-Control", "no-store");
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const ticket = await getMaintenanceTicket(c.env, ticketId);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/maintenance/tickets", async (c) => {
  try {
    const payload = await c.req.json().catch(() => null);
    const input = normalizeCreateMaintenanceTicketInput(payload);
    const user = await maintenanceIssueCreator(c);
    const ticket = await createMaintenanceTicket(c.env, input, user);
    return c.json({ success: true, data: ticket }, 201);
  } catch (error) {
    const status = errorMessage(error) === "Room not found." ? 404 : apiErrorStatus(error);
    return c.json({ success: false, error: errorMessage(error) }, status);
  }
});

app.patch("/api/maintenance/tickets/:id", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeUpdateMaintenanceTicketInput(payload);
    const user = await maintenanceIssueEditor(c);
    const ticket = await updateMaintenanceTicket(c.env, ticketId, input, user);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});

app.patch("/api/maintenance/tickets/:id/assignment", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenanceAssignmentInput(payload);
    const user = await maintenanceIssueEditor(c);
    const ticket = await assignMaintenanceTicket(c.env, ticketId, input, user);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});

app.patch("/api/maintenance/tickets/:id/status", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenanceStatusInput(payload);
    const user = await maintenanceIssueEditor(c);
    const ticket = await transitionMaintenanceTicket(c.env, ticketId, input, user);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});

app.patch("/api/maintenance/tickets/:id/out-of-service", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenanceOutOfServiceInput(payload);
    const user = await maintenanceIssueEditor(c);
    const ticket = await updateMaintenanceOutOfService(c.env, ticketId, input, user);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});

app.post("/api/maintenance/tickets/:id/notes", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenanceNoteInput(payload);
    const user = await maintenanceIssueContributor(c);
    const note = await addMaintenanceNote(c.env, ticketId, input, user);
    if (!note) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: note }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});

app.post("/api/maintenance/tickets/:id/photos", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenancePhotoInput(payload);
    const user = await maintenanceIssueContributor(c);
    const photo = await addMaintenancePhoto(c.env, ticketId, input, user);
    if (!photo) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: photo }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : maintenanceErrorStatus(error));
  }
});
app.get("/api/chat/conversations", async (c) => {
  try {
    const user = await chatMember(c);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listChatConversations(c.env, user) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Chat conversations request failed",
      error: errorMessage(error),
      path: "/api/chat/conversations",
    }));
    return c.json({
      success: false,
      error: error instanceof AuthenticationError || error instanceof ForbiddenError ? errorMessage(error) : "Chat conversations are temporarily unavailable",
    }, protectedErrorStatus(error));
  }
});

app.get("/api/chat/summary", async (c) => {
  try {
    const user = await chatMember(c);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getChatUnreadSummary(c.env, user) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, protectedErrorStatus(error));
  }
});

app.get("/api/chat/users", async (c) => {
  try {
    const user = await chatMember(c);
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listChatUsers(c.env, user) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, protectedErrorStatus(error));
  }
});

app.post("/api/chat/private", async (c) => {
  try {
    const user = await chatMember(c);
    const payload = await c.req.json().catch(() => null);
    const targetUserId = normalizeChatUserId(payload);
    const conversation = await openPrivateChat(c.env, user, targetUserId);
    return c.json({ success: true, data: conversation }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.post("/api/chat/groups", async (c) => {
  try {
    const user = await chatMember(c);
    const payload = await c.req.json().catch(() => null);
    const input = normalizeGroupChatInput(payload);
    const conversation = await createGroupChat(c.env, user, input);
    return c.json({ success: true, data: conversation }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.get("/api/chat/conversations/:id", async (c) => {
  try {
    const user = await chatMember(c);
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId, user);

    if (!conversation) {
      return c.json({ success: false, error: "Conversation not found" }, 404);
    }

    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/chat/conversations/:id/messages", async (c) => {
  try {
    const user = await chatMember(c);
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId, user);

    if (!conversation) {
      return c.json({ success: false, error: "Conversation not found" }, 404);
    }

    return c.json({ success: true, data: await listChatMessages(c.env, conversationId, user) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/chat/conversations/:id/messages", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMessageInput(payload);
    const user = await chatMember(c);
    const message = await createChatMessage(c.env, conversationId, user, input);
    return c.json({ success: true, data: message }, 201);
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : message === "Conversation not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
  }
});

app.post("/api/chat/conversations/:id/messages/:messageId/reactions", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const messageId = positiveIntegerParam(c.req.param("messageId"), "message id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeReactionInput(payload);
    const user = await chatMember(c);
    const message = await toggleChatMessageReaction(c.env, conversationId, messageId, user, input);
    return c.json({ success: true, data: message });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : message === "Message not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
  }
});

app.post("/api/chat/conversations/:id/messages/:messageId/translate", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const messageId = positiveIntegerParam(c.req.param("messageId"), "message id");
    const user = await chatMember(c);
    const message = await translateChatMessage(c.env, conversationId, messageId, user);
    return c.json({ success: true, data: message });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError
      ? apiErrorStatus(error)
      : message === "Message not found."
        ? 404
        : message === "translation_unavailable"
          ? 503
          : 400;
    return c.json({ success: false, error: message }, status);
  }
});

app.post("/api/chat/conversations/:id/announcement", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const payload = await c.req.json().catch(() => null);
    const input = normalizeAnnouncementInput(payload);
    const user = await chatMember(c);
    const conversation = await setChatAnnouncement(c.env, conversationId, user, input);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : message === "Message not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
  }
});

app.delete("/api/chat/conversations/:id/announcement", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const user = await chatMember(c);
    const conversation = await clearChatAnnouncement(c.env, conversationId, user);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : 400);
  }
});

app.post("/api/chat/conversations/:id/read", async (c) => {
  try {
    const user = await chatMember(c);
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await markChatConversationRead(c.env, conversationId, user);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : message === "Chat conversation not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
  }
});

app.get("/api/messages/conversations", async (c) => {
  try {
    await guestMessagesReader(c);
    c.header("Cache-Control", "no-store");
    const search = c.req.query("search");
    const inbox = await listGuestMessageConversations(c.env, { search });
    return c.json({ success: true, data: inbox });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/messages/conversations/:conversationId", async (c) => {
  try {
    const user = await guestMessagesReader(c);
    c.header("Cache-Control", "no-store");
    const conversationId = positiveIntegerParam(c.req.param("conversationId"), "conversation id");
    const conversation = await getGuestMessageConversation(c.env, conversationId, user);
    if (!conversation) return c.json({ success: false, error: "Conversation not found" }, 404);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.patch("/api/messages/drafts/:draftId", async (c) => {
  try {
    const user = await guestMessagesReviewer(c);
    const draftId = positiveIntegerParam(c.req.param("draftId"), "draft id");
    const payload = await c.req.json().catch(() => null);
    const draft = await editMessageDraft(c.env, draftId, user, payload && typeof payload === "object" && "draftText" in payload ? payload.draftText : null);
    const conversation = await getGuestMessageConversation(c.env, Number(draft.conversationId), user);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, messageReviewErrorStatus(error));
  }
});

app.post("/api/messages/drafts/:draftId/approve", async (c) => {
  try {
    const user = await guestMessagesReviewer(c);
    const draftId = positiveIntegerParam(c.req.param("draftId"), "draft id");
    const draft = await approveMessageDraft(c.env, draftId, user);
    const conversation = await getGuestMessageConversation(c.env, Number(draft.conversationId), user);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, messageReviewErrorStatus(error));
  }
});

app.post("/api/messages/drafts/:draftId/reject", async (c) => {
  try {
    const user = await guestMessagesReviewer(c);
    const draftId = positiveIntegerParam(c.req.param("draftId"), "draft id");
    const payload = await c.req.json().catch(() => null);
    const draft = await rejectMessageDraft(c.env, draftId, user, payload && typeof payload === "object" && "reason" in payload ? payload.reason : null);
    const conversation = await getGuestMessageConversation(c.env, Number(draft.conversationId), user);
    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, messageReviewErrorStatus(error));
  }
});

app.get("/api/messages", async (c) => {
  try {
    await owner(c);
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const messages = await listImportedMessages(c.env, limit);
    return c.json({ success: true, data: messages });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/messages/:messageId/generate", async (c) => {
  try {
    await owner(c, "edit");
    const messageId = positiveIntegerParam(c.req.param("messageId"), "message id");
    const draft = await generateWarapornDraft(c.env, messageId);
    return c.json({ success: true, data: draft });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, warapornDraftErrorStatus(error));
  }
});

app.get("/today", async (c) => {
  try { await authenticated(c, "dashboard", "access"); return c.json(await getTodayDashboard(c.env)); }
  catch (error) {
    console.error("Today dashboard failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/properties", async (c) => {
  try { await owner(c, "edit"); validateSyncConfig(c.env); return c.json(await syncProperties(c.env)); }
  catch (error) {
    console.error("Properties sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/offers", async (c) => {
  try { await owner(c, "edit"); validateSyncConfig(c.env); return c.json(await syncOfferPrices(c.env, { batchDays: 30, startOffset: 0 })); }
  catch (error) {
    console.error("Offer prices sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/bookings", async (c) => {
  try { await owner(c, "edit"); validateSyncConfig(c.env); return c.json(await syncBookings(c.env)); }
  catch (error) {
    console.error("Bookings sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/messages", async (c) => {
  try {
    await owner(c, "edit");
    validateSyncConfig(c.env);
    const sync = await syncMessages(c.env);
    const generateDrafts = c.req.query("generateDrafts") !== "false";
    const drafts = generateDrafts
      ? await generatePendingWarapornDrafts(c.env)
      : { attempted: 0, generated: 0, reused: 0, failed: 0, draftIds: [] };
    return c.json({ ...sync, drafts });
  }
  catch (error) {
    console.error("Messages sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/availability", async (c) => {
  try {
    await owner(c, "edit");
    validateSyncConfig(c.env);
    const batchDays = c.req.query("batchDays") ? Number(c.req.query("batchDays")) : undefined;
    const startOffset = c.req.query("startOffset") ? Number(c.req.query("startOffset")) : undefined;
    return c.json(await syncAvailabilityCache(c.env, { batchDays, startOffset }));
  } catch (error) {
    console.error("Availability cache sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/sync/bootstrap", async (c) => {
  try {
    await owner(c, "edit");
    validateSyncConfig(c.env);
    const properties = await syncProperties(c.env);
    const bookings = await syncBookings(c.env);
    const { offers, availability } = await syncCommercialCaches(c.env);
    return c.json({ ok: true, properties, bookings, offers, availability });
  } catch (error) {
    console.error("Bootstrap sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/sync/status", async (c) => {
  try {
  await owner(c);
  const [runs, counts, cursors, bookingHealth, recordIssues, unresolvedIssues] = await Promise.all([
    c.env.DB.prepare(`
      SELECT sync_type, started_at, finished_at, status, records_read, records_written, records_failed, error_message
      FROM sync_runs
      WHERE sync_run_id IN (SELECT MAX(sync_run_id) FROM sync_runs GROUP BY sync_type)
      ORDER BY sync_type
    `).all(),
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM properties) AS properties,
        (SELECT COUNT(*) FROM room_types) AS room_types,
        (SELECT COUNT(*) FROM units) AS units,
        (SELECT COUNT(*) FROM offers) AS offers,
        (SELECT COUNT(*) FROM offer_prices) AS offer_prices,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM messages) AS messages,
        (SELECT COUNT(*) FROM unit_availability_cache) AS unit_availability_cache
    `).first(),
    c.env.DB.prepare("SELECT cursor_name, cursor_value, updated_at FROM sync_cursors ORDER BY cursor_name").all(),
    c.env.DB.prepare(`
      SELECT sync_type, started_at, finished_at, status, records_read, records_written, records_failed, error_message
      FROM sync_runs
      WHERE sync_type = 'bookings'
        AND status IN ('success', 'partial_success')
      ORDER BY finished_at DESC, sync_run_id DESC
      LIMIT 1
    `).first(),
    c.env.DB.prepare(`
      SELECT
        sync_type,
        issue_type,
        provider_record_id,
        first_failure_at,
        latest_failure_at,
        attempt_count,
        error_category,
        error_message,
        status,
        resolved_at,
        updated_at
      FROM sync_record_issues
      WHERE sync_type = 'bookings'
      ORDER BY latest_failure_at DESC, sync_record_issue_id DESC
      LIMIT 20
    `).all(),
    c.env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM sync_record_issues
      WHERE sync_type = 'bookings'
        AND status = 'pending'
    `).first<{ total: number }>(),
  ]);
  const latestRuns = runs.results ?? [];
  const bookingRun = latestRuns.find((run) => run.sync_type === "bookings") ?? null;
  const bookingCursor = (cursors.results ?? []).find((cursor) => cursor.cursor_name === "bookings_modified_cursor") ?? null;
  const unresolvedRecordIssues = unresolvedIssues?.total ?? 0;
  return c.json({
    ok: true,
    counts,
    cursors: cursors.results ?? [],
    latestRuns,
    syncHealth: {
      bookings: {
        healthy: Boolean(bookingHealth) && bookingRun?.status !== "failed" && unresolvedRecordIssues === 0,
        currentCursor: bookingCursor,
        lastSuccessfulSync: bookingHealth ?? null,
        latestRun: bookingRun,
        unresolvedRecordIssues,
        recentRecordIssues: recordIssues.results ?? [],
      },
    },
  });
  } catch (error) {
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    if (controller.cron === "15 3 1 * *") {
      ctx.waitUntil(syncProperties(env).then(() => undefined));
      return;
    }
    if (controller.cron === PASSPORT_RETENTION_CRON) {
      ctx.waitUntil(cleanupExpiredPassports(env).then(() => undefined));
      return;
    }
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(syncBookings(env).then(() => syncMessages(env)).then(() => generatePendingWarapornDrafts(env)).then(() => undefined));
      return;
    }
    if (controller.cron === "2 * * * *") {
      ctx.waitUntil(syncCommercialCaches(env).then(() => undefined));
    }
  },
};
