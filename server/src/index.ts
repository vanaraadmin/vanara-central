import { Hono, type Context } from "hono";
import { getDashboard, getDashboardOverview } from "./services/dashboard.service.js";
import { getStaffOverview, type StaffOverviewBindings } from "./services/staff-overview.service.js";
import { createRoomMaintenanceTicket, createRoomNote, getRoomDetail, normalizeRoomHousekeepingInput, normalizeRoomNoteInput, updateRoomHousekeepingStatus, type RoomDetailBindings } from "./services/room-detail.service.js";
import { getTodayDashboard } from "./services/today.service.js";
import { syncProperties, type PropertySyncBindings } from "./services/property-sync.service.js";
import { syncOfferPrices, type OfferPricesSyncBindings } from "./services/offer-prices.service.js";
import { syncBookings, type BookingsSyncBindings } from "./services/bookings-sync.service.js";
import { syncAvailabilityCache, type AvailabilitySyncBindings } from "./services/availability-cache.service.js";
import { getAvailability } from "./services/availability-read.service.js";
import { getArrivalsDeparturesAgenda, type MovementsBindings } from "./services/arrivals-departures.service.js";
import { completeReceptionEvent, getReceptionOverview, getReceptionStay, normalizeCompleteReceptionCheckInInput, normalizeCompleteReceptionCheckOutInput, normalizeReceptionCheckInInput, normalizeReceptionCheckOutInput, normalizeReceptionNotesInput, receptionCompletionErrorStatus, resolveReceptionRoomAlert, updateReceptionAction, updateReceptionNotes, type ReceptionAlertType, type ReceptionBindings } from "./services/reception.service.js";
import { getHousekeepingOverview, housekeepingWorkflowErrorStatus, listAssignableHousekeepingUsers, normalizeHousekeepingAssignmentInput, normalizeHousekeepingChecklistInput, normalizeHousekeepingWorkflowInput, updateHousekeepingAssignment, updateHousekeepingChecklist, updateHousekeepingWorkflow, type HousekeepingBindings } from "./services/housekeeping-overview.service.js";
import { createChatMessage, getChatConversation, listChatConversations, listChatMessages, normalizeMessageInput, type ChatBindings } from "./services/chat.service.js";
import { addMaintenanceNote, addMaintenancePhoto, assignMaintenanceTicket, createMaintenanceTicket, getMaintenanceTicket, listAssignableMaintenanceUsers, listMaintenanceTickets, maintenanceErrorStatus, normalizeCreateMaintenanceTicketInput, normalizeMaintenanceAssignmentInput, normalizeMaintenanceNoteInput, normalizeMaintenanceOutOfServiceInput, normalizeMaintenancePhotoInput, normalizeMaintenanceStatusInput, normalizeUpdateMaintenanceTicketInput, transitionMaintenanceTicket, updateMaintenanceOutOfService, updateMaintenanceTicket, type MaintenanceBindings, type MaintenanceStatus } from "./services/maintenance.service.js";
import { createProcurementRequest, getOwnerProcurementRequest, listActiveProcurementItems, listProcurementRequests, normalizeCreateProcurementRequestInput, normalizeUpdateProcurementRequestInput, updateProcurementRequestStatus, type ProcurementBindings, type ProcurementStatus } from "./services/procurement.service.js";
import { extractPassportData, PassportOcrError, type PassportData, type PassportOcrBindings } from "./services/passport-ocr.service.js";
import { deletePassport, uploadPassport, type PassportStorageBindings, type UploadedPassport } from "./services/passport-storage.service.js";
import { normalizePassportImageFormData, PassportUploadError } from "./services/passport-upload.service.js";
import { createBookingPassport, listBookingPassports, type BookingPassportBindings } from "./services/booking-passports.service.js";
import { cleanupExpiredPassports, PASSPORT_RETENTION_CRON, type PassportRetentionBindings } from "./services/passport-retention.service.js";
import { generateTm30Workbook, listTm30PassportRows, normalizeTm30Date, type Tm30Bindings } from "./services/tm30-export.service.js";
import { authenticateBeds24Webhook, Beds24WebhookError, logBeds24WebhookFailure, parseBeds24WebhookRequest, recordBeds24Webhook, validateBeds24WebhookMethod, WEBHOOK_SECRET_HEADER, type Beds24WebhookBindings } from "./services/beds24-webhook.service.js";
import {
  AuthenticationError,
  ForbiddenError,
  authOptions,
  createInitialOwner,
  createUser,
  disableUser,
  listUsers,
  login,
  logout,
  makeExpiredSessionCookie,
  makeSessionCookie,
  normalizeCreateUserInput,
  normalizeLoginInput,
  normalizeUpdateUserInput,
  publicCurrentUser,
  requireActionPermission,
  requireModulePermission,
  requireOwner,
  requireView,
  resolveCurrentUser,
  updateUser,
  type AuthBindings,
  type CurrentUser,
  type ModuleKey,
} from "./services/current-user.service.js";

export interface Bindings extends PropertySyncBindings, OfferPricesSyncBindings, BookingsSyncBindings, AvailabilitySyncBindings, HousekeepingBindings, MovementsBindings, ReceptionBindings, RoomDetailBindings, StaffOverviewBindings, ChatBindings, MaintenanceBindings, ProcurementBindings, AuthBindings, PassportStorageBindings, PassportOcrBindings, BookingPassportBindings, PassportRetentionBindings, Tm30Bindings, Beds24WebhookBindings {
  BEDS24_BASE_URL: string;
  BEDS24_LONG_LIFE_TOKEN: string;
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

function passportUploadErrorStatus(error: unknown): 400 | 401 | 403 | 413 | 502 {
  if (error instanceof AuthenticationError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof PassportUploadError && error.code === "passport_upload_too_large") return 413;
  if (error instanceof PassportUploadError && error.code === "passport_storage_failed") return 502;
  return error instanceof PassportOcrError ? 502 : 400;
}

function passportUploadError(error: unknown): { code: string; message: string } {
  if (error instanceof PassportOcrError) return { code: error.code, message: error.message };
  if (error instanceof PassportUploadError) return { code: error.code, message: error.message };
  if (error instanceof AuthenticationError) return { code: "authentication_required", message: error.message };
  if (error instanceof ForbiddenError) return { code: "forbidden", message: error.message };
  return { code: "passport_upload_invalid", message: errorMessage(error) };
}

async function storePassportUpload(env: Bindings, upload: { bytes: ArrayBuffer; contentType: "image/jpeg" | "image/png" }): Promise<UploadedPassport> {
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

async function owner(c: AppContext, action: "access" | "edit" = "access"): Promise<CurrentUser> {
  const user = await resolveCurrentUser(c);
  requireOwner(user);
  requireModulePermission(user, "settings", action);
  return user;
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




app.get("/api/rooms/:id", async (c) => {
  try {
    await authenticated(c, "rooms", "access");
    c.header("Cache-Control", "no-store");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const room = await getRoomDetail(c.env, roomId);

    if (!room) {
      return c.json({ success: false, error: "Room not found" }, 404);
    }

    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.patch("/api/rooms/:id/housekeeping", async (c) => {
  try {
    const user = await authenticated(c, "rooms", "access");
    requireModulePermission(user, "housekeeping", "edit");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const payload = await c.req.json().catch(() => null);
    const room = await updateRoomHousekeepingStatus(c.env, roomId, normalizeRoomHousekeepingInput(payload), user);
    if (!room) return c.json({ success: false, error: "Room not found" }, 404);
    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : housekeepingWorkflowErrorStatus(error));
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
    requireModulePermission(user, "maintenance", "edit");
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
  try {
    await authenticated(c, "movements", "access");
    const upload = await normalizePassportImageFormData(await c.req.formData());
    const stored = await storePassportUpload(c.env, upload);
    let passport: PassportData;
    try {
      passport = await extractPassportData(c.env, {
        image: upload.bytes,
        contentType: upload.contentType,
      });
    } catch (error) {
      await rollbackPassportUpload(c.env, stored.objectKey, "ocr_failed");
      throw error;
    }

    return c.json({
      success: true,
      objectKey: stored.objectKey,
      passport,
    });
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

app.post("/api/reception/stays/:bookingId/passports/ocr", async (c) => {
  try {
    await authenticated(c, "movements", "access");
    const bookingId = positiveIntegerParam(c.req.param("bookingId"), "booking id");
    const stay = await getReceptionStay(c.env, bookingId);
    if (!stay) return c.json({ success: false, error: "Reception stay not found" }, 404);
    const upload = await normalizePassportImageFormData(await c.req.formData());
    const stored = await storePassportUpload(c.env, upload);
    let passport: PassportData;
    try {
      passport = await extractPassportData(c.env, {
        image: upload.bytes,
        contentType: upload.contentType,
      });
      await createBookingPassport(c.env, {
        bookingId,
        objectKey: stored.objectKey,
        passport,
      });
    } catch (error) {
      await rollbackPassportUpload(c.env, stored.objectKey, error instanceof PassportOcrError ? "ocr_failed" : "passport_persistence_failed");
      throw error;
    }

    return c.json({
      success: true,
      objectKey: stored.objectKey,
      passport,
    });
  } catch (error) {
    return c.json({ success: false, error: passportUploadError(error) }, passportUploadErrorStatus(error));
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
    requireActionPermission(user, "can_complete_checkin_checkout");
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
    requireActionPermission(user, "can_complete_checkin_checkout");
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
    requireActionPermission(user, "can_complete_checkin_checkout");
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
    const user = await authenticated(c, "procurement", "edit");
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
    await authenticated(c, "maintenance", "edit");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listAssignableMaintenanceUsers(c.env) });
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
    const user = await authenticated(c, "maintenance", "edit");
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
    const user = await authenticated(c, "maintenance", "edit");
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
    const user = await authenticated(c, "maintenance", "edit");
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
    const user = await authenticated(c, "maintenance", "edit");
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
    const user = await authenticated(c, "maintenance", "edit");
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
    const user = await authenticated(c, "maintenance", "edit");
    const note = await addMaintenanceNote(c.env, ticketId, input, user);
    if (!note) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: note }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/maintenance/tickets/:id/photos", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenancePhotoInput(payload);
    const user = await authenticated(c, "maintenance", "edit");
    const photo = await addMaintenancePhoto(c.env, ticketId, input, user);
    if (!photo) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: photo }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});
app.get("/api/chat/conversations", async (c) => {
  try {
    await authenticated(c, "chat", "access");
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listChatConversations(c.env) });
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

app.get("/api/chat/conversations/:id", async (c) => {
  try {
    await authenticated(c, "chat", "access");
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId);

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
    await authenticated(c, "chat", "access");
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId);

    if (!conversation) {
      return c.json({ success: false, error: "Conversation not found" }, 404);
    }

    return c.json({ success: true, data: await listChatMessages(c.env, conversationId) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.post("/api/chat/conversations/:id/messages", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMessageInput(payload);
    const user = await authenticated(c, "chat", "edit");
    const message = await createChatMessage(c.env, conversationId, user, input);
    return c.json({ success: true, data: message }, 201);
  } catch (error) {
    const message = errorMessage(error);
    const status = error instanceof AuthenticationError || error instanceof ForbiddenError ? apiErrorStatus(error) : message === "Conversation not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
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
    const offers = await syncOfferPrices(c.env, { batchDays: 30, startOffset: 0 });
    return c.json({ ok: true, properties, bookings, offers });
  } catch (error) {
    console.error("Bootstrap sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/sync/status", async (c) => {
  try {
  await owner(c);
  const [runs, counts, cursors] = await Promise.all([
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
        (SELECT COUNT(*) FROM unit_availability_cache) AS unit_availability_cache
    `).first(),
    c.env.DB.prepare("SELECT cursor_name, cursor_value, updated_at FROM sync_cursors ORDER BY cursor_name").all(),
  ]);
  return c.json({ ok: true, counts, cursors: cursors.results ?? [], latestRuns: runs.results ?? [] });
  } catch (error) {
    return c.json({ ok: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    if (controller.cron === "3 20 * * *") {
      ctx.waitUntil(syncProperties(env).then(() => undefined));
      return;
    }
    if (controller.cron === PASSPORT_RETENTION_CRON) {
      ctx.waitUntil(cleanupExpiredPassports(env).then(() => undefined));
      return;
    }
    if (controller.cron === "*/10 * * * *") {
      ctx.waitUntil(syncBookings(env).then(() => undefined));
      return;
    }
    if (controller.cron === "*/15 * * * *") {
      ctx.waitUntil(syncOfferPrices(env, { batchDays: 30, startOffset: 0 }).then(() => undefined));
    }
  },
};
