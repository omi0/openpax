import { type CountryCode, parsePhoneNumberWithError } from "libphonenumber-js";

const countryByLocale: Record<string, CountryCode> = { it: "IT", en: "GB" };

/** Normalise to E.164; returns null when the number cannot be parsed or is invalid. */
export function normalizePhone(
  raw: string | null | undefined,
  locale?: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberWithError(trimmed, countryByLocale[locale ?? ""] ?? "IT");
    return parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
