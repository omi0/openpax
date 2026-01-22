import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { analyticsDtoSchema, analyticsQuerySchema } from "@sitli/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import { getAnalytics } from "./service.js";

export function analyticsRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/analytics",
      tags: ["Analytics"],
      summary: "Bookings, covers, no-shows and occupancy over a date range",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: analyticsQuerySchema },
      responses: {
        200: jsonResponse(analyticsDtoSchema, "Aggregates by day, service, source and weekday"),
      },
    }),
    async (c) => c.json(await getAnalytics(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );
}
