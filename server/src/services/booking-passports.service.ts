import type { PassportData } from "./passport-ocr.service.js";

export interface BookingPassportBindings {
  DB: D1Database;
}

export interface BookingPassportRecord {
  id: number;
  bookingId: number;
  objectKey: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  gender: string | null;
  birthDate: string | null;
  createdAt: string;
}

interface BookingPassportRow {
  id: number;
  booking_id: number;
  object_key: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  passport_number: string | null;
  nationality: string | null;
  gender: string | null;
  birth_date: string | null;
  created_at: string;
}

export interface CreateBookingPassportInput {
  bookingId: number;
  objectKey: string;
  passport: PassportData;
}

function mapBookingPassport(row: BookingPassportRow): BookingPassportRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    objectKey: row.object_key,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    passportNumber: row.passport_number,
    nationality: row.nationality,
    gender: row.gender,
    birthDate: row.birth_date,
    createdAt: row.created_at,
  };
}

export async function createBookingPassport(env: BookingPassportBindings, input: CreateBookingPassportInput): Promise<BookingPassportRecord> {
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO booking_passports (
      booking_id,
      object_key,
      first_name,
      middle_name,
      last_name,
      passport_number,
      nationality,
      gender,
      birth_date,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.bookingId,
    input.objectKey,
    input.passport.firstName,
    input.passport.middleName,
    input.passport.lastName,
    input.passport.passportNumber,
    input.passport.nationality,
    input.passport.gender,
    input.passport.birthDate,
    createdAt,
  ).run();

  return {
    id: Number(result.meta.last_row_id),
    bookingId: input.bookingId,
    objectKey: input.objectKey,
    firstName: input.passport.firstName,
    middleName: input.passport.middleName,
    lastName: input.passport.lastName,
    passportNumber: input.passport.passportNumber,
    nationality: input.passport.nationality,
    gender: input.passport.gender,
    birthDate: input.passport.birthDate,
    createdAt,
  };
}

export async function listBookingPassports(env: BookingPassportBindings, bookingId: number): Promise<BookingPassportRecord[]> {
  const rows = await env.DB.prepare(`
    SELECT
      id,
      booking_id,
      object_key,
      first_name,
      middle_name,
      last_name,
      passport_number,
      nationality,
      gender,
      birth_date,
      created_at
    FROM booking_passports
    WHERE booking_id = ?
    ORDER BY created_at ASC, id ASC
  `).bind(bookingId).all<BookingPassportRow>();

  return (rows.results ?? []).map(mapBookingPassport);
}
