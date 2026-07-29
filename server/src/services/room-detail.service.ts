import { getHousekeepingOverview, type HousekeepingBindings, type HousekeepingRoom } from "./housekeeping-overview.service.js";
import { getBangkokDate } from "./today.service.js";

export interface RoomDetailBindings extends HousekeepingBindings {
  DB: D1Database;
}

interface UnitRow {
  unit_id: number;
  unit_name: string;
  unit_type: string | null;
  room_type_name: string;
  room_name: string | null;
}

interface StayRow {
  beds24_booking_id: number;
  guest_name: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
}

interface CountRow {
  total: number;
}

export interface RoomCurrentStay {
  bookingId: number;
  guestName: string;
  arrival: string;
  departure: string;
  guests: number;
}

export interface RoomDetail {
  unitId: number;
  roomName: string;
  accommodationType: string;
  occupancyStatus: string;
  housekeepingStatus: string;
  operationalPriority: string;
  checkoutCompleted: boolean;
  checkoutCompletionSource: "reception" | "automatic-fallback" | "none";
  newGuestToday: boolean;
  currentStay: RoomCurrentStay | null;
  maintenance: {
    openIssues: number;
    label: string;
  };
  timeline: {
    available: false;
    label: string;
  };
}

function unitType(row: UnitRow): string {
  return row.unit_type || row.room_type_name || row.room_name || "Accommodation";
}

function guestName(row: StayRow): string {
  return row.guest_name || "Guest name unavailable";
}

async function resolveUnit(env: RoomDetailBindings, id: number): Promise<UnitRow | null> {
  const direct = await env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, rt.room_type_name, rt.room_name
    FROM units u
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE u.unit_id = ?1
    LIMIT 1
  `).bind(id).first<UnitRow>();

  if (direct) return direct;

  return env.DB.prepare(`
    SELECT u.unit_id, u.unit_name, u.unit_type, rt.room_type_name, rt.room_name
    FROM bookings b
    JOIN units u ON u.unit_id = b.unit_id
    JOIN room_types rt ON rt.room_type_id = u.room_type_id
    WHERE b.beds24_booking_id = ?1 OR b.booking_id = ?1
    ORDER BY b.arrival_date DESC
    LIMIT 1
  `).bind(id).first<UnitRow>();
}

function operationalFallback(unit: UnitRow, stay: RoomCurrentStay | null): HousekeepingRoom {
  const occupied = stay !== null;
  return {
    id: `unit:${unit.unit_id}`,
    unitId: unit.unit_id,
    unitName: unit.unit_name,
    group: occupied ? "occupied" : "ready",
    operationalPriority: occupied ? "Occupied" : "Ready",
    occupancyStatus: occupied ? "Occupied" : "Ready for Guest",
    housekeepingStatus: "Ready",
    checkoutCompleted: false,
    checkoutCompletionSource: "none",
    newGuestToday: false,
  };
}

export async function getRoomDetail(env: RoomDetailBindings, id: number): Promise<RoomDetail | null> {
  const unit = await resolveUnit(env, id);
  if (!unit) return null;

  const today = getBangkokDate();
  const [stayRow, maintenanceRow, housekeeping] = await Promise.all([
    env.DB.prepare(`
      SELECT beds24_booking_id, guest_name, arrival_date, departure_date, adults, children
      FROM bookings
      WHERE unit_id = ?1
        AND arrival_date <= ?2
        AND departure_date > ?2
        AND lower(status) NOT IN ('cancelled', 'canceled')
      ORDER BY arrival_date DESC
      LIMIT 1
    `).bind(unit.unit_id, today).first<StayRow>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM maintenance
      WHERE unit_id = ?1
        AND lower(COALESCE(status, 'open')) NOT IN ('resolved', 'verified', 'closed', 'completed')
    `).bind(unit.unit_id).first<CountRow>(),
    getHousekeepingOverview(env),
  ]);

  const currentStay = stayRow
    ? {
        bookingId: stayRow.beds24_booking_id,
        guestName: guestName(stayRow),
        arrival: stayRow.arrival_date,
        departure: stayRow.departure_date,
        guests: stayRow.adults + stayRow.children,
      }
    : null;
  const operations = housekeeping.rooms.find((room) => room.unitId === unit.unit_id) ?? operationalFallback(unit, currentStay);
  const openIssues = maintenanceRow?.total ?? 0;

  return {
    unitId: unit.unit_id,
    roomName: unit.unit_name,
    accommodationType: unitType(unit),
    occupancyStatus: operations.occupancyStatus,
    housekeepingStatus: operations.housekeepingStatus,
    operationalPriority: operations.operationalPriority,
    checkoutCompleted: operations.checkoutCompleted,
    checkoutCompletionSource: operations.checkoutCompletionSource,
    newGuestToday: operations.newGuestToday,
    currentStay,
    maintenance: {
      openIssues,
      label: openIssues > 0 ? "Maintenance placeholder" : "No open issues",
    },
    timeline: {
      available: false,
      label: "Operational history will appear here",
    },
  };
}