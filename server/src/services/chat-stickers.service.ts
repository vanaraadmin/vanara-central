export interface ChatStickerDefinition {
  id: string;
  label: string;
  symbol: string;
  tone: "warm" | "happy" | "work" | "urgent" | "food" | "cute";
}

export const CHAT_STICKERS: ChatStickerDefinition[] = [
  { id: "wai-hello", label: "Wai hello", symbol: "🙏", tone: "warm" },
  { id: "wai-thanks", label: "Thank you", symbol: "🙏", tone: "warm" },
  { id: "soft-bow", label: "Respectful bow", symbol: "🙇", tone: "warm" },
  { id: "ok-team", label: "OK", symbol: "👌", tone: "happy" },
  { id: "yes-done", label: "Done", symbol: "✅", tone: "work" },
  { id: "laugh-555", label: "555", symbol: "😂", tone: "happy" },
  { id: "big-smile", label: "Big smile", symbol: "😄", tone: "happy" },
  { id: "shy-smile", label: "Shy smile", symbol: "😊", tone: "warm" },
  { id: "heart-soft", label: "Heart", symbol: "💚", tone: "warm" },
  { id: "hearts", label: "Hearts", symbol: "💕", tone: "warm" },
  { id: "eyes-check", label: "Checking", symbol: "👀", tone: "work" },
  { id: "urgent-fire", label: "Urgent", symbol: "🔥", tone: "urgent" },
  { id: "alert", label: "Please note", symbol: "⚠️", tone: "urgent" },
  { id: "on-my-way", label: "On my way", symbol: "🏃", tone: "work" },
  { id: "cleaning", label: "Cleaning", symbol: "🧹", tone: "work" },
  { id: "sparkle-clean", label: "Clean", symbol: "✨", tone: "work" },
  { id: "water-refill", label: "Water refill", symbol: "💧", tone: "work" },
  { id: "linen", label: "Linen", symbol: "🛏️", tone: "work" },
  { id: "tools", label: "Maintenance", symbol: "🛠️", tone: "work" },
  { id: "key-room", label: "Room key", symbol: "🔑", tone: "work" },
  { id: "chef", label: "Chef", symbol: "👨‍🍳", tone: "food" },
  { id: "restaurant", label: "Restaurant", symbol: "🍽️", tone: "food" },
  { id: "coffee", label: "Coffee", symbol: "☕", tone: "food" },
  { id: "rice", label: "Rice", symbol: "🍚", tone: "food" },
  { id: "spicy", label: "Spicy", symbol: "🌶️", tone: "food" },
  { id: "panda-hi", label: "Panda hi", symbol: "🐼", tone: "cute" },
  { id: "panda-love", label: "Panda love", symbol: "🐼", tone: "cute" },
  { id: "monk-calm", label: "Calm", symbol: "🧘", tone: "warm" },
  { id: "anime-wow", label: "Wow", symbol: "😮", tone: "happy" },
  { id: "anime-sorry", label: "Sorry", symbol: "🥺", tone: "warm" },
  { id: "tired", label: "Tired", symbol: "😴", tone: "warm" },
  { id: "sweat", label: "Almost done", symbol: "😅", tone: "work" },
  { id: "sorry", label: "Sorry", symbol: "🙏", tone: "warm" },
  { id: "please", label: "Please", symbol: "🥹", tone: "warm" },
  { id: "hands", label: "Hands", symbol: "🙌", tone: "happy" },
  { id: "clap", label: "Great job", symbol: "👏", tone: "happy" },
  { id: "star", label: "Excellent", symbol: "⭐", tone: "happy" },
  { id: "sun", label: "Morning", symbol: "☀️", tone: "warm" },
  { id: "moon", label: "Night", symbol: "🌙", tone: "warm" },
  { id: "rain", label: "Rain", symbol: "🌧️", tone: "work" },
  { id: "island", label: "Island", symbol: "🏝️", tone: "happy" },
  { id: "scooter", label: "Scooter", symbol: "🛵", tone: "work" },
  { id: "car", label: "Transfer", symbol: "🚐", tone: "work" },
  { id: "boat", label: "Boat", symbol: "⛴️", tone: "work" },
  { id: "phone", label: "Call", symbol: "📞", tone: "work" },
  { id: "camera", label: "Photo", symbol: "📷", tone: "work" },
  { id: "note", label: "Note", symbol: "📝", tone: "work" },
  { id: "gift", label: "Gift", symbol: "🎁", tone: "happy" },
  { id: "party", label: "Celebrate", symbol: "🎉", tone: "happy" },
  { id: "flower", label: "Soft thanks", symbol: "🌺", tone: "warm" },
  { id: "leaf", label: "Vanara", symbol: "🍃", tone: "warm" },
  { id: "coconut", label: "Coconut", symbol: "🥥", tone: "food" },
  { id: "problem", label: "Problem", symbol: "🫣", tone: "urgent" },
  { id: "fixed", label: "Fixed", symbol: "🔧", tone: "work" },
];

export function chatStickerById(stickerId: string): ChatStickerDefinition | null {
  return CHAT_STICKERS.find((sticker) => sticker.id === stickerId) ?? null;
}
