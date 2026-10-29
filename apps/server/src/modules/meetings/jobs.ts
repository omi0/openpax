import {
  booking,
  bookingMeeting,
  bookingPolicy,
  customer,
  notificationLog,
  restaurant,
} from "@openpax/db";
import { eq, sql } from "drizzle-orm";
import { defineEventHandler } from "../../events/dispatch.js";
import { defineJob } from "../../jobs/queue.js";
import type { NotificationProvider } from "../../notifications/provider.js";
import { parseAddress } from "../../notifications/providers/address.js";
import { resolveProvider } from "../notifications/index.js";
import { buildIcs, googleCalendarLink, type IcsEvent } from "./ics.js";
import { cancelMeetingOfBooking } from "./service.js";

type Kind = "scheduled" | "cancelled";

const COPY = {
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
  },
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatWhen = (d: Date, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(d);

export const meetingEventHandlers = [
  defineEventHandler({
    type: "meeting.scheduled",
    handle: async (event, ctx) => {
      await ctx.jobs.send("notify.meeting", {
        ...event.payload,
        kind: "scheduled",
        dedupeKey: `meeting:${event.id}`,
      });
    },
  }),
  defineEventHandler({
    type: "meeting.cancelled",
    handle: async (event, ctx) => {
      await ctx.jobs.send("notify.meeting", {
        ...event.payload,
        kind: "cancelled",
        dedupeKey: `meeting:${event.id}`,
      });
    },
  }),
  defineEventHandler({
    type: "booking.cancelled",
    handle: async (event, ctx) => {
      if (event.restaurantId)
        await cancelMeetingOfBooking(ctx, event.restaurantId, event.payload.bookingId);
    },
  }),
];

/**
 * Calendar invite (or cancellation) for the host, through the restaurant's
 * email provider. A stale job (the meeting moved again since) sends nothing:
 * the newer event carries the current time.
 */
export const meetingEmailJob = defineJob<{
  meetingId: string;
  bookingId: string;
  sequence: number;
  kind: Kind;
  dedupeKey: string;
}>({
  name: "notify.meeting",
  retryLimit: 3,
  retryDelaySeconds: 60,
  handler: async ({ meetingId, sequence, kind, dedupeKey }, ctx) => {
    const [row] = await ctx.db
      .select({ meeting: bookingMeeting, booking, customer, restaurant, policy: bookingPolicy })
      .from(bookingMeeting)
      .innerJoin(booking, eq(booking.id, bookingMeeting.bookingId))
      .innerJoin(customer, eq(customer.id, booking.customerId))
      .innerJoin(restaurant, eq(restaurant.id, bookingMeeting.restaurantId))
      .innerJoin(bookingPolicy, eq(bookingPolicy.restaurantId, bookingMeeting.restaurantId))
      .where(eq(bookingMeeting.id, meetingId))
      .limit(1);
    if (!row || row.meeting.sequence !== sequence) return;
    const hostEmail = row.policy.meetingHostEmail;
    if (!hostEmail) return;

    await ctx.db
      .insert(notificationLog)
      .values({
        restaurantId: row.restaurant.id,
        bookingId: row.booking.id,
        event: kind === "scheduled" ? "meeting_invite" : "meeting_cancel",
        channel: "email",
        audience: "restaurant",
        dedupeKey,
        recipient: hostEmail,
        status: "queued",
      })
      .onConflictDoNothing({ target: notificationLog.dedupeKey });
    const [log] = await ctx.db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.dedupeKey, dedupeKey))
      .limit(1);
    if (!log || log.status === "sent" || log.status === "skipped") return;

    const resolved = await resolveProvider(ctx, row.restaurant, "email");
    if (!resolved) {
      await ctx.db
        .update(notificationLog)
        .set({ status: "skipped", error: "no email provider configured" })
        .where(eq(notificationLog.id, log.id));
      return;
    }

    const locale = row.restaurant.locale === "it" ? "it" : "en";
    const c = COPY[locale];
    const tz = row.restaurant.timezone;
    const hostName = row.policy.meetingHostName ?? undefined;
    const details: Array<[string, string]> = [
      [c.when, formatWhen(row.meeting.startsAt, tz, locale)],
      [c.guest, row.customer.name],
      ...(row.customer.phone ? ([[c.phone, row.customer.phone]] as Array<[string, string]>) : []),
      [
        c.event,
        `${formatWhen(row.booking.startsAt, tz, locale)} · ${c.people(row.booking.partySize)}`,
      ],
      ...(row.booking.notes ? ([[c.notes, row.booking.notes]] as Array<[string, string]>) : []),
      [c.code, row.booking.confirmationCode],
    ];
    const ics: IcsEvent = {
      uid: `${row.meeting.id}@openpax`,
      method: kind === "scheduled" ? "REQUEST" : "CANCEL",
      sequence: row.meeting.sequence,
      startsAt: row.meeting.startsAt,
      endsAt: row.meeting.endsAt,
      stamp: ctx.now(),
      summary: c.summary(row.customer.name, row.booking.partySize),
      description: details.map(([k, v]) => `${k}: ${v}`).join("\n"),
      location: [row.restaurant.name, row.restaurant.address].filter(Boolean).join(", "),
      organizer: parseAddress(String(resolved.config.from ?? hostEmail)),
      attendee: { email: hostEmail, ...(hostName ? { name: hostName } : {}) },
    };
    const link = kind === "scheduled" ? googleCalendarLink(ics) : null;
    const subject = `${c.subject[kind]}: ${ics.summary}`;
    const text = [
      c.intro[kind],
      "",
      ...details.map(([k, v]) => `${k}: ${v}`),
      ...(link ? ["", `${c.add}: ${link}`] : []),
    ].join("\n");
    const html = [
      `<p>${escapeHtml(c.intro[kind])}</p>`,
      `<table cellpadding="4">${details
        .map(
          ([k, v]) =>
            `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>`,
      ...(link ? [`<p><a href="${escapeHtml(link)}">${escapeHtml(c.add)}</a></p>`] : []),
    ].join("");

    try {
      const result = await (resolved.provider as NotificationProvider<"email">).send(
        {
          to: hostEmail,
          ...(hostName ? { toName: hostName } : {}),
          subject,
          html,
          text,
          calendar: { method: ics.method, ics: buildIcs(ics) },
        },
        resolved.config,
      );
      await ctx.db
        .update(notificationLog)
        .set({
          status: "sent",
          providerId: resolved.provider.id,
          providerMessageId: result.providerMessageId ?? null,
          error: null,
          sentAt: ctx.now(),
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, log.id));
    } catch (error) {
      await ctx.db
        .update(notificationLog)
        .set({
          status: "failed",
          providerId: resolved.provider.id,
          error: error instanceof Error ? error.message : String(error),
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, log.id));
      throw error;
    }
  },
});
