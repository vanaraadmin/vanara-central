export function normalizeWhatsappPhone(phone: string | null | undefined): string | null {
  const raw = phone?.trim() ?? "";
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Beds24 may contain Thai local numbers such as 0812345678.
  // WhatsApp requires the international format without "+" or spaces.
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) {
    digits = `66${digits.slice(1)}`;
  }

  return digits.length >= 7 ? digits : null;
}
