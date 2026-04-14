import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  exportBookingsQuerySchema,
  exportCustomersQuerySchema,
  importQuerySchema,
  importResultDtoSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["CSV"];
const csvBody = {
  content: { "text/csv": { schema: z.string() } },
  description: "CSV text with a header row",
  required: true,
};
const csvResponse = (description: string) => ({
  description,
  content: { "text/csv": { schema: z.string() } },
});

export function csvRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/bookings/export",
      tags,
      summary: "Bookings as CSV, with the list filters",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: exportBookingsQuerySchema },
      responses: { 200: csvResponse("One booking per row") },
    }),
    async (c) => {
      const r = c.get("restaurant");
      const csv = await svc.exportBookings(ctx, r, c.req.valid("query"));
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bookings-${r.slug}.csv"`,
      });
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/customers/export",
      tags,
      summary: "Guest book as CSV",
      middleware: [requireRestaurant(ctx, { customer: ["export"] })] as const,
      request: { params: restaurantIdParam, query: exportCustomersQuerySchema },
      responses: { 200: csvResponse("One guest per row") },
    }),
    async (c) => {
      const r = c.get("restaurant");
      const csv = await svc.exportCustomers(ctx, r, c.req.valid("query"));
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="customers-${r.slug}.csv"`,
      });
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/customers/import",
      tags,
      summary:
        "Create or update guests from CSV (name, email, phone, tags, notes, locale, marketing_consent)",
      middleware: [requireRestaurant(ctx, { customer: ["update"] })] as const,
      request: { params: restaurantIdParam, query: importQuerySchema, body: csvBody },
      responses: { 200: jsonResponse(importResultDtoSchema, "Counts and row errors") },
    }),
    async (c) =>
      c.json(
        await svc.importCustomers(
          ctx,
          c.get("restaurant"),
          await c.req.text(),
          c.req.valid("query").dryRun,
          c.get("actor"),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings/import",
      tags,
      summary:
        "Create bookings from CSV (date, time, guests, name, email, phone, service, status, notes, source)",
      middleware: [requireRestaurant(ctx, { booking: ["create"], service: ["update"] })] as const,
      request: { params: restaurantIdParam, query: importQuerySchema, body: csvBody },
      responses: { 200: jsonResponse(importResultDtoSchema, "Counts and row errors") },
    }),
    async (c) =>
      c.json(
        await svc.importBookings(
          ctx,
          c.get("restaurant"),
          await c.req.text(),
          c.req.valid("query").dryRun,
          c.get("actor"),
        ),
        200,
      ),
  );
}
