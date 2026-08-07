export type OtaFinancialChannel = "Booking.com" | "Airbnb" | "Agoda" | "Trip.com" | "Traveloka" | "Expedia" | "Other";
export type SourceConfidence = "high" | "medium" | "low";

export interface OtaFinancialRecord {
  channel: OtaFinancialChannel;
  otaBookingId: string | null;
  beds24BookingId: number;
  bookingGroupId: string | null;
  isGroupMaster: boolean;
  checkIn: string;
  checkOut: string;
  roomCount: number;
  grossBookingAmount: number | null;
  taxAndServiceChargeAmount: number | null;
  otaFees: number | null;
  expectedNetPayout: number | null;
  paymentMethod: string | null;
  guestPaymentStatus: string | null;
  sourceConfidence: SourceConfidence;
  rawRateDescription: string | null;
  rawChannelInfo: string | null;
  rawSourceJson: string | null;
}

interface BookingFinancialRow {
  booking_id: number;
  beds24_booking_id: number;
  master_beds24_booking_id: number | null;
  room_quantity: number | null;
  channel: string | null;
  api_source: string | null;
  api_reference: string | null;
  reference: string | null;
  arrival_date: string;
  departure_date: string;
  price: number | null;
  tax: number | null;
  commission: number | null;
  deposit: number | null;
  currency: string | null;
  rate_description: string | null;
  raw_json: string | null;
}

interface BookingInfoRow {
  booking_id: number;
  info_name: string | null;
  info_value: string | null;
  raw_json: string | null;
}

export interface OtaFinancialBindings {
  DB: D1Database;
}

function cleanText(value: unknown, max = 4000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeChannel(value: string | null | undefined): OtaFinancialChannel {
  const source = (value ?? "").toLowerCase();
  if (source.includes("booking")) return "Booking.com";
  if (source.includes("airbnb")) return "Airbnb";
  if (source.includes("agoda")) return "Agoda";
  if (source.includes("trip") || source.includes("ctrip")) return "Trip.com";
  if (source.includes("traveloka")) return "Traveloka";
  if (source.includes("expedia")) return "Expedia";
  return "Other";
}

function money(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function addKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

function subtract(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.max(Math.round((left - right) * 100) / 100, 0);
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function flattenTextParts(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenTextParts(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      flattenTextParts(item, out);
    }
  }
  return out;
}

function textCorpus(row: BookingFinancialRow, infoRows: BookingInfoRow[]): string {
  const parts = [
    row.rate_description,
    row.raw_json,
    ...infoRows.map((item) => `${item.info_name ?? ""} ${item.info_value ?? ""} ${item.raw_json ?? ""}`),
    ...flattenTextParts(parseJsonObject(row.raw_json)),
  ].filter(Boolean);
  return parts.join("\n");
}

function findAmount(corpus: string, labels: string[]): number | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}\\s*[:=]?\\s*(?:THB|฿)?\\s*(-?[\\d,.]+)`, "i"),
      new RegExp(`["']${escaped}["']\\s*[:=]\\s*["']?(?:THB|฿)?\\s*(-?[\\d,.]+)`, "i"),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(corpus);
      const parsed = money(match?.[1]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function findText(corpus: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}\\s*[:=]\\s*([^\\n,;]+)`, "i").exec(corpus);
    const parsed = cleanText(match?.[1], 120);
    if (parsed) return parsed;
  }
  return null;
}

function confidence(...values: Array<number | null>): SourceConfidence {
  return values.every((value) => value !== null) ? "high" : values.some((value) => value !== null) ? "medium" : "low";
}

function uniqueGroupId(row: BookingFinancialRow): string | null {
  return row.master_beds24_booking_id ? String(row.master_beds24_booking_id) : null;
}

export function normalizeOtaFinancialRecord(row: BookingFinancialRow, infoRows: BookingInfoRow[] = [], groupRoomCount = 1): OtaFinancialRecord {
  const channel = normalizeChannel(row.channel ?? row.api_source);
  const corpus = textCorpus(row, infoRows);
  const totalCharges = findAmount(corpus, ["Total Charges", "totalCharges", "total_charges"]);
  const totalPaid = findAmount(corpus, ["Total Paid", "totalPaid", "total_paid"]);
  const vat = findAmount(corpus, ["VAT", "vat"]);
  const cityTax = findAmount(corpus, ["City Tax", "city tax", "city_tax"]);
  const paymentCharge = findAmount(corpus, ["Payment Charge", "payment charge", "payment_charge"]);
  const totalCommission = findAmount(corpus, ["Total Commission", "Commission", "commission"]);
  const refsell = findAmount(corpus, ["refsell_amt", "refsell amt", "Retail Price", "Sell Amount"]);
  const netInclusive = findAmount(corpus, ["net_inclusive_amt", "net inclusive amt", "Net Inclusive", "Net Amount"]);
  const price = money(row.price);
  const tax = money(row.tax);
  const commission = money(row.commission);
  const rawChannelInfo = cleanText(infoRows.map((item) => `${item.info_name ?? ""}: ${item.info_value ?? ""}`).filter((item) => item.trim() !== ":").join("\n"), 4000)
    ?? cleanText(corpus, 4000);

  let gross: number | null;
  let taxAndService: number | null;
  let fees: number | null;
  let expectedNet: number | null;

  if (channel === "Booking.com") {
    gross = totalCharges ?? price;
    taxAndService = addKnown([vat, cityTax, tax]);
    fees = addKnown([totalCommission ?? commission, paymentCharge]);
    expectedNet = subtract(gross, fees);
  } else if (channel === "Airbnb") {
    gross = price;
    taxAndService = tax;
    fees = commission;
    expectedNet = totalCharges;
  } else if (channel === "Agoda") {
    gross = refsell;
    expectedNet = netInclusive ?? totalCharges ?? price;
    fees = subtract(gross, expectedNet);
    taxAndService = tax;
  } else if (channel === "Trip.com") {
    gross = price;
    taxAndService = tax;
    fees = commission === null ? null : 0;
    expectedNet = totalCharges ?? price;
  } else if (channel === "Traveloka") {
    gross = price;
    taxAndService = tax;
    fees = commission;
    expectedNet = subtract(price, commission);
  } else if (channel === "Expedia") {
    expectedNet = price;
    taxAndService = tax;
    fees = commission;
    gross = addKnown([price, commission]);
  } else {
    gross = price;
    taxAndService = tax;
    fees = commission;
    expectedNet = totalCharges ?? subtract(price, commission) ?? price;
  }

  return {
    channel,
    otaBookingId: cleanText(row.api_reference ?? row.reference, 120),
    beds24BookingId: row.beds24_booking_id,
    bookingGroupId: uniqueGroupId(row),
    isGroupMaster: row.master_beds24_booking_id === null,
    checkIn: row.arrival_date,
    checkOut: row.departure_date,
    roomCount: Math.max(groupRoomCount || row.room_quantity || 1, 1),
    grossBookingAmount: gross,
    taxAndServiceChargeAmount: taxAndService,
    otaFees: fees,
    expectedNetPayout: expectedNet,
    paymentMethod: findText(corpus, ["Payment Method", "paymentMethod", "payment_method"]),
    guestPaymentStatus: totalPaid !== null ? "paid-to-ota" : findText(corpus, ["Guest Payment Status", "paymentStatus", "payment_status"]),
    sourceConfidence: confidence(gross, expectedNet),
    rawRateDescription: cleanText(row.rate_description, 4000),
    rawChannelInfo,
    rawSourceJson: cleanText(row.raw_json, 12000),
  };
}

export async function rebuildOtaFinancialRecords(env: OtaFinancialBindings): Promise<{ processed: number; upserted: number }> {
  const rows = await env.DB.prepare(`
    SELECT booking_id, beds24_booking_id, master_beds24_booking_id, room_quantity, channel, api_source, api_reference, reference,
      arrival_date, departure_date, price, tax, commission, deposit, currency, rate_description, raw_json
    FROM bookings
    WHERE lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
    ORDER BY COALESCE(master_beds24_booking_id, beds24_booking_id), beds24_booking_id
  `).all<BookingFinancialRow>();
  const bookings = rows.results ?? [];
  const groupSizes = new Map<string, number>();
  for (const row of bookings) {
    const key = row.master_beds24_booking_id ? String(row.master_beds24_booking_id) : String(row.beds24_booking_id);
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }

  let upserted = 0;
  const now = new Date().toISOString();
  for (const row of bookings) {
    if (row.master_beds24_booking_id && row.master_beds24_booking_id !== row.beds24_booking_id) continue;
    const infoRows = await env.DB.prepare(`
      SELECT booking_id, info_name, info_value, raw_json
      FROM booking_info_items
      WHERE booking_id = ?
      ORDER BY info_name
    `).bind(row.booking_id).all<BookingInfoRow>();
    const groupKey = row.master_beds24_booking_id ? String(row.master_beds24_booking_id) : String(row.beds24_booking_id);
    const record = normalizeOtaFinancialRecord(row, infoRows.results ?? [], groupSizes.get(groupKey) ?? 1);
    await env.DB.prepare(`
      INSERT INTO ota_financial_records (
        channel, ota_booking_id, beds24_booking_id, booking_group_id, is_group_master, check_in, check_out, room_count,
        gross_booking_amount, tax_and_service_charge_amount, ota_fees, expected_net_payout, payment_method,
        guest_payment_status, source_confidence, raw_rate_description, raw_channel_info, raw_source_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (beds24_booking_id) DO UPDATE SET
        channel = excluded.channel,
        ota_booking_id = excluded.ota_booking_id,
        booking_group_id = excluded.booking_group_id,
        is_group_master = excluded.is_group_master,
        check_in = excluded.check_in,
        check_out = excluded.check_out,
        room_count = excluded.room_count,
        gross_booking_amount = excluded.gross_booking_amount,
        tax_and_service_charge_amount = excluded.tax_and_service_charge_amount,
        ota_fees = excluded.ota_fees,
        expected_net_payout = excluded.expected_net_payout,
        payment_method = excluded.payment_method,
        guest_payment_status = excluded.guest_payment_status,
        source_confidence = excluded.source_confidence,
        raw_rate_description = excluded.raw_rate_description,
        raw_channel_info = excluded.raw_channel_info,
        raw_source_json = excluded.raw_source_json,
        updated_at = excluded.updated_at
    `).bind(
      record.channel,
      record.otaBookingId,
      record.beds24BookingId,
      record.bookingGroupId,
      record.isGroupMaster ? 1 : 0,
      record.checkIn,
      record.checkOut,
      record.roomCount,
      record.grossBookingAmount,
      record.taxAndServiceChargeAmount,
      record.otaFees,
      record.expectedNetPayout,
      record.paymentMethod,
      record.guestPaymentStatus,
      record.sourceConfidence,
      record.rawRateDescription,
      record.rawChannelInfo,
      record.rawSourceJson,
      now,
      now,
    ).run();
    upserted += 1;
  }
  return { processed: bookings.length, upserted };
}
