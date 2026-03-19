import { WEEKDAYS } from "@sitli/core";
import { restaurant } from "@sitli/db";
import {
  SETUP_STEPS,
  type SetupStatusDto,
  type SetupStep,
  type UpdateSetupInput,
} from "@sitli/shared";
import { eq } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { resolveProvider } from "../notifications/index.js";
import { listAreas, listServices } from "../restaurants/index.js";
import { listTables } from "../tables/index.js";
import { getTeam } from "../team/index.js";

/**
 * Where a restaurant stands in the setup guide. Most steps are judged from
 * the data (a service with hours, rooms with seats, a way to send email…);
 * the ones with sensible defaults (booking rules, the widget) count as done
 * once the owner has gone through them.
 */
export async function getSetupStatus(ctx: AppContext, r: RestaurantRow): Promise<SetupStatusDto> {
  const [services, rooms, tables, email, sms, team] = await Promise.all([
    listServices(ctx, r.id),
    listAreas(ctx, r.id),
    listTables(ctx, r.id),
    resolveProvider(ctx, r, "email"),
    resolveProvider(ctx, r, "sms"),
    getTeam(ctx, r),
  ]);
  const reviewed = new Set<string>(r.setupSteps);
  const bookable = services.filter(
    (s) => s.active && WEEKDAYS.some((day) => (s.weeklyHours[day] ?? []).length > 0),
  );
  const openRooms = rooms.filter((a) => a.active);
  const roomsMissingSeats = openRooms.filter((a) => a.seats === null).length;

  const done: Record<SetupStep, boolean> = {
    restaurant: true,
    services: bookable.length > 0,
    rooms: roomsMissingSeats === 0 && (openRooms.length > 0 || reviewed.has("rooms")),
    policy: reviewed.has("policy"),
    notifications: email !== null,
    team: team.members.length > 1 || team.invitations.length > 0 || reviewed.has("team"),
    widget: reviewed.has("widget"),
  };
  const steps = SETUP_STEPS.map((step) => ({
    step,
    done: done[step],
    reviewed: reviewed.has(step),
  }));
  return {
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    completedAt: r.setupCompletedAt?.toISOString() ?? null,
    facts: {
      services: bookable.length,
      rooms: openRooms.length,
      roomsMissingSeats,
      tables: tables.filter((x) => x.active).length,
      emailProvider: email?.scope ?? "none",
      smsProvider: sms?.scope === "instance" ? "none" : (sms?.scope ?? "none"),
      members: team.members.length,
      pendingInvitations: team.invitations.length,
      restaurantEmail: Boolean(r.email),
    },
  };
}

/** Record the steps the owner went through and whether the guide is finished. */
export async function updateSetup(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdateSetupInput,
  actor: Actor,
): Promise<SetupStatusDto> {
  const steps = new Set<string>(r.setupSteps);
  for (const s of input.reviewed ?? []) steps.add(s);
  const finishing = input.completed === true && r.setupCompletedAt === null;
  const [row] = await ctx.db
    .update(restaurant)
    .set({
      setupSteps: SETUP_STEPS.filter((s) => steps.has(s)),
      ...(input.completed === undefined
        ? {}
        : { setupCompletedAt: input.completed ? (r.setupCompletedAt ?? ctx.now()) : null }),
    })
    .where(eq(restaurant.id, r.id))
    .returning();
  if (!row) throw ApiError.notFound("Restaurant");
  if (finishing || input.completed === false)
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: finishing ? "setup.completed" : "setup.reopened",
      entityType: "restaurant",
      entityId: r.id,
    });
  return getSetupStatus(ctx, row);
}
