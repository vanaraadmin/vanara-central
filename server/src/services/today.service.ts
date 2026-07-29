export interface TodayBindings { DB: D1Database; }

export interface TodayReservation {
  id: number;
  guestName: string;
  unit: string;
  roomType: string;
  adults: number;
  children: number;
  guests: number;
  arrival: string;
  departure: string;
  channel: string;
  status: string;
  apiReference: string | null;
}

export interface TodayDashboard {
  date: string;
  arrivals: TodayReservation[];
  departures: TodayReservation[];
  summary: { arrivals: number; departures: number; arrivingGuests: number; departingGuests: number; };
}

interface Row {
  beds24_booking_id: number;
  guest_name: string | null;
  unit_name: string | null;
  room_type_name: string;
  adults: number;
  children: number;
  arrival_date: string;
  departure_date: string;
  channel: string | null;
  status: string;
  api_reference: string | null;
}

export function getBangkokDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function normalize(row: Row): TodayReservation {
  return {
    id: row.beds24_booking_id,
    guestName: row.guest_name || "Guest name unavailable",
    unit: row.unit_name || "Unit not assigned",
    roomType: row.room_type_name,
    adults: row.adults,
    children: row.children,
    guests: row.adults + row.children,
    arrival: row.arrival_date,
    departure: row.departure_date,
    channel: row.channel || "Direct / Unknown",
    status: row.status,
    apiReference: row.api_reference,
  };
}

export async function getTodayDashboard(env: TodayBindings): Promise<TodayDashboard> {
  const date = getBangkokDate();
  const baseSql = `
    SELECT b.beds24_booking_id, b.guest_name, u.unit_name, rt.room_type_name,
           b.adults, b.children, b.arrival_date, b.departure_date,
           b.channel, b.status, b.api_reference
    FROM bookings b
    JOIN room_types rt ON rt.room_type_id = b.room_type_id
    LEFT JOIN units u ON u.unit_id = b.unit_id
    WHERE lower(b.status) NOT IN ('cancelled', 'canceled')
  `;
  const [arrivalRows, departureRows] = await Promise.all([
    env.DB.prepare(`${baseSql} AND b.arrival_date = ? ORDER BY u.position, u.unit_name`).bind(date).all<Row>(),
    env.DB.prepare(`${baseSql} AND b.departure_date = ? ORDER BY u.position, u.unit_name`).bind(date).all<Row>(),
  ]);
  const arrivals = (arrivalRows.results ?? []).map(normalize);
  const departures = (departureRows.results ?? []).map(normalize);
  return {
    date, arrivals, departures,
    summary: {
      arrivals: arrivals.length,
      departures: departures.length,
      arrivingGuests: arrivals.reduce((sum, item) => sum + item.guests, 0),
      departingGuests: departures.reduce((sum, item) => sum + item.guests, 0),
    },
  };
}
