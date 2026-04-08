import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  addDaysToLocalDate,
  BOOKING_ACTIONS,
  BOOKING_STATUSES,
  todayIn,
  WEEKDAYS,
  weekdayOf,
} from "@sitli/core";
import { type BookingDto, localDateSchema, localTimeSchema, partySizeSchema } from "@sitli/shared";
import { z } from "zod";
import type { Permissions } from "../../auth/access.js";
import { writeAudit } from "../../lib/audit.js";
import { getAnalytics } from "../analytics/index.js";
import { getAvailability } from "../availability/index.js";
import {
  applyBookingAction,
  createBooking,
  getBookingWithRelations,
  listBookings,
  toBookingDto,
  updateBooking,
} from "../bookings/index.js";
import { getCustomer, listCustomers, toCustomerDto, updateCustomer } from "../customers/index.js";
import { listFeedback } from "../feedback/index.js";
import {
  createException,
  getPolicy,
  listAreas,
  listExceptions,
  listServices,
} from "../restaurants/index.js";
import { cancelEntry, listEntries, offerEntry, toEntryDto } from "../waitlist/index.js";
import {
  bookingBrief,
  clock,
  closureBrief,
  dateLabel,
  exceptionFor,
  feedbackBrief,
  guestBrief,
  instantOf,
  waitlistBrief,
} from "./format.js";
import type { ToolContext } from "./server.js";

/** A message meant for the model (and through it the user), not a bug. */
export class ToolError extends Error {}

export interface AssistantTool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** `write` tools are hidden from read-only connections. */
  scope: "read" | "write";
  /** Hidden from members whose role lacks them; checked again per restaurant on each call. */
  permissions: Permissions;
  annotations: ToolAnnotations;
  run: (args: z.infer<z.ZodObject<S>>, tc: ToolContext) => Promise<unknown>;
}

const define = <S extends z.ZodRawShape>(tool: AssistantTool<S>) =>
  tool as unknown as AssistantTool;

const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};

const restaurantArg = {
  restaurantId: z
    .uuid()
    .optional()
    .describe("Only when the account has several restaurants (see list_restaurants)."),
};
const dateArg = localDateSchema.describe("YYYY-MM-DD in the restaurant's time zone");
const timeArg = localTimeSchema.describe("HH:MM in the restaurant's time zone");
const limitArg = (max: number, def: number) =>
  z.number().int().min(1).max(max).default(def).describe(`At most ${max}.`);

const guestArg = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("With country code when known, e.g. +39 333 1234567"),
  email: z.email().optional(),
});

/** Pick the service that takes bookings at that time, so the model need not know service ids. */
async function serviceAt(
  tc: ToolContext,
  row: Parameters<typeof getAvailability>[1],
  date: string,
  startsAt: Date,
  partySize: number,
  areaId: string | null,
  explicit?: string,
): Promise<string> {
  if (explicit) return explicit;
  const availability = await getAvailability(tc.ctx, row, { date, partySize, areaId, staff: true });
  const iso = startsAt.toISOString();
  const slot = availability.slots.find((s) => s.startsAt === iso);
  if (slot) return slot.serviceId;
  if (availability.services.length === 1) return (availability.services[0] as { id: string }).id;
  const times = availability.slots
    .filter((s) => s.available)
    .map((s) => clock(s.startsAt, row.timezone));
  throw new ToolError(
    times.length
      ? `No service takes bookings at ${clock(startsAt, row.timezone)} on ${date}. Bookable times: ${times.join(", ")}.`
      : `Nothing is bookable on ${date}${availability.reasons.length ? ` (${availability.reasons.join(", ")})` : ""}.`,
  );
}

const ACTIVE_STATUSES = ["pending", "confirmed", "seated"] as const;

export const ASSISTANT_TOOLS: AssistantTool[] = [
  define({
    name: "list_restaurants",
    title: "Restaurants",
    description:
      "The restaurants this account can use, with your role in each and today's date there.",
    input: {},
    scope: "read",
    permissions: { restaurant: ["read"] },
    annotations: READ,
    run: async (_args, tc) => ({
      restaurants: tc.restaurants.map((r) => ({
        id: r.id,
        name: r.name,
        timezone: r.timezone,
        role: r.role,
        today: todayIn(r.timezone, tc.ctx.now()),
      })),
    }),
  }),

  define({
    name: "get_day",
    title: "The day",
    description:
      "Everything about one day: opening hours, whether it is closed, every booking with time, party size, guest and notes, totals, and who is on the waitlist. Defaults to today.",
    input: { ...restaurantArg, date: dateArg.optional() },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, date }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const day = date ?? todayIn(row.timezone, tc.ctx.now());
      const [bookings, waitlist, exceptions, services] = await Promise.all([
        listBookings(tc.ctx, row, { date: day, page: 1, pageSize: 200, order: "asc" }),
        listEntries(tc.ctx, row, {
          date: day,
          status: ["waiting", "offered"],
          page: 1,
          pageSize: 50,
        }),
        listExceptions(tc.ctx, row.id),
        listServices(tc.ctx, row.id),
      ]);
      const weekday = weekdayOf(day);
      const hours = services
        .filter((s) => s.active)
        .map((s) => {
          const exception = exceptionFor(exceptions, day, s.id);
          const regular = s.weeklyHours[weekday] ?? [];
          const windows = exception
            ? exception.closed
              ? []
              : (exception.windows ?? regular)
            : regular;
          return {
            service: s.name,
            serviceId: s.id,
            open: windows.map((w) => `${w.start}-${w.end}`),
            ...(exception?.closed ? { closed: true, reason: exception.reason ?? undefined } : {}),
            ...(exception && !exception.closed
              ? { specialHours: true, reason: exception.reason ?? undefined }
              : {}),
          };
        });
      const live = bookings.items.filter((b) => b.status !== "cancelled" && b.status !== "no_show");
      const byStatus: Record<string, number> = {};
      for (const b of bookings.items) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
      return {
        date: dateLabel(day),
        hours,
        totals: {
          bookings: live.length,
          covers: live.reduce((n, b) => n + b.partySize, 0),
          byStatus,
          largestParty: live.reduce((n, b) => Math.max(n, b.partySize), 0) || undefined,
        },
        bookings: bookings.items.map((b) => bookingBrief(b, row.timezone)),
        waitlist: waitlist.items.map((e) => waitlistBrief(e, row.timezone)),
      };
    },
  }),

  define({
    name: "list_bookings",
    title: "Find bookings",
    description:
      "Search bookings over a period: by dates, status, guest name/phone/email or confirmation code. Use get_day for one day's full picture.",
    input: {
      ...restaurantArg,
      from: dateArg.optional().describe("First day (default today)"),
      to: dateArg.optional().describe("Last day (default: 30 days after from)"),
      status: z.array(z.enum(BOOKING_STATUSES)).optional().describe("Default: every status"),
      search: z
        .string()
        .trim()
        .max(100)
        .optional()
        .describe("Guest name, phone, email or confirmation code"),
      guestId: z.uuid().optional(),
      limit: limitArg(200, 50),
    },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, from, to, status, search, guestId, limit }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const start = from ?? todayIn(row.timezone, tc.ctx.now());
      const page = await listBookings(tc.ctx, row, {
        from: start,
        to: to ?? addDaysToLocalDate(start, 30),
        status,
        search,
        customerId: guestId,
        page: 1,
        pageSize: limit,
        order: "asc",
      });
      return {
        total: page.total,
        bookings: page.items.map((b) => bookingBrief(b, row.timezone)),
      };
    },
  }),

  define({
    name: "check_availability",
    title: "Free times",
    description:
      "Which times can take a party of the given size on a date, and why the others cannot (full, closed, no table). Uses the staff rules: no notice period, any horizon.",
    input: {
      ...restaurantArg,
      date: dateArg,
      partySize: partySizeSchema,
      roomId: z.uuid().optional().describe("Only this room (see get_schedule)"),
    },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, date, partySize, roomId }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const a = await getAvailability(tc.ctx, row, {
        date,
        partySize,
        areaId: roomId ?? null,
        staff: true,
      });
      const names = new Map(a.services.map((s) => [s.id, s.name]));
      return {
        date: dateLabel(date),
        closed: a.closed,
        reasons: a.reasons,
        free: a.slots
          .filter((s) => s.available)
          .map((s) => ({
            time: s.startLocal,
            service: names.get(s.serviceId),
            serviceId: s.serviceId,
            remainingCovers: s.remainingCovers ?? undefined,
          })),
        unavailable: a.slots
          .filter((s) => !s.available)
          .map((s) => ({ time: s.startLocal, service: names.get(s.serviceId), reason: s.reason })),
      };
    },
  }),

  define({
    name: "find_guests",
    title: "Find guests",
    description: "Search the guest book by name, phone or email, or list guests with a tag.",
    input: {
      ...restaurantArg,
      search: z.string().trim().max(100).optional(),
      tag: z.string().trim().max(40).optional(),
      limit: limitArg(100, 20),
    },
    scope: "read",
    permissions: { customer: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, search, tag, limit }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { customer: ["read"] });
      const page = await listCustomers(tc.ctx, row, {
        search,
        tag,
        sort: "recent",
        page: 1,
        pageSize: limit,
      });
      return { total: page.total, guests: page.items.map(guestBrief) };
    },
  }),

  define({
    name: "get_guest",
    title: "Guest profile",
    description:
      "A guest's profile: contact details, visits, no-shows, cancellations, tags, notes and their latest bookings.",
    input: { ...restaurantArg, guestId: z.uuid() },
    scope: "read",
    permissions: { customer: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, guestId }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { customer: ["read"] });
      const [guest, history] = await Promise.all([
        getCustomer(tc.ctx, row.id, guestId),
        listBookings(tc.ctx, row, {
          customerId: guestId,
          page: 1,
          pageSize: 20,
          order: "desc",
        }),
      ]);
      return {
        guest: guestBrief(toCustomerDto(guest)),
        bookings: history.items.map((b) => bookingBrief(b, row.timezone)),
      };
    },
  }),

  define({
    name: "get_waitlist",
    title: "Waitlist",
    description:
      "Guests waiting for a spot on a date (default today) and the offers already made. Includes the entry ids needed to offer a spot.",
    input: { ...restaurantArg, date: dateArg.optional() },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, date }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const day = date ?? todayIn(row.timezone, tc.ctx.now());
      const page = await listEntries(tc.ctx, row, {
        date: day,
        status: ["waiting", "offered"],
        page: 1,
        pageSize: 100,
      });
      return {
        date: dateLabel(day),
        entries: page.items.map((e) => waitlistBrief(e, row.timezone)),
      };
    },
  }),

  define({
    name: "get_schedule",
    title: "Hours and rules",
    description:
      "Services with their weekly hours and pacing limits, rooms with seats, the online booking rules, and the closures and special hours coming up.",
    input: { ...restaurantArg },
    scope: "read",
    permissions: { service: ["read"] },
    annotations: READ,
    run: async ({ restaurantId }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { service: ["read"] });
      const [services, rooms, policy, exceptions] = await Promise.all([
        listServices(tc.ctx, row.id),
        listAreas(tc.ctx, row.id),
        getPolicy(tc.ctx, row.id),
        listExceptions(tc.ctx, row.id),
      ]);
      const today = todayIn(row.timezone, tc.ctx.now());
      const names = new Map(services.map((s) => [s.id, s.name]));
      return {
        timezone: row.timezone,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          active: s.active,
          hours: Object.fromEntries(
            WEEKDAYS.map((d) => [d, (s.weeklyHours[d] ?? []).map((w) => `${w.start}-${w.end}`)]),
          ),
          slotEveryMinutes: s.slotIntervalMinutes,
          turnMinutes: s.durationMinutes,
          maxCoversPerSlot: s.maxCoversPerSlot ?? undefined,
          maxBookingsPerSlot: s.maxBookingsPerSlot ?? undefined,
          partySize:
            s.minPartySize || s.maxPartySize
              ? `${s.minPartySize ?? 1}-${s.maxPartySize ?? "any"}`
              : undefined,
        })),
        rooms: rooms.map((a) => ({
          id: a.id,
          name: a.name,
          seats: a.seats ?? undefined,
          open: a.active,
        })),
        onlineBookingRules: {
          minNoticeMinutes: policy.minLeadMinutes,
          maxAdvanceDays: policy.maxAdvanceDays,
          partySize: `${policy.minPartySize}-${policy.maxPartySize}`,
          autoConfirm: policy.autoConfirm,
        },
        upcomingClosures: exceptions
          .filter((x) => x.endDate >= today)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((x) => closureBrief(x, x.serviceId ? (names.get(x.serviceId) ?? null) : null)),
      };
    },
  }),

  define({
    name: "get_analytics",
    title: "Figures",
    description:
      "Bookings, covers, no-shows, cancellations and occupancy over a period, compared with the period before, by service, source, weekday and party size. Default: the last 30 days.",
    input: { ...restaurantArg, from: dateArg.optional(), to: dateArg.optional() },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, from, to }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const end = to ?? todayIn(row.timezone, tc.ctx.now());
      const start = from ?? addDaysToLocalDate(end, -29);
      const a = await getAnalytics(tc.ctx, row, { from: start, to: end });
      const { days, ...rest } = a;
      return { ...rest, ...(days.length <= 31 ? { days } : {}) };
    },
  }),

  define({
    name: "list_feedback",
    title: "Guest feedback",
    description:
      "The latest post-visit ratings and comments, optionally only one star rating or a period.",
    input: {
      ...restaurantArg,
      rating: z.number().int().min(1).max(5).optional(),
      from: dateArg.optional(),
      to: dateArg.optional(),
      limit: limitArg(100, 20),
    },
    scope: "read",
    permissions: { booking: ["read"] },
    annotations: READ,
    run: async ({ restaurantId, rating, from, to, limit }, tc) => {
      const { row } = await tc.restaurant(restaurantId, { booking: ["read"] });
      const page = await listFeedback(tc.ctx, row, { rating, from, to, page: 1, pageSize: limit });
      return { total: page.total, feedback: page.items.map((f) => feedbackBrief(f, row.timezone)) };
    },
  }),

  define({
    name: "create_booking",
    title: "Book a table",
    description:
      "Create a booking for a guest (a phone call, a walk-in, a request the owner relays). The staff rules apply: no notice period, any horizon; capacity is still checked. If the time is not free the answer says why. The service is picked from the time unless serviceId is given.",
    input: {
      ...restaurantArg,
      date: dateArg,
      time: timeArg,
      partySize: partySizeSchema,
      guest: guestArg,
      notes: z.string().trim().max(1000).optional().describe("Allergies, occasion, table wishes"),
      serviceId: z.uuid().optional(),
      roomId: z.uuid().optional(),
      notifyGuest: z
        .boolean()
        .default(true)
        .describe("false = do not send the guest the confirmation message"),
    },
    scope: "write",
    permissions: { booking: ["create"] },
    annotations: WRITE,
    run: async (
      { restaurantId, date, time, partySize, guest, notes, serviceId, roomId, notifyGuest },
      tc,
    ) => {
      const { row, actor } = await tc.restaurant(restaurantId, { booking: ["create"] });
      const startsAt = instantOf(date, time, row.timezone);
      const service = await serviceAt(
        tc,
        row,
        date,
        startsAt,
        partySize,
        roomId ?? null,
        serviceId,
      );
      const created = await createBooking(tc.ctx, row, {
        serviceId: service,
        startsAt,
        partySize,
        areaId: roomId ?? null,
        guest: {
          name: guest.name,
          email: guest.email ?? null,
          phone: guest.phone ?? null,
          locale: row.locale,
        },
        notes: notes ?? null,
        source: "assistant",
        actor,
        notifyGuest,
      });
      return { booking: bookingBrief(toBookingDto(created), row.timezone) };
    },
  }),

  define({
    name: "update_booking",
    title: "Change a booking",
    description:
      "Move a booking to another date or time, change the party size or the notes. Capacity is checked again for the new slot.",
    input: {
      ...restaurantArg,
      bookingId: z.uuid(),
      date: dateArg.optional(),
      time: timeArg.optional(),
      partySize: partySizeSchema.optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
      roomId: z.uuid().nullable().optional(),
      notifyGuest: z
        .boolean()
        .default(true)
        .describe("false = do not tell the guest about the change"),
    },
    scope: "write",
    permissions: { booking: ["update"] },
    annotations: WRITE,
    run: async (
      { restaurantId, bookingId, date, time, partySize, notes, roomId, notifyGuest },
      tc,
    ) => {
      const { row, actor } = await tc.restaurant(restaurantId, { booking: ["update"] });
      let startsAt: Date | undefined;
      let serviceId: string | undefined;
      if (date || time) {
        const current = toBookingDto(await getBookingWithRelations(tc.ctx.db, row.id, bookingId));
        const day = date ?? current.serviceDate;
        const at = time ?? clock(current.startsAt, row.timezone);
        startsAt = instantOf(day, at, row.timezone);
        serviceId = await serviceAt(
          tc,
          row,
          day,
          startsAt,
          partySize ?? current.partySize,
          roomId === undefined ? current.areaId : roomId,
        );
      }
      const updated = await updateBooking(
        tc.ctx,
        row,
        bookingId,
        {
          ...(startsAt ? { startsAt: startsAt.toISOString(), serviceId } : {}),
          ...(partySize !== undefined ? { partySize } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(roomId !== undefined ? { areaId: roomId } : {}),
          ignoreCapacity: false,
          notifyGuest,
        },
        actor,
      );
      return { booking: bookingBrief(toBookingDto(updated), row.timezone) };
    },
  }),

  define({
    name: "booking_action",
    title: "Confirm, seat, cancel…",
    description:
      "Change a booking's status: confirm a pending one, seat the party, mark it complete, cancel (with a reason), mark a no-show, or reopen a cancelled/no-show booking. The guest is told about confirmations and cancellations.",
    input: {
      ...restaurantArg,
      bookingId: z.uuid(),
      action: z.enum(BOOKING_ACTIONS),
      reason: z.string().trim().max(500).optional().describe("Why (cancellations)"),
    },
    scope: "write",
    permissions: { booking: ["update"] },
    annotations: DESTRUCTIVE,
    run: async ({ restaurantId, bookingId, action, reason }, tc) => {
      const { row, actor } = await tc.restaurant(
        restaurantId,
        action === "cancel" ? { booking: ["cancel"] } : { booking: ["update"] },
      );
      const updated = await applyBookingAction(tc.ctx, row, {
        bookingId,
        action,
        actor,
        reason: reason ?? null,
      });
      return { booking: bookingBrief(toBookingDto(updated), row.timezone) };
    },
  }),

  define({
    name: "update_guest",
    title: "Guest notes and tags",
    description:
      "Add a dated note to a guest's profile (allergies, preferences, incidents), add or remove tags, or fix contact details.",
    input: {
      ...restaurantArg,
      guestId: z.uuid(),
      note: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .optional()
        .describe("Appended to the notes with today's date"),
      addTags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      removeTags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      email: z.email().nullable().optional(),
    },
    scope: "write",
    permissions: { customer: ["update"] },
    annotations: WRITE,
    run: async ({ restaurantId, guestId, note, addTags, removeTags, name, phone, email }, tc) => {
      const { row, actor } = await tc.restaurant(restaurantId, { customer: ["update"] });
      const current = toCustomerDto(await getCustomer(tc.ctx, row.id, guestId));
      const remove = new Set((removeTags ?? []).map((t) => t.toLowerCase()));
      const tags = [...current.tags.filter((t) => !remove.has(t)), ...(addTags ?? [])];
      const today = todayIn(row.timezone, tc.ctx.now());
      const notes = note
        ? [current.notes, `${today}: ${note}`].filter(Boolean).join("\n")
        : undefined;
      const updated = await updateCustomer(
        tc.ctx,
        row,
        guestId,
        {
          ...(addTags || removeTags ? { tags } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(name ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(email !== undefined ? { email } : {}),
        },
        actor,
      );
      return { guest: guestBrief(toCustomerDto(updated)) };
    },
  }),

  define({
    name: "close_days",
    title: "Close days",
    description:
      "Close the restaurant (or one service) on a day or a range of days: a holiday, a private event. Bookings already taken on those days are listed first and nothing is closed until you call again with confirm: true; those bookings are kept, cancel them separately if the guests cannot come.",
    input: {
      ...restaurantArg,
      from: dateArg,
      to: dateArg.optional().describe("Last day (inclusive); omit for a single day"),
      reason: z.string().trim().max(200).optional(),
      serviceId: z
        .uuid()
        .optional()
        .describe("Close only this service (default: the whole restaurant)"),
      confirm: z
        .boolean()
        .default(false)
        .describe("true = close even though bookings exist on those days"),
    },
    scope: "write",
    permissions: { settings: ["update"] },
    annotations: DESTRUCTIVE,
    run: async ({ restaurantId, from, to, reason, serviceId, confirm }, tc) => {
      const { row, actor } = await tc.restaurant(restaurantId, { settings: ["update"] });
      const end = to ?? from;
      if (end < from) throw new ToolError("`to` must not be before `from`.");
      const taken = await listBookings(tc.ctx, row, {
        from,
        to: end,
        status: [...ACTIVE_STATUSES],
        page: 1,
        pageSize: 200,
        order: "asc",
      });
      const affected = taken.items.filter(
        (b: BookingDto) => !serviceId || b.serviceId === serviceId,
      );
      if (affected.length > 0 && !confirm)
        return {
          closed: false,
          needsConfirmation: true,
          message: `${affected.length} booking(s) already taken between ${from} and ${end}. Tell the user; call again with confirm: true to close anyway.`,
          affectedBookings: affected.map((b) => bookingBrief(b, row.timezone)),
        };
      const created = await createException(tc.ctx, row, {
        serviceId: serviceId ?? null,
        date: from,
        endDate: end,
        closed: true,
        windows: null,
        reason: reason ?? null,
      });
      await writeAudit(tc.ctx.db, {
        restaurantId: row.id,
        organizationId: row.organizationId,
        actor,
        action: "closure.created",
        entityType: "schedule_exception",
        entityId: created.id,
        data: { date: from, endDate: end, reason: reason ?? null, serviceId: serviceId ?? null },
      });
      return {
        closed: true,
        closure: closureBrief(created, null),
        affectedBookings: affected.map((b) => bookingBrief(b, row.timezone)),
      };
    },
  }),

  define({
    name: "offer_waitlist_spot",
    title: "Offer a waitlist spot",
    description:
      "Offer a time to a guest on the waitlist (see get_waitlist for entry ids). The guest gets a message with a link to accept; the offer expires on its own.",
    input: {
      ...restaurantArg,
      entryId: z.uuid(),
      time: timeArg,
      serviceId: z.uuid().optional(),
    },
    scope: "write",
    permissions: { booking: ["create"] },
    annotations: WRITE,
    run: async ({ restaurantId, entryId, time, serviceId }, tc) => {
      const { row, actor } = await tc.restaurant(restaurantId, { booking: ["create"] });
      const entries = await listEntries(tc.ctx, row, {
        page: 1,
        pageSize: 200,
        status: ["waiting", "offered"],
      });
      const entry = entries.items.find((e) => e.id === entryId);
      if (!entry) throw new ToolError("No open waitlist entry with that id.");
      const startsAt = instantOf(entry.serviceDate, time, row.timezone);
      const service = await serviceAt(
        tc,
        row,
        entry.serviceDate,
        startsAt,
        entry.partySize,
        null,
        serviceId,
      );
      const offered = await offerEntry(tc.ctx, row, {
        entryId,
        serviceId: service,
        startsAt,
        actor,
      });
      return { entry: waitlistBrief(toEntryDto(offered), row.timezone) };
    },
  }),

  define({
    name: "remove_from_waitlist",
    title: "Remove from the waitlist",
    description:
      "Take a guest off the waitlist (they found another plan, or the restaurant cannot help).",
    input: { ...restaurantArg, entryId: z.uuid() },
    scope: "write",
    permissions: { booking: ["cancel"] },
    annotations: DESTRUCTIVE,
    run: async ({ restaurantId, entryId }, tc) => {
      const { row, actor } = await tc.restaurant(restaurantId, { booking: ["cancel"] });
      const removed = await cancelEntry(tc.ctx, row, entryId, actor);
      return { entry: waitlistBrief(toEntryDto(removed), row.timezone) };
    },
  }),
];
