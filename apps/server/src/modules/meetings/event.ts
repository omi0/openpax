import type { booking, bookingMeeting, customer, restaurant } from "@openpax/db";
import type { FeedEvent } from "./ics.js";

export const COPY = {
  it: {
    summary: (name: string, party: number) => `Appuntamento con ${name} · evento ${party} persone`,
    subject: { scheduled: "Nuovo appuntamento", cancelled: "Appuntamento annullato" },
    intro: {
      scheduled: "Hai un appuntamento per organizzare un evento.",
      cancelled: "Questo appuntamento è stato annullato.",
    },
    when: "Appuntamento",
    guest: "Cliente",
    phone: "Telefono",
    event: "Evento",
    people: (n: number) => `${n} persone`,
    notes: "Note",
    code: "Codice prenotazione",
    add: "Aggiungi a Google Calendar",
    calendar: "Appuntamenti",
  },
  en: {
    summary: (name: string, party: number) => `Meeting with ${name} · event for ${party}`,
    subject: { scheduled: "New meeting", cancelled: "Meeting cancelled" },
    intro: {
      scheduled: "You have a meeting to plan an event.",
      cancelled: "This meeting was cancelled.",
    },
    when: "Meeting",
    guest: "Guest",
    phone: "Phone",
    event: "Event",
    people: (n: number) => `${n} guests`,
    notes: "Notes",
    code: "Booking code",
    add: "Add to Google Calendar",
    calendar: "Meetings",
  },
};

/** Building a formatter is slow and the feed formats every meeting twice. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatWhen(d: Date, timeZone: string, locale: string): string {
  const key = `${locale}|${timeZone}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(d);
}

export interface MeetingContext {
  meeting: typeof bookingMeeting.$inferSelect;
  booking: typeof booking.$inferSelect;
  customer: typeof customer.$inferSelect;
  restaurant: typeof restaurant.$inferSelect;
}

const localeOf = (r: { locale: string }) => (r.locale === "it" ? "it" : "en");

/**
 * What the host reads about a meeting. The subscription calendar passes
 * `notes: false`: free text can hold allergies and the like, which should not
 * end up in a third-party calendar.
 */
export function meetingEvent(row: MeetingContext, now: Date, { notes = true } = {}) {
  const locale = localeOf(row.restaurant);
  const c = COPY[locale];
  const tz = row.restaurant.timezone;
  const details: Array<[string, string]> = [
    [c.when, formatWhen(row.meeting.startsAt, tz, locale)],
    [c.guest, row.customer.name],
    ...(row.customer.phone ? ([[c.phone, row.customer.phone]] as Array<[string, string]>) : []),
    [
      c.event,
      `${formatWhen(row.booking.startsAt, tz, locale)} · ${c.people(row.booking.partySize)}`,
    ],
    ...(notes && row.booking.notes
      ? ([[c.notes, row.booking.notes]] as Array<[string, string]>)
      : []),
    [c.code, row.booking.confirmationCode],
  ];
  const event: FeedEvent = {
    uid: `${row.meeting.id}@openpax`,
    sequence: row.meeting.sequence,
    startsAt: row.meeting.startsAt,
    endsAt: row.meeting.endsAt,
    stamp: now,
    summary: c.summary(row.customer.name, row.booking.partySize),
    description: details.map(([k, v]) => `${k}: ${v}`).join("\n"),
    location: [row.restaurant.name, row.restaurant.address].filter(Boolean).join(", "),
  };
  return { copy: c, details, event };
}

/** Name of the host's subscription calendar. */
export const feedName = (r: { name: string; locale: string }) =>
  `${r.name} · ${COPY[localeOf(r)].calendar}`;
