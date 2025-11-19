import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import {
  availabilityQuerySchema,
  availabilityResponseSchema,
  monthAvailabilityQuerySchema,
  monthAvailabilityResponseSchema,
} from "@sitli/shared";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonResponse, slugParam } from "../../lib/openapi.js";
import { findRestaurantBySlug } from "../../lib/restaurant-lookup.js";
import { getAvailability, getMonthAvailability } from "./service.js";

export function availabilityRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/restaurants/{slug}/availability",
      tags: ["Public"],
      summary: "Bookable time slots for a date and party size",
      request: { params: slugParam, query: availabilityQuerySchema },
      responses: {
        200: jsonResponse(
          availabilityResponseSchema,
          "Slots for the day, including unavailable ones with a reason",
        ),
      },
    }),
    async (c) => {
      const r = await findRestaurantBySlug(ctx, c.req.valid("param").slug);
      const q = c.req.valid("query");
      return c.json(
        await getAvailability(ctx, r, {
          date: q.date,
          partySize: q.partySize,
          areaId: q.areaId ?? null,
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/restaurants/{slug}/availability/month",
      tags: ["Public"],
      summary: "Days of a month on which the restaurant takes bookings",
      request: { params: slugParam, query: monthAvailabilityQuerySchema },
      responses: { 200: jsonResponse(monthAvailabilityResponseSchema, "Open dates") },
    }),
    async (c) => {
      const r = await findRestaurantBySlug(ctx, c.req.valid("param").slug);
      return c.json(await getMonthAvailability(ctx, r, c.req.valid("query").month), 200);
    },
  );
}
