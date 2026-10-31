import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  listMeetingsQuerySchema,
  meetingDaysDtoSchema,
  meetingDaysQuerySchema,
  meetingDtoSchema,
  meetingFeedDtoSchema,
  meetingListItemDtoSchema,
  meetingSlotsDtoSchema,
  meetingSlotsQuerySchema,
  scheduleMeetingInputSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as feed from "./feed.js";
import * as svc from "./service.js";

const bookingIdParam = restaurantIdParam.extend({ bookingId: z.uuid() });
const tags = ["Meetings"];
const feedFileParam = z.object({ file: z.string().regex(/^[\w-]{32}\.ics$/) });

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

  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/feed`,
      tags,
      summary: "The host's calendar subscription link, or null when off",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(meetingFeedDtoSchema, "Link") },
    }),
    async (c) => c.json(await feed.getMeetingFeed(ctx, c.get("restaurant")), 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/feed`,
      tags,
      summary: "A new calendar subscription link for the host; the old one stops working",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(meetingFeedDtoSchema, "Link") },
    }),
    async (c) =>
      c.json(await feed.setMeetingFeed(ctx, c.get("restaurant"), true, c.get("actor")), 200),
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: `${base}/feed`,
      tags,
      summary: "Turn the host's calendar subscription off",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(meetingFeedDtoSchema, "Link") },
    }),
    async (c) =>
      c.json(await feed.setMeetingFeed(ctx, c.get("restaurant"), false, c.get("actor")), 200),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/meetings/feed/{file}",
      tags,
      summary:
        "The host's meetings as an iCalendar subscription; an unknown link gets an empty one",
      request: { params: feedFileParam },
      responses: {
        200: {
          description: "iCalendar",
          content: { "text/calendar": { schema: z.string() } },
        },
      },
    }),
    async (c) => {
      const token = c.req.valid("param").file.slice(0, -".ics".length);
      return c.body(await feed.meetingFeed(ctx, token), 200, {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "no-store",
      });
    },
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
