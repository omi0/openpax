import {
  formatMinutesOfDay,
  instantToLocal,
  localToInstant,
  parseLocalTime,
  weekdayOf,
} from "@openpax/core";
import type {
  BookingDto,
  CustomerDto,
  FeedbackDto,
  ScheduleExceptionDto,
  WaitlistEntryDto,
} from "@openpax/shared";

/**
 * What the tools hand back to the model: the dashboard DTOs trimmed to what a
 * person would read out loud, with times in the restaurant's clock. Every id
 * the model may need for a follow-up call stays in.
 */

/** "20:30" in the restaurant's time zone. */
export function clock(instant: string | Date, timeZone: string): string {
  const local = instantToLocal(new Date(instant), timeZone);
  return formatMinutesOfDay(local.minutesOfDay);
}

/** Wall-clock date + time in the restaurant's time zone → instant. */
export function instantOf(date: string, time: string, timeZone: string): Date {
  return localToInstant(date, parseLocalTime(time), timeZone);
}

export function dateLabel(date: string) {
  return `${date} (${weekdayOf(date)})`;
}

const compact = <T extends Record<string, unknown>>(o: T): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o))
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out as Partial<T>;
};

export function bookingBrief(b: BookingDto, timeZone: string) {
  return compact({
    id: b.id,
    code: b.confirmationCode,
    date: b.serviceDate,
    time: clock(b.startsAt, timeZone),
    partySize: b.partySize,
    status: b.status,
    service: b.serviceName,
    serviceId: b.serviceId,
    guest: compact({
      id: b.customer.id,
      name: b.customer.name,
      phone: b.customer.phone,
      email: b.customer.email,
      visits: b.customer.visitCount || undefined,
      noShows: b.customer.noShowCount || undefined,
      cancellations: b.customer.cancelCount || undefined,
    }),
    notes: b.notes,
    tables: b.tables.map((t) => t.name),
    source: b.source,
    payment: b.payment ? b.payment.status : undefined,
  });
}

export function guestBrief(c: CustomerDto) {
  return compact({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    visits: c.visitCount,
    noShows: c.noShowCount,
    cancellations: c.cancelCount,
    lastVisit: c.lastVisitAt ? c.lastVisitAt.slice(0, 10) : undefined,
    tags: c.tags,
    notes: c.notes,
    language: c.locale,
  });
}

export function waitlistBrief(e: WaitlistEntryDto, timeZone: string) {
  return compact({
    id: e.id,
    date: e.serviceDate,
    preferredTime: e.preferredTime,
    partySize: e.partySize,
    status: e.status,
    service: e.serviceName,
    guest: compact({
      id: e.customer.id,
      name: e.customer.name,
      phone: e.customer.phone,
      email: e.customer.email,
    }),
    notes: e.notes,
    offer: e.offer
      ? {
          time: clock(e.offer.startsAt, timeZone),
          service: e.offer.serviceName,
          expiresAt: e.offer.expiresAt,
        }
      : undefined,
    bookingId: e.bookingId,
  });
}

export function feedbackBrief(f: FeedbackDto, timeZone: string) {
  return compact({
    date: f.serviceDate,
    time: clock(f.startsAt, timeZone),
    guest: f.customer.name,
    guestId: f.customer.id,
    partySize: f.partySize,
    rating: f.rating,
    comment: f.comment,
    bookingId: f.bookingId,
  });
}

export function closureBrief(x: ScheduleExceptionDto, serviceName: string | null) {
  return compact({
    id: x.id,
    from: x.date,
    to: x.endDate,
    closed: x.closed,
    specialHours: x.closed ? undefined : x.windows,
    reason: x.reason,
    service: serviceName ?? "all services",
  });
}

/** Among exceptions covering a day the one that starts last wins (a day reopened inside a holiday). */
export function exceptionFor(
  exceptions: ScheduleExceptionDto[],
  date: string,
  serviceId: string | null,
): ScheduleExceptionDto | null {
  const covering = exceptions
    .filter((x) => x.date <= date && x.endDate >= date)
    .filter((x) => x.serviceId === null || x.serviceId === serviceId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return covering[0] ?? null;
}
