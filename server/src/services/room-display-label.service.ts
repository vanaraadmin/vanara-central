type UnitDisplaySource = {
  unit_id: number;
  unit_name: string | null;
  unit_type?: string | null;
  room_type_name?: string | null;
  room_name?: string | null;
  position?: number | null;
};

const VANARA_UNIT_NAMES = new Map<number, string>([
  [1, "Villa 10"],
  [2, "Villa 13"],
  [3, "Bungalow 1"],
  [4, "Bungalow 2"],
  [5, "Bungalow 3"],
  [6, "Bungalow 4"],
  [7, "Bungalow 5"],
  [8, "Bungalow 6"],
  [9, "Bungalow 7"],
  [10, "Bungalow 8"],
  [11, "Bungalow 9"],
  [12, "Bungalow 11"],
  [13, "Bungalow 12"],
  [14, "Tent 1"],
  [15, "Tent 2"],
  [16, "Tent 3"],
  [17, "Tent 4"],
  [18, "Tent 5"],
  [19, "Tent 6"],
]);

function looksLikeInternalUnitCode(value: string): boolean {
  const normalized = value.trim();
  return /^[A-Z]{1,3}\d{1,3}$/i.test(normalized) && !/\b(?:bungalow|villa|tent|yurt|room)\b/i.test(normalized);
}

function familyLabel(unit: UnitDisplaySource): string | null {
  const source = `${unit.unit_type ?? ""} ${unit.room_type_name ?? ""} ${unit.room_name ?? ""}`.toLowerCase();
  if (source.includes("bungalow")) return "Bungalow";
  if (source.includes("villa")) return "Villa";
  if (source.includes("tent") || source.includes("yurt")) return "Tent";
  return null;
}

export function readableUnitName(unit: UnitDisplaySource): string {
  const raw = unit.unit_name?.trim() ?? "";
  if (raw && !looksLikeInternalUnitCode(raw)) return raw;

  const known = VANARA_UNIT_NAMES.get(unit.unit_id);
  if (known) return known;

  const family = familyLabel(unit);
  if (family && unit.position && unit.position > 0) return `${family} ${unit.position}`;

  return raw || family || "Room not assigned";
}
