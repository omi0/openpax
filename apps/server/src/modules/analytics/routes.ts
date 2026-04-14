import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { analyticsDtoSchema, analyticsQuerySchema } from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import { analyticsToCsv, getAnalytics } from "./service.js";

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
        200: jsonResponse(
          analyticsDtoSchema,
          "Aggregates by day, service, source and weekday, with the previous period and distributions",
        ),
      },
    }),
    async (c) => c.json(await getAnalytics(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/analytics/export",
      tags: ["Analytics"],
      summary: "The per-day table of the range as CSV",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: analyticsQuerySchema },
      responses: {
        200: {
          description: "CSV with one row per day and a total row",
          content: { "text/csv": { schema: z.string() } },
        },
      },
    }),
    async (c) => {
      const r = c.get("restaurant");
      const q = c.req.valid("query");
      const csv = analyticsToCsv(await getAnalytics(ctx, r, q));
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="analytics-${r.slug}-${q.from}-${q.to}.csv"`,
      });
    },
  );
}
