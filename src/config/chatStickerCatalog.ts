export type ChatStickerTone = "warm" | "happy" | "work" | "urgent" | "food" | "cute";

export type ChatStickerCollectionId =
  | "001-040"
  | "31464-31479"
  | "314702758-314702797"
  | "438570294-438570333"
  | "868410649-868410688"
  | "869744633-869744672"
  | "875441729-875441768"
  | "875570169-875570208";

export interface ChatStickerDefinition {
  id: string;
  label: string;
  imageSrc: string;
  thumbnailSrc: string;
  tone: ChatStickerTone;
}

export const CHAT_STICKER_COLLECTION_IDS: readonly ChatStickerCollectionId[] = [
  "001-040",
  "31464-31479",
  "314702758-314702797",
  "438570294-438570333",
  "868410649-868410688",
  "869744633-869744672",
  "875441729-875441768",
  "875570169-875570208",
];

export function chatStickerCollectionIdForStickerId(stickerId: string): ChatStickerCollectionId | null {
  if (/^\d{3}$/.test(stickerId)) {
    const value = Number(stickerId);
    if (value >= 1 && value <= 40) return "001-040";
  }

  const value = Number(stickerId);
  if (!Number.isSafeInteger(value)) return null;
  if (value >= 31464 && value <= 31479) return "31464-31479";
  if (value >= 314702758 && value <= 314702797) return "314702758-314702797";
  if (value >= 438570294 && value <= 438570333) return "438570294-438570333";
  if (value >= 868410649 && value <= 868410688) return "868410649-868410688";
  if (value >= 869744633 && value <= 869744672) return "869744633-869744672";
  if (value >= 875441729 && value <= 875441768) return "875441729-875441768";
  if (value >= 875570169 && value <= 875570208) return "875570169-875570208";
  return null;
}
