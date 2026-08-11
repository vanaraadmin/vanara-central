import cover001040 from "../assets/stickers/001_key.png";
import cover3146431479 from "../assets/stickers/31464_key.png";
import cover314702 from "../assets/stickers/314702758_key.png";
import cover438570 from "../assets/stickers/438570294_key.png";
import cover868410 from "../assets/stickers/868410649_key.png";
import cover869744 from "../assets/stickers/869744633_key.png";
import cover875441 from "../assets/stickers/875441729_key.png";
import cover875570 from "../assets/stickers/875570169_key.png";
import {
  chatStickerCollectionIdForStickerId,
  type ChatStickerCollectionId,
  type ChatStickerDefinition,
} from "./chatStickerCatalog";

export type { ChatStickerCollectionId, ChatStickerDefinition } from "./chatStickerCatalog";

interface ChatStickerCollectionModule {
  CHAT_STICKERS: readonly ChatStickerDefinition[];
}

export interface ChatStickerCollectionSummary {
  id: ChatStickerCollectionId;
  position: number;
  coverSrc: string;
}

const collectionLoaders: Record<ChatStickerCollectionId, () => Promise<ChatStickerCollectionModule>> = {
  "001-040": () => import("./chat-sticker-collections/collection-001-040"),
  "31464-31479": () => import("./chat-sticker-collections/collection-31464-31479"),
  "314702758-314702797": () => import("./chat-sticker-collections/collection-314702758-314702797"),
  "438570294-438570333": () => import("./chat-sticker-collections/collection-438570294-438570333"),
  "868410649-868410688": () => import("./chat-sticker-collections/collection-868410649-868410688"),
  "869744633-869744672": () => import("./chat-sticker-collections/collection-869744633-869744672"),
  "875441729-875441768": () => import("./chat-sticker-collections/collection-875441729-875441768"),
  "875570169-875570208": () => import("./chat-sticker-collections/collection-875570169-875570208"),
};

const collectionCache = new Map<ChatStickerCollectionId, Promise<readonly ChatStickerDefinition[]>>();

export const CHAT_STICKER_COLLECTIONS: readonly ChatStickerCollectionSummary[] = [
  { id: "001-040", position: 1, coverSrc: cover001040 },
  { id: "31464-31479", position: 2, coverSrc: cover3146431479 },
  { id: "314702758-314702797", position: 3, coverSrc: cover314702 },
  { id: "438570294-438570333", position: 4, coverSrc: cover438570 },
  { id: "868410649-868410688", position: 5, coverSrc: cover868410 },
  { id: "869744633-869744672", position: 6, coverSrc: cover869744 },
  { id: "875441729-875441768", position: 7, coverSrc: cover875441 },
  { id: "875570169-875570208", position: 8, coverSrc: cover875570 },
];

export function loadChatStickerCollection(collectionId: ChatStickerCollectionId): Promise<readonly ChatStickerDefinition[]> {
  const cached = collectionCache.get(collectionId);
  if (cached) return cached;

  const pending = collectionLoaders[collectionId]().then((module) => module.CHAT_STICKERS);
  collectionCache.set(collectionId, pending);
  pending.catch(() => collectionCache.delete(collectionId));
  return pending;
}

export async function loadChatStickerById(stickerId: string): Promise<ChatStickerDefinition | null> {
  const collectionId = chatStickerCollectionIdForStickerId(stickerId);
  if (!collectionId) return null;
  const stickers = await loadChatStickerCollection(collectionId);
  return stickers.find((sticker) => sticker.id === stickerId) ?? null;
}
