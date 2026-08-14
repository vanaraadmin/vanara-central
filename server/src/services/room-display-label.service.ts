type UnitDisplaySource = {
  unit_id: number;
  unit_name: string | null;
  unit_type?: string | null;
  room_type_name?: string | null;
  room_name?: string | null;
  position?: number | null;
};

export function looksLikeExternalUnitCode(value: string): boolean {
  const normalized = value.trim();
  return /^[A-Z]{1,3}\d{1,3}$/i.test(normalized) && !/\b(?:bungalow|villa|tent|yurt|room)\b/i.test(normalized);
}

export function canonicalUnitName(unit: UnitDisplaySource): string | null {
  const raw = unit.unit_name?.trim() ?? "";
  if (!raw || looksLikeExternalUnitCode(raw)) return null;
  return raw;
}

export function readableUnitName(unit: UnitDisplaySource): string {
  const canonical = canonicalUnitName(unit);
  return canonical ?? "Room not assigned";
}
