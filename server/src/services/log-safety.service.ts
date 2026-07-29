const TOKEN_LIKE_PATTERN = /[A-Za-z0-9_+./=-]{24,}/g;

export function sanitizeLogMessage(value: unknown, fallback: string): string {
  const message = value instanceof Error ? value.message : String(value || fallback);
  return message.replace(TOKEN_LIKE_PATTERN, "[redacted]");
}
