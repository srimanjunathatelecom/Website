/**
 * Builds a wa.me deep link with a prefilled message.
 *
 * Lives in its own module (rather than lib/notify.ts, where it started)
 * because notify.ts imports the database client — fine for API routes, fatal
 * for any "use client" component that just wants to render a WhatsApp link.
 * This file has zero imports so both sides can use it.
 *
 * Numbers are normalised to the Indian country code because that's the only
 * market this store serves; a bare 10-digit number from settings becomes
 * 91XXXXXXXXXX, while an already-prefixed one passes through.
 */
export function whatsappLink(phone: string, text: string): string {
  const clean = (phone || "").replace(/[^0-9]/g, "");
  const full = clean.startsWith("91") ? clean : `91${clean}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
