const baseUrl = process.env.VANARA_CHAT_BASE_URL ?? "https://central.vanararetreat.com";
const sessionCookie = process.env.VANARA_CHAT_COOKIE;
const conversationId = process.env.VANARA_CHAT_CONVERSATION_ID;
const messageBody = process.env.VANARA_CHAT_SEND_BODY ?? `Realtime validation ${new Date().toISOString()}`;

if (!sessionCookie || !conversationId) {
  console.error("Set VANARA_CHAT_COOKIE and VANARA_CHAT_CONVERSATION_ID before running this diagnostic.");
  process.exit(2);
}

function chatUrl(path: string): URL {
  return new URL(path, baseUrl);
}

function websocketUrl(conversationId: string): string {
  const url = chatUrl(`/api/chat/conversations/${encodeURIComponent(conversationId)}/live`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function fetchJson(path: string, init: RequestInit = {}) {
  const response = await fetch(chatUrl(path), {
    ...init,
    headers: {
      cookie: sessionCookie,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

function connectClient(label: string): Promise<{ socket: WebSocket; events: unknown[] }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl(conversationId));
    const events: unknown[] = [];
    const timer = setTimeout(() => reject(new Error(`${label} WebSocket did not become ready`)), 8_000);
    socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data));
      events.push(parsed);
      if (parsed.type === "ready") {
        clearTimeout(timer);
        resolve({ socket, events });
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${label} WebSocket failed`));
    });
  });
}

async function waitForEvent(events: unknown[], type: string): Promise<unknown> {
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    const found = events.find((event) => typeof event === "object" && event !== null && (event as { type?: unknown }).type === type);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${type}`);
}

const clientA = await connectClient("client A");
const clientB = await connectClient("client B");
const created = await fetchJson(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
  method: "POST",
  body: JSON.stringify({ body: messageBody }),
});
const message = created?.data;
if (!message?.id) throw new Error("Send response did not include server-confirmed message.");

const realtimeMessage = await waitForEvent(clientB.events, "message.created") as { message?: { id?: number } };
if (realtimeMessage.message?.id !== message.id) {
  throw new Error(`Realtime message id mismatch: expected ${message.id}, got ${realtimeMessage.message?.id}`);
}
await waitForEvent(clientB.events, "conversation.updated");

const history = await fetchJson(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`);
const ids = (history?.data ?? []).map((item: { id: number }) => item.id);
if (!ids.includes(message.id)) {
  throw new Error(`HTTP fallback/history did not include message ${message.id}`);
}

clientA.socket.close();
clientB.socket.close();
console.log(JSON.stringify({
  ok: true,
  conversationId,
  messageId: message.id,
  realtimeEventsSeen: clientB.events.length,
}, null, 2));
