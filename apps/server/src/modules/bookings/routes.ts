import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { bookingPolicy, widgetConfig } from "@openpax/db";
import {
  bookingActionInputSchema,
  bookingDtoSchema,
  createPublicBookingInputSchema,
  createStaffBookingInputSchema,
  listBookingsQuerySchema,
  paginatedSchema,
  publicBookingDtoSchema,
  updateBookingInputSchema,
} from "@openpax/shared";
import { eq } from "drizzle-orm";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam, slugParam } from "../../lib/openapi.js";
import { findRestaurantById, findRestaurantBySlug } from "../../lib/restaurant-lookup.js";
import { syncPendingForBooking } from "../payments/index.js";
import * as svc from "./service.js";

const bookingIdParam = restaurantIdParam.extend({ bookingId: z.uuid() });
const tokenParam = z.object({ token: z.string().min(10) });

export function bookingRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  // ----- public (widget)
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/restaurants/{slug}/bookings",
      tags: ["Public"],
      summary: "Book a table as a guest",
      request: { params: slugParam, body: jsonBody(createPublicBookingInputSchema) },
      responses: { 201: jsonResponse(publicBookingDtoSchema, "The booking as the guest sees it") },
    }),
    async (c) => {
      const r = await findRestaurantBySlug(ctx, c.req.valid("param").slug);
      const body = c.req.valid("json");
      const [[cfg], [policy]] = await Promise.all([
        ctx.db
          .select({ requirePhone: widgetConfig.requirePhone })
          .from(widgetConfig)
          .where(eq(widgetConfig.restaurantId, r.id))
          .limit(1),
        ctx.db
          .select({ cutoff: bookingPolicy.cancellationCutoffMinutes })
          .from(bookingPolicy)
          .where(eq(bookingPolicy.restaurantId, r.id))
          .limit(1),
      ]);
      const result = await svc.createBooking(ctx, r, {
        serviceId: body.serviceId,
        startsAt: new Date(body.startsAt),
        partySize: body.partySize,
        areaId: body.areaId ?? null,
        guest: {
          name: body.guest.name,
          email: body.guest.email,
          phone: body.guest.phone ?? null,
          locale: body.guest.locale ?? null,
        },
        notes: body.notes ?? null,
        marketingConsent: body.marketingConsent,
        idempotencyKey: body.idempotencyKey ?? null,
        source: "widget",
        actor: { type: "guest", id: null },
        requirePhone: cfg?.requirePhone ?? false,
      });
      return c.json(svc.toPublicBookingDto(ctx, r, result, policy?.cutoff ?? 0), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/bookings/{token}",
      tags: ["Public"],
      summary: "Look up a booking with its manage token",
      request: { params: tokenParam },
      responses: { 200: jsonResponse(publicBookingDtoSchema, "Booking") },
    }),
    async (c) => {
      let found = await svc.getBookingByToken(ctx, c.req.valid("param").token);
      if (found.payment?.status === "pending") {
        // the guest is back from checkout: settle it even if the webhook never arrived
        await syncPendingForBooking(ctx, found.booking.id);
        found = await svc.getBookingByToken(ctx, c.req.valid("param").token);
      }
      const r = await findRestaurantById(ctx, found.booking.restaurantId);
      const [policy] = await ctx.db
        .select({ cutoff: bookingPolicy.cancellationCutoffMinutes })
        .from(bookingPolicy)
        .where(eq(bookingPolicy.restaurantId, r.id))
        .limit(1);
      return c.json(svc.toPublicBookingDto(ctx, r, found, policy?.cutoff ?? 0), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/bookings/{token}/cancel",
      tags: ["Public"],
      summary: "Cancel a booking as the guest",
      request: {
        params: tokenParam,
        body: jsonBody(z.object({ reason: z.string().trim().max(500).optional() })),
      },
      responses: { 200: jsonResponse(publicBookingDtoSchema, "Cancelled booking") },
    }),
    async (c) => {
      const { restaurant: r, result } = await svc.cancelByGuest(
        ctx,
        c.req.valid("param").token,
        c.req.valid("json").reason ?? null,
      );
      const [policy] = await ctx.db
        .select({ cutoff: bookingPolicy.cancellationCutoffMinutes })
        .from(bookingPolicy)
        .where(eq(bookingPolicy.restaurantId, r.id))
        .limit(1);
      return c.json(svc.toPublicBookingDto(ctx, r, result, policy?.cutoff ?? 0), 200);
    },
  );

  // ----- staff
  const tags = ["Bookings"];
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/bookings",
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: listBookingsQuerySchema },
      responses: { 200: jsonResponse(paginatedSchema(bookingDtoSchema), "Bookings") },
    }),
    async (c) =>
      c.json(await svc.listBookings(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings",
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(createStaffBookingInputSchema) },
      responses: { 201: jsonResponse(bookingDtoSchema, "Created booking") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const actor = c.get("actor");
      const canOverride =
        actor.type !== "guest" && actor.type !== "system" && actor.role !== "staff";
      const result = await svc.createBooking(ctx, c.get("restaurant"), {
        serviceId: body.serviceId,
        startsAt: new Date(body.startsAt),
        partySize: body.partySize,
        areaId: body.areaId ?? null,
        guest: {
          id: body.customer.id,
          name: body.customer.name,
          email: body.customer.email ?? null,
          phone: body.customer.phone ?? null,
          locale: body.customer.locale ?? null,
        },
        notes: body.notes ?? null,
        source: body.source,
        actor,
        ignoreCapacity: body.ignoreCapacity && canOverride,
        seatNow: body.seatNow,
        notifyGuest: body.notifyGuest,
      });
      return c.json(svc.toBookingDto(result), 201);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}",
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: bookingIdParam },
      responses: { 200: jsonResponse(bookingDtoSchema, "Booking") },
    }),
    async (c) =>
      c.json(
        svc.toBookingDto(
          await svc.getBookingWithRelations(
            ctx.db,
            c.get("restaurant").id,
            c.req.valid("param").bookingId,
          ),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}",
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: bookingIdParam, body: jsonBody(updateBookingInputSchema) },
      responses: { 200: jsonResponse(bookingDtoSchema, "Updated booking") },
    }),
    async (c) => {
      const actor = c.get("actor");
      const body = c.req.valid("json");
      const canOverride =
        (actor.type === "user" || actor.type === "api_key") && actor.role !== "staff";
      const result = await svc.updateBooking(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").bookingId,
        { ...body, ignoreCapacity: body.ignoreCapacity && canOverride },
        actor,
      );
      return c.json(svc.toBookingDto(result), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/actions",
      tags,
      summary: "Confirm, seat, complete, cancel, mark no-show or reopen a booking",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: bookingIdParam, body: jsonBody(bookingActionInputSchema) },
      responses: { 200: jsonResponse(bookingDtoSchema, "Booking after the action") },
    }),
    async (c) => {
      const body = c.req.valid("json");
      const result = await svc.applyBookingAction(ctx, c.get("restaurant"), {
        bookingId: c.req.valid("param").bookingId,
        action: body.action,
        actor: c.get("actor"),
        reason: body.reason ?? null,
      });
      return c.json(svc.toBookingDto(result), 200);
    },
  );
}
