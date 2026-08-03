# Availability & Prices Architecture

Sprint 00 audit document. This file maps the existing Vanara Central calendar, availability, and pricing architecture before implementing the future Availability & Prices workspace.

No product code, API, routing, schema, UI, or production behavior was changed for this audit.

## Audit Legend

- VERIFIED: implemented in the repository and traced to concrete source.
- PARTIAL: implemented for an adjacent use case, but not sufficient for the future workspace contract.
- MISSING: not implemented in the repository.
- CONFLICT: implemented behavior conflicts with the proposed product direction or needs Product Owner confirmation.

## Executive Summary

| Area | Status | Finding |
| --- | --- | --- |
| Beds24 master data | VERIFIED | `properties`, `room_types`, `units`, and `offers` are synchronized from Beds24 and stored locally. |
| Per-unit availability cache | VERIFIED | `unit_availability_cache` stores local D1 read cache generated from Beds24 room calendar plus local booked-unit projection. |
| Availability read API | PARTIAL | `/api/availability` exposes raw per-unit cached availability, but not grouped accommodation results, nights, prices, or total stay price. |
| Offer/pricing sync | VERIFIED | `offer_prices` stores one-night Beds24 offer results for the next 30 days. |
| Stay price calculator | MISSING | No service currently totals nightly prices across a requested arrival/departure range. |
| Availability + price workspace | MISSING | `src/pages/AvailabilityPage.tsx` is an explicit placeholder. |
| Staff Home entry | PARTIAL | Navigation already has an `availability` item under `rooms`; Staff Home cards do not yet expose the future workspace entry. |
| Operational room availability | VERIFIED | `room_operational_availability` is the local source for Operating / Not Operating. |
| Maintenance blocking | VERIFIED | `maintenance_tickets.out_of_service` and metadata drive blocking room state in Rooms. |
| Seasonal closure | VERIFIED | Implemented as `room_operational_availability.status = 'NOT_OPERATING'` with seasonal metadata. |

The repository has enough authoritative local data to build Availability & Prices as a read-only Staff Home workspace, but the combined read model does not exist yet. The next implementation should add one backend service that composes cached availability, pricing, active bookings, operational availability, and maintenance blocking without writing reservations or replacing Beds24.

## Existing Source Map

### Calendar And Availability

| Concern | Status | Location |
| --- | --- | --- |
| Cached per-unit availability table | VERIFIED | `server/migrations/0002_unit_availability_cache.sql` |
| Beds24 room calendar source table comments | VERIFIED | `server/migrations/0001_initial.sql`, `room_calendar` comments around `GET /inventory/rooms/calendar` |
| Availability cache projection | VERIFIED | `server/src/services/availability-cache.service.ts`, `buildAvailabilityCacheRows()` |
| Availability sync job | VERIFIED | `server/src/services/availability-cache.service.ts`, `syncAvailabilityCache()` |
| Booked-unit overlap query | VERIFIED | `server/src/services/availability-cache.service.ts`, `getBookedUnits()` |
| Booked-unit daily projection | VERIFIED | `server/src/services/availability-cache.service.ts`, `bookedUnitsByDate()` |
| Public app read API | PARTIAL | `server/src/index.ts`, `GET /api/availability`, `GET /api/availability/unit/:id`, `GET /api/availability/date/:date` |
| Availability read mapper | PARTIAL | `server/src/services/availability-read.service.ts`, `getAvailability()` |
| Frontend availability route | MISSING | `src/pages/AvailabilityPage.tsx` is a placeholder only. |
| Frontend navigation item | PARTIAL | `src/config/navigation.tsx`, `availability` item points to `/availability`. |

Current availability cache behavior:

- `syncAvailabilityCache()` reads Beds24 `/inventory/rooms/calendar` for the next 30 days.
- `buildAvailabilityCacheRows()` projects room-type calendar counts onto deterministic physical units.
- `getBookedUnits()` removes locally booked units using operational booking statuses.
- `writeAvailabilityRows()` upserts by `(unit_id, stay_date)`.
- `getAvailability()` returns raw cached unit-day rows with status `available`, `unavailable`, or `unknown`.

### Offers And Pricing

| Concern | Status | Location |
| --- | --- | --- |
| Offer master data | VERIFIED | `server/migrations/0001_initial.sql`, `offers` |
| Offer price table | VERIFIED | `server/migrations/0001_initial.sql`, `offer_prices` |
| Offer master sync | VERIFIED | `server/src/services/property-sync.service.ts`, `syncProperties()` inserts `offers`. |
| Offer price sync | VERIFIED | `server/src/services/offer-prices.service.ts`, `syncOfferPrices()` |
| Beds24 pricing endpoint | VERIFIED | `server/src/services/offer-prices.service.ts`, `/inventory/rooms/offers` |
| Technical guest-count parameter | VERIFIED | `server/src/services/offer-prices.service.ts`, `numAdults: 2`; schema comment says this is not a stored pricing dimension. |
| Pricing horizon | VERIFIED | `server/src/services/offer-prices.service.ts`, `HORIZON_DAYS = 30`. |
| One-night price persistence | VERIFIED | `server/src/services/offer-prices.service.ts`, `INSERT INTO offer_prices ... ON CONFLICT`. |
| Stay total calculation | MISSING | No service currently sums `offer_prices.price` for `[arrival, departure)`. |
| Price selection rule | MISSING | No approved service picks which Beds24 offer is the display offer when several offers exist. |
| Frontend price display for Booking Pulse | PARTIAL | Booking Pulse displays booking value from existing booking data, not Availability & Prices quote logic. |

Important verified rule from schema:

- `room_calendar.price1` is explicitly not authoritative and must not be used as the future price source.
- `offer_prices.price` is the normalized authoritative commercial price cache.

### Rooms And Operational State

| Concern | Status | Location |
| --- | --- | --- |
| Rooms read model | VERIFIED | `server/src/services/rooms-workspace.service.ts`, `getRoomsWorkspaceOverview()` |
| Occupancy calculation | VERIFIED | `server/src/services/rooms-workspace.service.ts`, `roomOccupancyState()` |
| Booking status filter | VERIFIED | `server/src/services/booking-status.service.ts`, `operationalBookingStatusSql()` |
| Operational availability | VERIFIED | `server/migrations/0021_real_resort_room_baseline.sql`, `room_operational_availability` |
| Housekeeping condition | VERIFIED | `server/migrations/0021_real_resort_room_baseline.sql`, `room_housekeeping_state` |
| Maintenance blocking | VERIFIED | `server/src/services/rooms-workspace.service.ts`, maintenance subquery over `maintenance_tickets` |
| Staff Home room counters | VERIFIED | `server/src/services/staff-overview.service.ts`, consumes `getRoomsWorkspaceOverview()` summary. |

Rooms Workspace is already the authoritative operational read model for:

- Operating / Not Operating.
- Occupied / Vacant.
- Maintenance blocked.
- Season closed.
- Current room identity and accommodation type.

Availability & Prices should reuse this operational dimension only to explain whether a physically available room can be offered immediately. It must not change Beds24 reservation ownership.

## Source Of Truth Matrix

| Dimension | Source of truth | Current implementation | Status | Notes for Availability & Prices |
| --- | --- | --- | --- | --- |
| Reservation existence | Beds24, locally cached in `bookings` | `bookings-sync.service.ts` stores provider bookings and reconciles cancelled/provider-deleted records. | VERIFIED | Read only. Never write reservations from Availability & Prices. |
| Unit assignment | Beds24, locally cached in `bookings.unit_id` and `units` | `property-sync.service.ts` maps `beds24_room_id` and `beds24_unit_id`; `bookings-sync.service.ts` maps booking room/unit/offer. | VERIFIED | Use local D1 state; do not call Beds24 from request path. |
| Unit availability | Beds24 availability cache plus local bookings | `unit_availability_cache`, `availability-cache.service.ts`. | PARTIAL | Existing cache is daily per unit; future service must fold all nights in `[arrival, departure)`. |
| Nightly price | Beds24 offers cache | `offer_prices.price`, one row per `room_type_id`, `beds24_offer_id`, arrival date, departure date. | VERIFIED | Use only `offer_prices`, never `room_calendar.price1`. |
| Total stay price | Derived local calculation | Not implemented. | MISSING | Sum nightly prices for every stay date after offer selection rules are approved. |
| Operational availability | Vanara | `room_operational_availability`. | VERIFIED | Exclude or mark `NOT_OPERATING` units from offerable unit names. |
| Seasonal closure | Vanara | Same table, seasonal fields from baseline. | VERIFIED | Product label should be Season Closed in executive summaries. |
| Maintenance blocking | Vanara | `maintenance_tickets.out_of_service = 1` or metadata `outOfService`. | VERIFIED | Blocking room should not be offered as an available physical unit. |
| Housekeeping cleanliness | Vanara Housekeeping | `room_housekeeping_state` and active `housekeeping_tasks`. | VERIFIED | Should be displayed as operational context only if Product asks. It must not replace commercial availability. |

## Date Range Rules

Recommended contract for the future workspace:

- Arrival and departure are `YYYY-MM-DD`.
- Interpret dates in Thailand operational time.
- Stay nights are calculated as calendar days between arrival and departure.
- Departure is exclusive: a booking from `2026-08-03` to `2026-08-05` occupies nights `2026-08-03` and `2026-08-04`.
- Same-day stay is invalid: arrival must be strictly before departure.
- One-night stay is valid.
- Availability must be true only when every stay date in `[arrival, departure)` is available for that physical unit.
- Checkout-day reuse is allowed because departure day is exclusive.
- Existing overlap query shape in `availability-cache.service.ts` is `arrival_date <= toDate AND departure_date > fromDate`; for the future endpoint this should be tightened around stay dates so departure remains exclusive.

Current implementation notes:

- `availability-cache.service.ts` uses date-only UTC helpers for cache synchronization.
- Rooms operational display uses Bangkok date handling through `getBangkokDate()` and date parsing with `+07:00`.
- The future request validator should make the Thailand operational date rule explicit to avoid mixing sync-day UTC helpers with staff-facing date selection.

## Accommodation Mapping

Existing mapping sources:

- `room_types.beds24_room_id` maps Beds24 room type to local `room_type_id`.
- `units.beds24_unit_id` maps Beds24 physical unit inside a room type.
- `units.unit_name` is the display name. Architecture documentation says applications must display `unit_name`.
- `units.unit_type` currently allows `bungalow`, `villa`, `yurt`, `other`.
- `property-sync.service.ts` maps Beds24 `roomType: "tent"` into local `unit_type: "yurt"`.
- `rooms-workspace.service.ts` presentation maps names containing `tent` or `yurt` into the `tent` family and displays accommodation type `Tent`.

Current Product naming gap:

- The requested future workspace mentions Bungalow / Villa / Tent / Yurt naming.
- Current UI type model exposes `Bungalow`, `Villa`, `Tent`, `Other`; local persistence stores Beds24 `tent` as `yurt`.
- Product Owner should confirm whether the future public label is `Tent`, `Yurt`, or context-dependent `Tent/Yurt` before implementation.

## Existing Endpoints

| Endpoint | Method | Auth | Status | Use |
| --- | --- | --- | --- | --- |
| `/api/availability` | GET | authenticated `rooms` access | PARTIAL | Raw cached availability rows, optional `from` and `to`. |
| `/api/availability/unit/:id` | GET | authenticated `rooms` access | PARTIAL | Raw cached availability rows for one unit. |
| `/api/availability/date/:date` | GET | authenticated `rooms` access | PARTIAL | Raw cached availability rows for one date. |
| `/sync/availability` | POST | Owner edit | VERIFIED | Refreshes local availability cache. |
| `/sync/offers` | POST | Owner edit | VERIFIED | Refreshes offer prices. |
| `/sync/bootstrap` | POST | Owner edit | PARTIAL | Runs properties, bookings, and offers; it does not call availability cache. |

Recommendation:

- Add one read-only endpoint in a later sprint: `GET /api/availability-prices?arrival=YYYY-MM-DD&departure=YYYY-MM-DD`.
- Keep existing `/api/availability` endpoints unchanged for raw cache inspection.
- Do not move sync endpoints or make reservation writes.

## Proposed Read Contract

The future endpoint should return grouped accommodation results, not raw unit-day rows.

```ts
interface AvailabilityPricesResponse {
  arrivalDate: string;
  departureDate: string;
  nights: number;
  currency: "THB";
  generatedAt: string;
  groups: Array<{
    accommodationType: "Bungalow" | "Villa" | "Tent" | "Yurt" | "Other";
    roomTypeId: number;
    roomTypeName: string;
    beds24RoomId: number;
    availableCount: number;
    availableUnits: Array<{
      unitId: number;
      unitName: string;
      beds24UnitId: number;
      operationalAvailability: "OPERATING" | "NOT_OPERATING";
      maintenanceBlocked: boolean;
    }>;
    pricing: {
      status: "AVAILABLE" | "PARTIAL" | "MISSING";
      nightlyPrice: number | null;
      totalPrice: number | null;
      offerId: number | null;
      beds24OfferId: number | null;
      missingDates: string[];
    };
  }>;
}
```

Recommended response behavior:

- Return `availableCount = 0` when no unit satisfies every stay date.
- Return pricing `MISSING` when any required nightly price is absent.
- Return pricing `PARTIAL` only if Product explicitly wants partial display; otherwise hide total.
- Do not infer a price from bookings, `room_calendar.price1`, or last known historical values.
- Keep currency fixed to THB in presentation once the price source is verified.

## Future Query Design

Recommended backend service: `server/src/services/availability-prices.service.ts`.

Inputs:

- `arrival`
- `departure`
- authenticated user with normal operational access

Suggested data reads:

- `units` + `room_types` + `properties` for accommodation identity.
- `unit_availability_cache` for all stay dates in `[arrival, departure)`.
- `bookings` for active overlap protection if cache staleness requires a defensive cross-check.
- `room_operational_availability` to exclude Season Closed / Not Operating units from available physical units.
- `maintenance_tickets` to exclude out-of-service rooms.
- `offer_prices` for one-night price rows matching every stay date.

Suggested availability condition per unit:

1. Unit is active.
2. Unit operational availability is `OPERATING`.
3. No active blocking maintenance ticket.
4. Every stay date has cached availability `1`.
5. No active local booking overlaps `[arrival, departure)` if defensive validation is retained.

Suggested price condition per room type:

1. Choose one approved offer row per stay date.
2. Every stay date must have a price.
3. Total is sum of selected nightly prices.
4. Nightly display can be the first night price only if Product approves; otherwise label as average nightly or show total only.

## Staff Home Integration Point

Existing Staff Home implementation:

- Backend: `server/src/services/staff-overview.service.ts`.
- Frontend: `src/pages/StaffPage.tsx`.
- Staff card type: `src/types/staff.ts`.
- Current card IDs do not include availability.

Future recommendation:

- Add a Staff Home module card labelled `Availability & Prices`.
- Route to `/availability-prices`.
- Keep it read-only.
- Do not replace Rooms, Reception, or Booking Pulse.
- Do not include reservation creation.

Current navigation:

- `src/config/navigation.tsx` already has an `availability` navigation item at `/availability`.
- `src/pages/AvailabilityPage.tsx` says the route is ready but data is not exposed to staff.

Decision needed:

- Reuse `/availability` or create the requested future route `/availability-prices`.
- Product prompt recommends `/availability-prices`; implementation should follow that unless Product chooses route reuse.

## Design System Mapping

Future workspace should use existing Vanara UI System v1:

- `WorkspaceShell` for page shell.
- `VanaraGlassRegion` for input and results sections.
- `VanaraSummaryGrid` for compact accommodation counters.
- Existing global UI tap sound service for intentional taps.
- Existing workspace background mapping and overlays.

UI behavior should remain operational:

- Select arrival.
- Select departure.
- Show nights.
- Show accommodation groups.
- Show available count.
- Show unit names.
- Show price only when verified from `offer_prices`.

No Staff Home redesign is required.

## Edge Cases To Cover

| Edge case | Expected behavior |
| --- | --- |
| Same arrival and departure | Reject as invalid. |
| Departure before arrival | Reject as invalid. |
| One-night stay | Valid. |
| Date beyond 30-day cache horizon | Return unavailable/unknown with clear message; do not call Beds24 live. |
| Missing availability cache row | Treat as unknown, not available. |
| Missing price row | Do not invent price. |
| Closed/stop-sell day | Unit unavailable. |
| Maintenance out of service | Unit unavailable in this workspace. |
| Season Closed / Not Operating | Unit unavailable in this workspace. |
| Checkout on arrival date of another stay | Allowed by exclusive departure rule. |
| Cancelled booking | Must not block availability. |
| Provider-deleted booking reconciled to cancelled | Must not block availability. |
| Multiple offers per room type/date | Product must approve selection rule. |
| Tent/Yurt naming | Product must confirm final display label. |

## Test Plan For Implementation Sprint

Server tests:

- Date validation rejects same-day and reversed ranges.
- One-night range returns one night.
- Range expands to `[arrival, departure)`.
- Available only when every stay date is available.
- Checkout-day reuse is available.
- Cancelled/provider-deleted bookings do not block.
- Active overlapping bookings block.
- Not Operating units are excluded.
- Maintenance out-of-service units are excluded.
- Missing cache row returns unknown/unavailable.
- `offer_prices` total sums all stay dates.
- Missing price row returns pricing `MISSING`.
- Multiple offers apply the approved deterministic selection rule.
- Response groups Bungalow / Villa / Tent/Yurt correctly.

Frontend/source tests:

- Staff Home entry points to the approved route.
- Date form validates before request.
- Same-day is blocked.
- Results render available count, units, nights, nightly/total price.
- Missing price hides or labels price according to Product rule.
- No reservation action appears.
- UI uses Vanara shared components.

Integration smoke:

- Login as Staff.
- Open Availability & Prices from Staff Home.
- Search a one-night stay.
- Search a multi-night stay.
- Verify no POST/PATCH/DELETE reservation endpoints execute.

## Unresolved Product Owner Decisions

1. Offer selection rule when Beds24 returns multiple offers for one room type and one night.
2. Whether nightly display means first-night price, lowest available offer, or average nightly price.
3. Whether unavailable-but-operating rooms should show unit names with reasons, or only available units.
4. Whether `Tent` or `Yurt` is the final staff-facing label.
5. Whether existing `/availability` should be replaced, or new `/availability-prices` route should be introduced.
6. How to display `unknown` availability caused by cache gaps.
7. Whether housekeeping cleanliness should be shown as context for immediate arrivals, or excluded from this workspace.

## Recommended Sprint Sequence

1. Backend read model: add `availability-prices.service.ts` and `GET /api/availability-prices`.
2. Server tests for date range, availability folding, operational exclusions, and price totals.
3. Frontend route `/availability-prices` with date input and grouped results.
4. Staff Home card entry labelled `Availability & Prices`.
5. Design System polish using existing Vanara UI System components.
6. Production smoke with read-only Staff session.

## Final Architecture Recommendation

Availability & Prices should be a read-only operational assistant built on local D1 read models:

- Beds24 remains source of truth for commercial availability and prices.
- Vanara D1 remains the request-time source for staff.
- `unit_availability_cache` answers whether a unit can be sold for each stay date.
- `offer_prices` answers the verified nightly price.
- Rooms operational state answers whether Vanara can actually offer the physical room now.
- Maintenance blocking and seasonal closure are local operational exclusions.
- No reservation is created, changed, or deleted.

Current readiness:

- Calendar source-of-truth location: VERIFIED.
- Offer/pricing source-of-truth location: VERIFIED.
- Combined Availability & Prices workspace read model: MISSING.
- Product route and offer selection decisions: PARTIAL / pending PO confirmation.
