export const CHAT_THREAD_BOOTSTRAP_TIMEOUT_MS = 8_000;

type ChatThreadBootstrapState = "select" | "loading" | "ready";

export type ChatThreadLoadPhase = "select" | "loading" | "unavailable" | "ready";

export function resolveChatThreadLoadPhase(input: {
  bootstrapState: ChatThreadBootstrapState;
  hasConversation: boolean;
  hasMessages: boolean;
  timedOut: boolean;
  retrying: boolean;
  failed: boolean;
}): ChatThreadLoadPhase {
  if (input.bootstrapState === "select") return "select";
  if (input.hasConversation && input.hasMessages) return "ready";
  if (input.retrying) return "loading";
  if (input.timedOut || input.failed) return "unavailable";
  return "loading";
}

export function chatThreadUnavailableCopy(language: "en" | "th") {
  return language === "th"
    ? { title: "เปิดแชตไม่ได้", action: "ลองอีกครั้ง" }
    : { title: "Chat could not be loaded", action: "Try again" };
}
