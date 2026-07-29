import { Hono, type Context } from "hono";
import { getDashboard } from "./services/dashboard.service.js";
import { getRoomDetail, type RoomDetailBindings } from "./services/room-detail.service.js";
import { getTodayDashboard } from "./services/today.service.js";
import { syncProperties, type PropertySyncBindings } from "./services/property-sync.service.js";
import { syncOfferPrices, type OfferPricesSyncBindings } from "./services/offer-prices.service.js";
import { syncBookings, type BookingsSyncBindings } from "./services/bookings-sync.service.js";
import { syncAvailabilityCache, type AvailabilitySyncBindings } from "./services/availability-cache.service.js";
import { getAvailability } from "./services/availability-read.service.js";
import { getArrivalsDeparturesAgenda, type MovementsBindings } from "./services/arrivals-departures.service.js";
import { getHousekeepingOverview, type HousekeepingBindings } from "./services/housekeeping-overview.service.js";
import { createChatMessage, getChatConversation, listChatConversations, listChatMessages, normalizeMessageInput, resolveCurrentChatUser, type ChatBindings } from "./services/chat.service.js";
import { addMaintenanceNote, addMaintenancePhoto, createMaintenanceTicket, getMaintenanceTicket, listMaintenanceTickets, normalizeCreateMaintenanceTicketInput, normalizeMaintenanceNoteInput, normalizeMaintenancePhotoInput, normalizeUpdateMaintenanceTicketInput, updateMaintenanceTicket, type MaintenanceBindings, type MaintenanceStatus } from "./services/maintenance.service.js";
import { createProcurementRequest, getOwnerProcurementRequest, listActiveProcurementItems, listProcurementRequests, normalizeCreateProcurementRequestInput, normalizeUpdateProcurementRequestInput, updateProcurementRequestStatus, type ProcurementBindings, type ProcurementStatus } from "./services/procurement.service.js";
import { ForbiddenError, publicCurrentUser, resolveCurrentUser } from "./services/current-user.service.js";

export interface Bindings extends PropertySyncBindings, OfferPricesSyncBindings, BookingsSyncBindings, AvailabilitySyncBindings, HousekeepingBindings, MovementsBindings, RoomDetailBindings, ChatBindings, MaintenanceBindings, ProcurementBindings {
  BEDS24_BASE_URL: string;
  BEDS24_LONG_LIFE_TOKEN: string;
  DB: D1Database;
}

type AppContext = Context<{ Bindings: Bindings }>;

const app = new Hono<{ Bindings: Bindings }>();
const DEFAULT_BEDS24_BASE_URL = "https://api.beds24.com/v2";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function apiErrorStatus(error: unknown): 400 | 403 {
  return error instanceof ForbiddenError ? 403 : 400;
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

async function healthHandler(c: AppContext) {
  let d1: { status: "ok" } | { status: "error"; message: string };

  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
    d1 = { status: "ok" };
  } catch (error) {
    d1 = {
      status: "error",
      message: `${errorMessage(error)}. Run "npm run dev:prepare" to initialize the local D1 database.`,
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
    },
  }, ok ? 200 : 503);
}

app.get("/", (c) => c.json({ status: "ok", project: "Vanara Central" }));
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);
app.get("/api/current-user", (c) => c.json({ success: true, data: publicCurrentUser(resolveCurrentUser(c)) }));

app.get("/api/availability", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json({ success: true, data: await getAvailability(c.env, { from, to }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.get("/api/availability/unit/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const unitId = positiveIntegerParam(c.req.param("id"), "unit id");
    const from = c.req.query("from");
    const to = c.req.query("to");
    return c.json({ success: true, data: await getAvailability(c.env, { unitId, from, to }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.get("/api/availability/date/:date", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await getAvailability(c.env, { date: c.req.param("date") }) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.get("/api/dashboard", async (c) => {
  try {
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
      error: "Dashboard data is temporarily unavailable",
    }, 500);
  }
});




app.get("/api/rooms/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const roomId = positiveIntegerParam(c.req.param("id"), "room id");
    const room = await getRoomDetail(c.env, roomId);

    if (!room) {
      return c.json({ success: false, error: "Room not found" }, 404);
    }

    return c.json({ success: true, data: room });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});
app.get("/api/movements", async (c) => {
  try {
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
      error: "Arrivals and departures are temporarily unavailable",
    }, 500);
  }
});
app.get("/api/housekeeping", async (c) => {
  try {
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
      error: "Housekeeping data is temporarily unavailable",
    }, 500);
  }
});
app.get("/api/procurement/items", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listActiveProcurementItems(c.env) });
  } catch (error) {
    console.error(JSON.stringify({ message: "Procurement items request failed", error: errorMessage(error), path: "/api/procurement/items" }));
    return c.json({ success: false, error: "Supply items are temporarily unavailable" }, 500);
  }
});

app.post("/api/procurement/requests", async (c) => {
  try {
    const payload = await c.req.json().catch(() => null);
    const input = normalizeCreateProcurementRequestInput(payload);
    const user = resolveCurrentUser(c);
    const request = await createProcurementRequest(c.env, input, user);
    return c.json({ success: true, data: request }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.get("/api/procurement/requests", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const user = resolveCurrentUser(c);
    const status = c.req.query("status") as ProcurementStatus | "all" | undefined;
    return c.json({ success: true, data: await listProcurementRequests(c.env, user, status) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, apiErrorStatus(error));
  }
});

app.get("/api/procurement/requests/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const user = resolveCurrentUser(c);
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
    const user = resolveCurrentUser(c);
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
    return c.json({ success: false, error: "Maintenance tickets are temporarily unavailable" }, 500);
  }
});

app.get("/api/maintenance/tickets/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const ticket = await getMaintenanceTicket(c.env, ticketId);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.post("/api/maintenance/tickets", async (c) => {
  try {
    const payload = await c.req.json().catch(() => null);
    const input = normalizeCreateMaintenanceTicketInput(payload);
    const user = resolveCurrentChatUser(c);
    const ticket = await createMaintenanceTicket(c.env, input, user);
    return c.json({ success: true, data: ticket }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.patch("/api/maintenance/tickets/:id", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeUpdateMaintenanceTicketInput(payload);
    const user = resolveCurrentChatUser(c);
    const ticket = await updateMaintenanceTicket(c.env, ticketId, input, user);
    if (!ticket) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: ticket });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.post("/api/maintenance/tickets/:id/notes", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenanceNoteInput(payload);
    const user = resolveCurrentChatUser(c);
    const note = await addMaintenanceNote(c.env, ticketId, input, user);
    if (!note) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: note }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.post("/api/maintenance/tickets/:id/photos", async (c) => {
  try {
    const ticketId = positiveIntegerParam(c.req.param("id"), "ticket id");
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMaintenancePhotoInput(payload);
    const user = resolveCurrentChatUser(c);
    const photo = await addMaintenancePhoto(c.env, ticketId, input, user);
    if (!photo) return c.json({ success: false, error: "Maintenance ticket not found" }, 404);
    return c.json({ success: true, data: photo }, 201);
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});
app.get("/api/chat/conversations", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    return c.json({ success: true, data: await listChatConversations(c.env) });
  } catch (error) {
    console.error(JSON.stringify({
      message: "Chat conversations request failed",
      error: errorMessage(error),
      path: "/api/chat/conversations",
    }));
    return c.json({ success: false, error: "Chat conversations are temporarily unavailable" }, 500);
  }
});

app.get("/api/chat/conversations/:id", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId);

    if (!conversation) {
      return c.json({ success: false, error: "Conversation not found" }, 404);
    }

    return c.json({ success: true, data: conversation });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.get("/api/chat/conversations/:id/messages", async (c) => {
  try {
    c.header("Cache-Control", "no-store");
    const conversationId = conversationIdParam(c.req.param("id"));
    const conversation = await getChatConversation(c.env, conversationId);

    if (!conversation) {
      return c.json({ success: false, error: "Conversation not found" }, 404);
    }

    return c.json({ success: true, data: await listChatMessages(c.env, conversationId) });
  } catch (error) {
    return c.json({ success: false, error: errorMessage(error) }, 400);
  }
});

app.post("/api/chat/conversations/:id/messages", async (c) => {
  try {
    const conversationId = conversationIdParam(c.req.param("id"));
    const payload = await c.req.json().catch(() => null);
    const input = normalizeMessageInput(payload);
    const user = resolveCurrentChatUser(c);
    const message = await createChatMessage(c.env, conversationId, user, input);
    return c.json({ success: true, data: message }, 201);
  } catch (error) {
    const message = errorMessage(error);
    const status = message === "Conversation not found." ? 404 : 400;
    return c.json({ success: false, error: message }, status);
  }
});
app.get("/today", async (c) => {
  try { return c.json(await getTodayDashboard(c.env)); }
  catch (error) {
    console.error("Today dashboard failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.post("/sync/properties", async (c) => {
  try { validateSyncConfig(c.env); return c.json(await syncProperties(c.env)); }
  catch (error) {
    console.error("Properties sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.post("/sync/offers", async (c) => {
  try { validateSyncConfig(c.env); return c.json(await syncOfferPrices(c.env, { batchDays: 30, startOffset: 0 })); }
  catch (error) {
    console.error("Offer prices sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.post("/sync/bookings", async (c) => {
  try { validateSyncConfig(c.env); return c.json(await syncBookings(c.env)); }
  catch (error) {
    console.error("Bookings sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.post("/sync/availability", async (c) => {
  try {
    validateSyncConfig(c.env);
    const batchDays = c.req.query("batchDays") ? Number(c.req.query("batchDays")) : undefined;
    const startOffset = c.req.query("startOffset") ? Number(c.req.query("startOffset")) : undefined;
    return c.json(await syncAvailabilityCache(c.env, { batchDays, startOffset }));
  } catch (error) {
    console.error("Availability cache sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.post("/sync/bootstrap", async (c) => {
  try {
    validateSyncConfig(c.env);
    const properties = await syncProperties(c.env);
    const bookings = await syncBookings(c.env);
    const offers = await syncOfferPrices(c.env, { batchDays: 30, startOffset: 0 });
    return c.json({ ok: true, properties, bookings, offers });
  } catch (error) {
    console.error("Bootstrap sync failed:", error);
    return c.json({ ok: false, error: errorMessage(error) }, 500);
  }
});

app.get("/sync/status", async (c) => {
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
});

app.notFound((c) => c.json({ success: false, error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    if (controller.cron === "3 20 * * *") {
      ctx.waitUntil(syncProperties(env).then(() => undefined));
      return;
    }
    if (controller.cron === "7,22,37,52 * * * *") {
      ctx.waitUntil(syncBookings(env).then(() => undefined));
      return;
    }
    if (controller.cron === "*/15 * * * *") {
      ctx.waitUntil(syncOfferPrices(env, { batchDays: 30, startOffset: 0 }).then(() => undefined));
    }
  },
};
