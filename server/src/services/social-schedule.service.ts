const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokDate(nowIso: string): string {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) throw new Error("Invalid Social scheduler timestamp.");
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function socialPublishSlotForBangkokDate(nowIso: string): string {
  const localDate = bangkokDate(nowIso);
  const localSixAsUtc = new Date(`${localDate}T06:00:00.000Z`);
  return new Date(localSixAsUtc.getTime() - BANGKOK_OFFSET_MS).toISOString();
}

export function socialBangkokDayBounds(nowIso: string): { start: string; end: string } {
  const localDate = bangkokDate(nowIso);
  const localMidnightAsUtc = new Date(`${localDate}T00:00:00.000Z`);
  const start = new Date(localMidnightAsUtc.getTime() - BANGKOK_OFFSET_MS);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
