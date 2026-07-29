import { Hono, type Context } from "hono";
import { getDashboard } from "./services/dashboard.service.js";
import { getTodayDashboard } from "./services/today.service.js";
import { syncProperties, type PropertySyncBindings } from "./services/property-sync.service.js";
import { syncOfferPrices, type OfferPricesSyncBindings } from "./services/offer-prices.service.js";
import { syncBookings, type BookingsSyncBindings } from "./services/bookings-sync.service.js";

export interface Bindings extends PropertySyncBindings, OfferPricesSyncBindings, BookingsSyncBindings {
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
        (SELECT COUNT(*) FROM bookings) AS bookings
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
