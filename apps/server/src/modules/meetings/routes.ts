import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  listMeetingsQuerySchema,
  meetingDaysDtoSchema,
  meetingDaysQuerySchema,
  meetingDtoSchema,
  meetingListItemDtoSchema,
  meetingSlotsDtoSchema,
  meetingSlotsQuerySchema,
  scheduleMeetingInputSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const bookingIdParam = restaurantIdParam.extend({ bookingId: z.uuid() });
const tags = ["Meetings"];

export function meetingRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  const base = "/api/v1/restaurants/{restaurantId}/meetings";
  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/slots`,
      tags,
      summary: "The host's meeting slots on a date, with the taken ones marked",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: meetingSlotsQuerySchema },
      responses: { 200: jsonResponse(meetingSlotsDtoSchema, "Slots") },
    }),
    async (c) =>
      c.json(
        await svc.meetingSlots(ctx, ctx.db, c.get("restaurant"), c.req.valid("query").date),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/days`,
      tags,
      summary: "Free meeting slots per day between two dates (at most 62 days)",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: meetingDaysQuerySchema },
      responses: { 200: jsonResponse(meetingDaysDtoSchema, "Days") },
    }),
    async (c) => c.json(await svc.meetingDays(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      tags,
      summary: "Meetings between two dates, soonest first",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: listMeetingsQuerySchema },
      responses: { 200: jsonResponse(z.array(meetingListItemDtoSchema), "Meetings") },
    }),
    async (c) =>
      c.json(await svc.listMeetings(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );

  const one = "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/meeting";
  app.openapi(
    createRoute({
      method: "get",
      path: one,
      tags,
      summary: "The booking's meeting with the host, if any",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: bookingIdParam },
      responses: { 200: jsonResponse(meetingDtoSchema.nullable(), "Meeting or null") },
    }),
    async (c) =>
      c.json(
        await svc.getBookingMeeting(ctx, c.get("restaurant"), c.req.valid("param").bookingId),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: one,
      tags,
      summary: "Book or move the meeting on a free slot; the host gets a calendar invite",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: bookingIdParam, body: jsonBody(scheduleMeetingInputSchema) },
      responses: { 200: jsonResponse(meetingDtoSchema, "Meeting") },
    }),
    async (c) =>
      c.json(
        await svc.scheduleMeeting(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").bookingId,
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: one,
      tags,
      summary: "Cancel the meeting; the host gets the cancellation",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: bookingIdParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.cancelMeeting(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").bookingId,
        c.get("actor"),
      );
      return c.body(null, 204);
    },
  );
}
