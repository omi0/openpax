import {
  area,
  bookingPolicy,
  capacityRule,
  member,
  organization,
  restaurant,
  scheduleException,
  service,
  widgetConfig,
} from "@sitli/db";
import type {
  AreaDto,
  BookingPolicyDto,
  CapacityRuleDto,
  CreateRestaurantInput,
  RestaurantDto,
  RestaurantSummaryDto,
  ScheduleExceptionDto,
  ServiceDto,
  UpdateBookingPolicyInput,
  UpdateRestaurantInput,
  UpdateWidgetConfigInput,
  UpsertAreaInput,
  UpsertCapacityRuleInput,
  UpsertScheduleExceptionInput,
  UpsertServiceInput,
  WidgetConfigDto,
} from "@sitli/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { RoleName } from "../../auth/access.js";
import { roles } from "../../auth/access.js";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { slugify } from "../../lib/slug.js";

// ---------- DTO mappers

export function toRestaurantDto(row: RestaurantRow): RestaurantDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    locale: row.locale as RestaurantDto["locale"],
    currency: row.currency,
    address: row.address,
    phone: row.phone,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toServiceDto(row: typeof service.$inferSelect): ServiceDto {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    weeklyHours: row.weeklyHours,
    slotIntervalMinutes: row.slotIntervalMinutes,
    durationMinutes: row.durationMinutes,
    maxCoversPerSlot: row.maxCoversPerSlot,
    maxBookingsPerSlot: row.maxBookingsPerSlot,
    minPartySize: row.minPartySize,
    maxPartySize: row.maxPartySize,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPolicyDto(row: typeof bookingPolicy.$inferSelect): BookingPolicyDto {
  return {
    minLeadMinutes: row.minLeadMinutes,
    maxAdvanceDays: row.maxAdvanceDays,
    minPartySize: row.minPartySize,
    maxPartySize: row.maxPartySize,
    autoConfirm: row.autoConfirm,
    cancellationCutoffMinutes: row.cancellationCutoffMinutes,
    largePartyThreshold: row.largePartyThreshold,
    waitlistEnabled: row.waitlistEnabled,
    waitlistAutoOffer: row.waitlistAutoOffer,
    waitlistOfferMinutes: row.waitlistOfferMinutes,
  };
}

export function embedSnippet(publicUrl: string, slug: string): string {
  return `<div id="sitli-booking"></div>\n<script src="${publicUrl}/embed.js" data-restaurant="${slug}" data-target="#sitli-booking" async></script>`;
}

export function toWidgetConfigDto(
  ctx: AppContext,
  r: RestaurantRow,
  row: typeof widgetConfig.$inferSelect,
): WidgetConfigDto {
  return {
    restaurantId: row.restaurantId,
    primaryColor: row.primaryColor,
    logoUrl: row.logoUrl,
    defaultLocale: row.defaultLocale as WidgetConfigDto["defaultLocale"],
    requirePhone: row.requirePhone,
    welcomeMessage: row.welcomeMessage,
    termsUrl: row.termsUrl,
    privacyUrl: row.privacyUrl,
    allowedOrigins: row.allowedOrigins,
    embedSnippet: embedSnippet(ctx.env.PUBLIC_URL, r.slug),
    hostedUrl: `${ctx.env.PUBLIC_URL}/book/${r.slug}`,
  };
}

const toAreaDto = (row: typeof area.$inferSelect): AreaDto => ({
  id: row.id,
  restaurantId: row.restaurantId,
  name: row.name,
  sortOrder: row.sortOrder,
  active: row.active,
  seats: row.seats,
});

const toExceptionDto = (row: typeof scheduleException.$inferSelect): ScheduleExceptionDto => ({
  id: row.id,
  restaurantId: row.restaurantId,
  serviceId: row.serviceId,
  date: row.date,
  endDate: row.endDate,
  closed: row.closed,
  windows: row.windows,
  reason: row.reason,
});

const toRuleDto = (row: typeof capacityRule.$inferSelect): CapacityRuleDto => ({
  id: row.id,
  restaurantId: row.restaurantId,
  name: row.name,
  serviceId: row.serviceId,
  areaId: row.areaId,
  weekday: row.weekday as CapacityRuleDto["weekday"],
  date: row.date,
  endDate: row.endDate,
  startTime: row.startTime,
  endTime: row.endTime,
  maxCovers: row.maxCovers,
  maxBookings: row.maxBookings,
  maxPartySize: row.maxPartySize,
  active: row.active,
});

// ---------- restaurants

export async function listRestaurantsForUser(
  ctx: AppContext,
  userId: string,
): Promise<RestaurantSummaryDto[]> {
  const memberships = await ctx.db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  if (memberships.length === 0) return [];
  const roleByOrg = new Map(memberships.map((m) => [m.organizationId, m.role]));
  const rows = await ctx.db
    .select()
    .from(restaurant)
    .where(inArray(restaurant.organizationId, [...roleByOrg.keys()]))
    .orderBy(asc(restaurant.name));
  return rows.map((r) => {
    const role = roleByOrg.get(r.organizationId) ?? "staff";
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      slug: r.slug,
      timezone: r.timezone,
      locale: r.locale as RestaurantSummaryDto["locale"],
      role: (role in roles ? role : "staff") as RoleName,
    };
  });
}

async function uniqueRestaurantSlug(ctx: AppContext, base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await ctx.db
      .select({ id: restaurant.id })
      .from(restaurant)
      .where(eq(restaurant.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
  }
  throw ApiError.conflict("slug_taken", "Could not find a free slug");
}

async function uniqueOrganizationSlug(ctx: AppContext, base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await ctx.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
  }
  throw ApiError.conflict("slug_taken", "Could not find a free slug");
}

export interface CreateRestaurantParams {
  userId: string;
  headers: Headers;
  input: CreateRestaurantInput;
}

/**
 * Create a restaurant. Owners without an organization get one created on
 * the fly (the common single-restaurant case); otherwise the restaurant is
 * attached to the caller's organization.
 */
export async function createRestaurant(
  ctx: AppContext,
  params: CreateRestaurantParams,
): Promise<RestaurantDto> {
  const { userId, input } = params;
  const memberships = await ctx.db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));

  let organizationId: string;
  if (input.organizationId) {
    const m = memberships.find((x) => x.organizationId === input.organizationId);
    if (!m) throw ApiError.forbidden("You are not a member of that organization");
    if (m.role !== "owner") throw ApiError.forbidden("Only owners can add restaurants");
    organizationId = input.organizationId;
  } else if (memberships.length === 1 && memberships[0]) {
    if (memberships[0].role !== "owner")
      throw ApiError.forbidden("Only owners can add restaurants");
    organizationId = memberships[0].organizationId;
  } else if (memberships.length === 0) {
    const org = await ctx.auth.api.createOrganization({
      body: { name: input.name, slug: await uniqueOrganizationSlug(ctx, input.name) },
      headers: params.headers,
    });
    if (!org) throw new ApiError(500, "organization_failed", "Could not create organization");
    organizationId = org.id;
  } else {
    throw ApiError.badRequest(
      "organization_required",
      "Choose which organization the restaurant belongs to",
    );
  }

  const slug = input.slug ? input.slug : await uniqueRestaurantSlug(ctx, input.name);
  const [existing] = await ctx.db
    .select({ id: restaurant.id })
    .from(restaurant)
    .where(eq(restaurant.slug, slug))
    .limit(1);
  if (existing) throw ApiError.conflict("slug_taken", "That URL slug is already in use");

  const actor: Actor = { type: "user", id: userId, role: "owner" };
  const row = await ctx.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(restaurant)
      .values({
        organizationId,
        name: input.name,
        slug,
        timezone: input.timezone,
        locale: input.locale,
        currency: input.currency,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .returning();
    if (!created) throw new Error("insert failed");
    await tx.insert(bookingPolicy).values({ restaurantId: created.id });
    await tx.insert(widgetConfig).values({ restaurantId: created.id, defaultLocale: input.locale });
    // the first room carries the seat count, so the house is capped from day one
    if (input.seats !== undefined)
      await tx.insert(area).values({
        restaurantId: created.id,
        name: input.locale === "it" ? "Sala" : "Dining room",
        seats: input.seats,
        sortOrder: 0,
        active: true,
      });
    await emitEvent(tx, {
      type: "restaurant.created",
      restaurantId: created.id,
      aggregateType: "restaurant",
      aggregateId: created.id,
      payload: { restaurantId: created.id, organizationId },
    });
    await writeAudit(tx, {
      restaurantId: created.id,
      organizationId,
      actor,
      action: "restaurant.created",
      entityType: "restaurant",
      entityId: created.id,
      data: { name: created.name, slug: created.slug },
    });
    return created;
  });
  return toRestaurantDto(row);
}

export async function updateRestaurant(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdateRestaurantInput,
  actor: Actor,
): Promise<RestaurantDto> {
  if (input.slug && input.slug !== r.slug) {
    const [hit] = await ctx.db
      .select({ id: restaurant.id })
      .from(restaurant)
      .where(eq(restaurant.slug, input.slug))
      .limit(1);
    if (hit) throw ApiError.conflict("slug_taken", "That URL slug is already in use");
  }
  const [row] = await ctx.db
    .update(restaurant)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    })
    .where(eq(restaurant.id, r.id))
    .returning();
  if (!row) throw ApiError.notFound("Restaurant");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "restaurant.updated",
    entityType: "restaurant",
    entityId: r.id,
    data: input,
  });
  return toRestaurantDto(row);
}

// ---------- services

export async function listServices(ctx: AppContext, restaurantId: string): Promise<ServiceDto[]> {
  const rows = await ctx.db
    .select()
    .from(service)
    .where(eq(service.restaurantId, restaurantId))
    .orderBy(asc(service.sortOrder), asc(service.name));
  return rows.map(toServiceDto);
}

export async function createService(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertServiceInput,
  actor: Actor,
): Promise<ServiceDto> {
  const [row] = await ctx.db
    .insert(service)
    .values({ restaurantId: r.id, ...input })
    .returning();
  if (!row) throw new Error("insert failed");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "service.created",
    entityType: "service",
    entityId: row.id,
    data: { name: row.name },
  });
  return toServiceDto(row);
}

export async function updateService(
  ctx: AppContext,
  r: RestaurantRow,
  serviceId: string,
  input: UpsertServiceInput,
  actor: Actor,
): Promise<ServiceDto> {
  const [row] = await ctx.db
    .update(service)
    .set(input)
    .where(and(eq(service.id, serviceId), eq(service.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Service");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "service.updated",
    entityType: "service",
    entityId: row.id,
    data: input,
  });
  return toServiceDto(row);
}

export async function deleteService(
  ctx: AppContext,
  r: RestaurantRow,
  serviceId: string,
  actor: Actor,
): Promise<void> {
  const [row] = await ctx.db
    .delete(service)
    .where(and(eq(service.id, serviceId), eq(service.restaurantId, r.id)))
    .returning({ id: service.id });
  if (!row) throw ApiError.notFound("Service");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "service.deleted",
    entityType: "service",
    entityId: serviceId,
  });
}

// ---------- policy & widget config

export async function getPolicy(ctx: AppContext, restaurantId: string): Promise<BookingPolicyDto> {
  const [row] = await ctx.db
    .select()
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, restaurantId))
    .limit(1);
  if (!row) throw ApiError.notFound("Booking policy");
  return toPolicyDto(row);
}

export async function updatePolicy(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdateBookingPolicyInput,
  actor: Actor,
): Promise<BookingPolicyDto> {
  const [row] = await ctx.db
    .update(bookingPolicy)
    .set(input)
    .where(eq(bookingPolicy.restaurantId, r.id))
    .returning();
  if (!row) throw ApiError.notFound("Booking policy");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "policy.updated",
    entityType: "booking_policy",
    entityId: r.id,
    data: input,
  });
  return toPolicyDto(row);
}

export async function getWidgetConfig(ctx: AppContext, r: RestaurantRow): Promise<WidgetConfigDto> {
  const [row] = await ctx.db
    .select()
    .from(widgetConfig)
    .where(eq(widgetConfig.restaurantId, r.id))
    .limit(1);
  if (!row) throw ApiError.notFound("Widget config");
  return toWidgetConfigDto(ctx, r, row);
}

export async function updateWidgetConfig(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdateWidgetConfigInput,
  actor: Actor,
): Promise<WidgetConfigDto> {
  const [row] = await ctx.db
    .update(widgetConfig)
    .set(input)
    .where(eq(widgetConfig.restaurantId, r.id))
    .returning();
  if (!row) throw ApiError.notFound("Widget config");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "widget.updated",
    entityType: "widget_config",
    entityId: r.id,
  });
  return toWidgetConfigDto(ctx, r, row);
}

// ---------- areas, exceptions, capacity rules (small CRUD)

export async function listAreas(ctx: AppContext, restaurantId: string): Promise<AreaDto[]> {
  const rows = await ctx.db
    .select()
    .from(area)
    .where(eq(area.restaurantId, restaurantId))
    .orderBy(asc(area.sortOrder), asc(area.name));
  return rows.map(toAreaDto);
}
export async function createArea(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertAreaInput,
): Promise<AreaDto> {
  const [row] = await ctx.db
    .insert(area)
    .values({ restaurantId: r.id, ...input })
    .returning();
  if (!row) throw new Error("insert failed");
  return toAreaDto(row);
}
export async function updateArea(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  input: UpsertAreaInput,
): Promise<AreaDto> {
  const [row] = await ctx.db
    .update(area)
    .set(input)
    .where(and(eq(area.id, id), eq(area.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Area");
  return toAreaDto(row);
}
export async function deleteArea(ctx: AppContext, r: RestaurantRow, id: string): Promise<void> {
  const [row] = await ctx.db
    .delete(area)
    .where(and(eq(area.id, id), eq(area.restaurantId, r.id)))
    .returning({ id: area.id });
  if (!row) throw ApiError.notFound("Area");
}

export async function listExceptions(
  ctx: AppContext,
  restaurantId: string,
): Promise<ScheduleExceptionDto[]> {
  const rows = await ctx.db
    .select()
    .from(scheduleException)
    .where(eq(scheduleException.restaurantId, restaurantId))
    .orderBy(asc(scheduleException.date));
  return rows.map(toExceptionDto);
}
export async function createException(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertScheduleExceptionInput,
): Promise<ScheduleExceptionDto> {
  const [row] = await ctx.db
    .insert(scheduleException)
    .values({ restaurantId: r.id, ...input, endDate: input.endDate ?? input.date })
    .returning();
  if (!row) throw new Error("insert failed");
  return toExceptionDto(row);
}
export async function updateException(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  input: UpsertScheduleExceptionInput,
): Promise<ScheduleExceptionDto> {
  const [row] = await ctx.db
    .update(scheduleException)
    .set({ ...input, endDate: input.endDate ?? input.date })
    .where(and(eq(scheduleException.id, id), eq(scheduleException.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Exception");
  return toExceptionDto(row);
}
export async function deleteException(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
): Promise<void> {
  const [row] = await ctx.db
    .delete(scheduleException)
    .where(and(eq(scheduleException.id, id), eq(scheduleException.restaurantId, r.id)))
    .returning({ id: scheduleException.id });
  if (!row) throw ApiError.notFound("Exception");
}

export async function listCapacityRules(
  ctx: AppContext,
  restaurantId: string,
): Promise<CapacityRuleDto[]> {
  const rows = await ctx.db
    .select()
    .from(capacityRule)
    .where(eq(capacityRule.restaurantId, restaurantId))
    .orderBy(asc(capacityRule.createdAt));
  return rows.map(toRuleDto);
}
export async function createCapacityRule(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertCapacityRuleInput,
): Promise<CapacityRuleDto> {
  const [row] = await ctx.db
    .insert(capacityRule)
    .values({ restaurantId: r.id, ...input, endDate: input.date ? input.endDate : null })
    .returning();
  if (!row) throw new Error("insert failed");
  return toRuleDto(row);
}
export async function updateCapacityRule(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  input: UpsertCapacityRuleInput,
): Promise<CapacityRuleDto> {
  const [row] = await ctx.db
    .update(capacityRule)
    .set({ ...input, endDate: input.date ? input.endDate : null })
    .where(and(eq(capacityRule.id, id), eq(capacityRule.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Capacity rule");
  return toRuleDto(row);
}
export async function deleteCapacityRule(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
): Promise<void> {
  const [row] = await ctx.db
    .delete(capacityRule)
    .where(and(eq(capacityRule.id, id), eq(capacityRule.restaurantId, r.id)))
    .returning({ id: capacityRule.id });
  if (!row) throw ApiError.notFound("Capacity rule");
}
