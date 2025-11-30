import { computed, signal } from "@preact/signals";
import type {
  AvailabilityResponse,
  AvailabilitySlotDto,
  PublicBookingDto,
  PublicWidgetConfigDto,
} from "@sitli/shared";
import { ApiRequestError, api } from "./api.js";
import { monthOf, todayLocal } from "./dates.js";
import { setLocale } from "./i18n.js";

export type Step = "when" | "details" | "done";

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
    date.value = t;
    await setMonth(monthOf(t));
    await loadSlots();
  } catch (error) {
    loadError.value =
      error instanceof ApiRequestError && error.status === 404
        ? "errors.notFound"
        : "errors.generic";
  }
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
  submitError.value = null;
  guest.value = { name: "", email: "", phone: "", notes: "", marketing: false };
  void loadSlots();
}
