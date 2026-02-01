import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { bookingPolicy } from "@sitli/db";
import {
  bookingDtoSchema,
  bookWaitlistInputSchema,
  createWaitlistEntryInputSchema,
  joinWaitlistInputSchema,
  listWaitlistQuerySchema,
  offerWaitlistInputSchema,
  paginatedSchema,
  publicBookingDtoSchema,
  publicWaitlistEntryDtoSchema,
  waitlistEntryDtoSchema,
} from "@sitli/shared";
import { eq } from "drizzle-orm";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv, RestaurantRow } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam, slugParam } from "../../lib/openapi.js";
import { findRestaurantById, findRestaurantBySlug } from "../../lib/restaurant-lookup.js";
import { toBookingDto, toPublicBookingDto } from "../bookings/index.js";
import * as svc from "./service.js";

const entryIdParam = restaurantIdParam.extend({ entryId: z.uuid() });
const tokenParam = z.object({ token: z.string().min(10) });

async function cancellationCutoff(ctx: AppContext, r: RestaurantRow): Promise<number> {
  const [policy] = await ctx.db
    .select({ cutoff: bookingPolicy.cancellationCutoffMinutes })
    .from(bookingPolicy)
    .where(eq(bookingPolicy.restaurantId, r.id))
    .limit(1);
  return policy?.cutoff ?? 0;
}

export function waitlistRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  // ----- public (widget)
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/restaurants/{slug}/waitlist",
      tags: ["Public"],
      summary: "Join the waitlist for a date",
      request: { params: slugParam, body: jsonBody(joinWaitlistInputSchema) },
      responses: {
        201: jsonResponse(publicWaitlistEntryDtoSchema, "The entry as the guest sees it"),
      },
    }),
    async (c) => {
      const r = await findRestaurantBySlug(ctx, c.req.valid("param").slug);
      const body = c.req.valid("json");
      const entry = await svc.joinWaitlist(ctx, r, {
        serviceDate: body.serviceDate,
        partySize: body.partySize,
        serviceId: body.serviceId ?? null,
        preferredTime: body.preferredTime ?? null,
        guest: {
          name: body.guest.name,
          email: body.guest.email,
          phone: body.guest.phone ?? null,
          locale: body.guest.locale ?? null,
        },
        notes: body.notes ?? null,
        marketingConsent: body.marketingConsent,
        source: "widget",
        actor: { type: "guest", id: null },
      });
      return c.json(svc.toPublicEntryDto(ctx, r, entry), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/waitlist/{token}",
      tags: ["Public"],
      summary: "Look up a waitlist entry with its token",
      request: { params: tokenParam },
      responses: { 200: jsonResponse(publicWaitlistEntryDtoSchema, "Waitlist entry") },
    }),
    async (c) => {
      const found = await svc.getEntryByToken(ctx, c.req.valid("param").token);
      const r = await findRestaurantById(ctx, found.entry.restaurantId);
      return c.json(svc.toPublicEntryDto(ctx, r, found), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/waitlist/{token}/accept",
      tags: ["Public"],
      summary: "Accept the offered table: creates the booking",
      request: { params: tokenParam },
      responses: { 201: jsonResponse(publicBookingDtoSchema, "The new booking") },
    }),
    async (c) => {
      const { restaurant: r, booking } = await svc.acceptOffer(ctx, c.req.valid("param").token);
      return c.json(toPublicBookingDto(ctx, r, booking, await cancellationCutoff(ctx, r)), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/waitlist/{token}/leave",
      tags: ["Public"],
      summary: "Leave the waitlist (or decline the offer)",
      request: { params: tokenParam },
      responses: { 200: jsonResponse(publicWaitlistEntryDtoSchema, "Cancelled entry") },
    }),
    async (c) => {
      const { restaurant: r, entry } = await svc.leaveByToken(ctx, c.req.valid("param").token);
      return c.json(svc.toPublicEntryDto(ctx, r, entry), 200);
    },
  );

  // ----- staff
  const tags = ["Waitlist"];
  const base = "/api/v1/restaurants/{restaurantId}/waitlist";
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: listWaitlistQuerySchema },
      responses: { 200: jsonResponse(paginatedSchema(waitlistEntryDtoSchema), "Waitlist entries") },
    }),
    async (c) => c.json(await svc.listEntries(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: base,
      tags,
      summary: "Add a guest who called to the waitlist",
      middleware: [requireRestaurant(ctx, { booking: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(createWaitlistEntryInputSchema) },
      responses: { 201: jsonResponse(waitlistEntryDtoSchema, "Created entry") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const entry = await svc.joinWaitlist(ctx, c.get("restaurant"), {
        serviceDate: body.serviceDate,
        partySize: body.partySize,
        serviceId: body.serviceId ?? null,
        preferredTime: body.preferredTime ?? null,
        guest: {
          id: body.customer.id,
          name: body.customer.name,
          email: body.customer.email ?? null,
          phone: body.customer.phone ?? null,
          locale: body.customer.locale ?? null,
        },
        notes: body.notes ?? null,
        source: body.source,
        actor: c.get("actor"),
      });
      return c.json(svc.toEntryDto(entry), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{entryId}/offer`,
      tags,
      summary: "Offer a slot to the guest; they get a link to confirm",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: entryIdParam, body: jsonBody(offerWaitlistInputSchema) },
      responses: { 200: jsonResponse(waitlistEntryDtoSchema, "Entry with the open offer") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const entry = await svc.offerEntry(ctx, c.get("restaurant"), {
        entryId: c.req.valid("param").entryId,
        serviceId: body.serviceId,
        startsAt: new Date(body.startsAt),
        actor: c.get("actor"),
      });
      return c.json(svc.toEntryDto(entry), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{entryId}/book`,
      tags,
      summary: "Book the guest in straight away",
      middleware: [requireRestaurant(ctx, { booking: ["create"] })] as const,
      request: { params: entryIdParam, body: jsonBody(bookWaitlistInputSchema) },
      responses: { 201: jsonResponse(bookingDtoSchema, "Created booking") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const actor = c.get("actor");
      const canOverride =
        actor.type !== "guest" && actor.type !== "system" && actor.role !== "staff";
      const { booking } = await svc.bookEntry(ctx, c.get("restaurant"), {
        entryId: c.req.valid("param").entryId,
        serviceId: body.serviceId,
        startsAt: new Date(body.startsAt),
        ignoreCapacity: canOverride && body.ignoreCapacity,
        source: "manual",
        actor,
      });
      return c.json(toBookingDto(booking), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{entryId}/cancel`,
      tags,
      summary: "Remove the guest from the waitlist",
      middleware: [requireRestaurant(ctx, { booking: ["cancel"] })] as const,
      request: { params: entryIdParam },
      responses: { 200: jsonResponse(waitlistEntryDtoSchema, "Cancelled entry") },
    }),
    async (c) =>
      c.json(
        svc.toEntryDto(
          await svc.cancelEntry(
            ctx,
            c.get("restaurant"),
            c.req.valid("param").entryId,
            c.get("actor"),
          ),
        ),
        200,
      ),
  );
}
