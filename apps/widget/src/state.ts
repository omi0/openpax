import type {
  AvailabilityResponse,
  AvailabilitySlotDto,
  PublicBookingDto,
  PublicWaitlistEntryDto,
  PublicWidgetConfigDto,
} from "@openpax/shared";
import { computed, signal } from "@preact/signals";
import { ApiRequestError, api } from "./api.js";
import { addDays, addMonths, monthOf, todayLocal } from "./dates.js";
import { setLocale } from "./i18n.js";

export type Step = "when" | "details" | "done" | "waitlist" | "waitlist_done";

export const slug = signal<string>("");
export const config = signal<PublicWidgetConfigDto | null>(null);
export const loadError = signal<string | null>(null);

export const step = signal<Step>("when");
export const partySize = signal(2);
export const date = signal<string>("");
export const month = signal<string>("");
export const openDates = signal<Set<string>>(new Set());
export const availability = signal<AvailabilityResponse | null>(null);
export const loadingSlots = signal(false);
export const selectedSlot = signal<AvailabilitySlotDto | null>(null);

export const guest = signal({ name: "", email: "", phone: "", notes: "", marketing: false });
export const submitting = signal(false);
export const submitError = signal<string | null>(null);
export const result = signal<PublicBookingDto | null>(null);
export const waitlistResult = signal<PublicWaitlistEntryDto | null>(null);
/** No bookable time on the chosen date: the guest may queue instead. */
export const canJoinWaitlist = computed(() => {
  const cfg = config.value;
  const data = availability.value;
  if (!cfg?.policy.waitlistEnabled || !data || data.closed) return false;
  return data.slots.every((s) => !s.available);
});

export const timezone = computed(() => config.value?.restaurant.timezone ?? "UTC");
export const today = computed(() => todayLocal(timezone.value));
export const selectedServiceName = computed(() => {
  const s = selectedSlot.value;
  if (!s || !availability.value) return "";
  return availability.value.services.find((x) => x.id === s.serviceId)?.name ?? "";
});

export async function loadConfig(value: string, lang?: string | null) {
  slug.value = value;
  try {
    const cfg = await api.config(value);
    config.value = cfg;
    setLocale(lang ?? cfg.widget.defaultLocale);
    partySize.value = Math.max(cfg.policy.minPartySize, Math.min(2, cfg.policy.maxPartySize));
    const t = todayLocal(cfg.restaurant.timezone);
    await setMonth(monthOf(t));
    // start on the first day that can be booked: today when open, otherwise the
    // next open day (a guest landing on the closing day should not see "Closed")
    date.value = (await firstOpenDate(t, addDays(t, cfg.policy.maxAdvanceDays))) ?? t;
    await loadSlots();
  } catch (error) {
    loadError.value =
      error instanceof ApiRequestError && error.status === 404
        ? "errors.notFound"
        : "errors.generic";
  }
}

/** First open date between `from` and `to`, looking at most two months ahead; leaves the month on it. */
async function firstOpenDate(from: string, to: string): Promise<string | null> {
  for (let i = 0; i < 2; i += 1) {
    const hit = [...openDates.value].filter((d) => d >= from && d <= to).sort()[0];
    if (hit) return hit;
    const next = addMonths(month.value, 1);
    if (`${next}-01` > to) return null;
    await setMonth(next);
  }
  await setMonth(monthOf(from));
  return null;
}

export async function setMonth(value: string) {
  month.value = value;
  try {
    const res = await api.month(slug.value, value);
    openDates.value = new Set(res.openDates);
  } catch {
    openDates.value = new Set();
  }
}

export async function loadSlots() {
  if (!date.value) return;
  loadingSlots.value = true;
  selectedSlot.value = null;
  try {
    availability.value = await api.availability(slug.value, date.value, partySize.value);
  } catch {
    availability.value = null;
  } finally {
    loadingSlots.value = false;
  }
}

export async function selectDate(value: string) {
  date.value = value;
  await loadSlots();
}

export async function selectPartySize(value: number) {
  partySize.value = value;
  await loadSlots();
}

export function reset() {
  step.value = "when";
  selectedSlot.value = null;
  result.value = null;
  waitlistResult.value = null;
  submitError.value = null;
  guest.value = { name: "", email: "", phone: "", notes: "", marketing: false };
  void loadSlots();
}
