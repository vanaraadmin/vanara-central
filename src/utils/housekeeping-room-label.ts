const RAW_EXTERNAL_UNIT_CODE = /^[A-Z]{1,3}\d{1,3}$/i;

export function safeHousekeepingRoomLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized || RAW_EXTERNAL_UNIT_CODE.test(normalized)) return "Room not assigned";
  return normalized;
}
