import { booking, bookingMeeting, bookingPolicy, customer, restaurant } from "@openpax/db";
import type { MeetingFeedDto } from "@openpax/shared";
import { and, asc, eq, gte, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { newToken } from "../../lib/random.js";
import { feedName, meetingEvent } from "./event.js";
import { buildFeed } from "./ics.js";

/** Past meetings stay in the host's calendar for a month. */
const PAST_DAYS = 30;

const feedUrl = (ctx: AppContext, token: string | null): MeetingFeedDto => ({
  url: token ? `${ctx.env.PUBLIC_URL}/api/public/v1/meetings/feed/${token}.ics` : null,
});

export async function getMeetingFeed(ctx: AppContext, r: RestaurantRow): Promise<MeetingFeedDto> {
  const [row] = await ctx.db
    .select({ token: bookingPolicy.meetingFeedToken })
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, r.id))
    .limit(1);
  return feedUrl(ctx, row?.token ?? null);
}

/** Write the link and its audit entry; nothing happens unless `only` matches a row. */
async function writeFeedToken(
  ctx: AppContext,
  r: RestaurantRow,
  token: string | null,
  only: SQL | undefined,
  action: string,
  actor: Actor,
): Promise<boolean> {
  return ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(bookingPolicy)
      .set({ meetingFeedToken: token })
      .where(and(eq(bookingPolicy.restaurantId, r.id), only))
      .returning({ id: bookingPolicy.restaurantId });
    if (updated.length === 0) return false;
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action,
      entityType: "booking_policy",
      entityId: r.id,
    });
    return true;
  });
}

/**
 * The link, created if there is none. Never replaces one: a page left open
 * from before the link existed must not cut off the calendar it is feeding.
 */
export async function createMeetingFeed(
  ctx: AppContext,
  r: RestaurantRow,
  actor: Actor,
): Promise<MeetingFeedDto> {
  const created = newToken();
  const won = await writeFeedToken(
    ctx,
    r,
    created,
    isNull(bookingPolicy.meetingFeedToken),
    "meeting_feed.created",
    actor,
  );
  return won ? feedUrl(ctx, created) : getMeetingFeed(ctx, r);
}

/** A new secret link; the old one stops working. */
export async function rotateMeetingFeed(
  ctx: AppContext,
  r: RestaurantRow,
  actor: Actor,
): Promise<MeetingFeedDto> {
  const token = newToken();
  const done = await writeFeedToken(
    ctx,
    r,
    token,
    isNotNull(bookingPolicy.meetingFeedToken),
    "meeting_feed.rotated",
    actor,
  );
  if (!done) throw ApiError.notFound("Calendar link");
  return feedUrl(ctx, token);
}

export async function disableMeetingFeed(
  ctx: AppContext,
  r: RestaurantRow,
  actor: Actor,
): Promise<MeetingFeedDto> {
  await writeFeedToken(
    ctx,
    r,
    null,
    isNotNull(bookingPolicy.meetingFeedToken),
    "meeting_feed.disabled",
    actor,
  );
  return feedUrl(ctx, null);
}

/**
 * The host's subscription calendar behind a secret link. A link that was
 * changed or turned off gets an empty calendar rather than an error: calendar
 * apps keep the last copy of a feed that fails, so this is what clears the
 * guests' details off the host's calendar.
 */
export async function meetingFeed(ctx: AppContext, token: string): Promise<string> {
  const [found] = await ctx.db
    .select({ restaurant })
    .from(bookingPolicy)
    .innerJoin(restaurant, eq(restaurant.id, bookingPolicy.restaurantId))
    .where(eq(bookingPolicy.meetingFeedToken, token))
    .limit(1);
  if (!found) return buildFeed([], "OpenPax");
  const now = ctx.now();
  const rows = await ctx.db
    .select({ meeting: bookingMeeting, booking, customer })
    .from(bookingMeeting)
    .innerJoin(booking, eq(booking.id, bookingMeeting.bookingId))
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .where(
      and(
        eq(bookingMeeting.restaurantId, found.restaurant.id),
        isNull(bookingMeeting.cancelledAt),
        // the meeting itself is cancelled a moment later, through the outbox
        ne(booking.status, "cancelled"),
        gte(bookingMeeting.startsAt, new Date(now.getTime() - PAST_DAYS * 86_400_000)),
      ),
    )
    .orderBy(asc(bookingMeeting.startsAt));
  return buildFeed(
    rows.map(
      (x) => meetingEvent({ ...x, restaurant: found.restaurant }, now, { notes: false }).event,
    ),
    feedName(found.restaurant),
  );
}
