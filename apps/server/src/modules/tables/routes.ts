import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  assignTablesInputSchema,
  bookingTableDtoSchema,
  tableDtoSchema,
  updateTablePositionsInputSchema,
  upsertTableInputSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["Tables"];
const base = "/api/v1/restaurants/{restaurantId}/tables";
const idParam = restaurantIdParam.extend({ id: z.uuid() });

export function tableRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      tags,
      summary: "Tables of the floor plan",
      middleware: [requireRestaurant(ctx, { service: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.array(tableDtoSchema), "Tables") },
    }),
    async (c) => c.json(await svc.listTables(ctx, c.get("restaurant").id), 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: base,
      tags,
      middleware: [requireRestaurant(ctx, { service: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(upsertTableInputSchema) },
      responses: { 201: jsonResponse(tableDtoSchema, "Created table") },
    }),
    async (c) =>
      c.json(
        await svc.createTable(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        201,
      ),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: `${base}/positions`,
      tags,
      summary: "Save the floor plan layout after dragging tables around",
      middleware: [requireRestaurant(ctx, { service: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateTablePositionsInputSchema) },
      responses: { 200: jsonResponse(z.array(tableDtoSchema), "Tables") },
    }),
    async (c) =>
      c.json(await svc.updatePositions(ctx, c.get("restaurant"), c.req.valid("json")), 200),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: `${base}/{id}`,
      tags,
      middleware: [requireRestaurant(ctx, { service: ["update"] })] as const,
      request: { params: idParam, body: jsonBody(upsertTableInputSchema) },
      responses: { 200: jsonResponse(tableDtoSchema, "Updated table") },
    }),
    async (c) =>
      c.json(
        await svc.updateTable(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").id,
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: `${base}/{id}`,
      tags,
      middleware: [requireRestaurant(ctx, { service: ["delete"] })] as const,
      request: { params: idParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.deleteTable(ctx, c.get("restaurant"), c.req.valid("param").id, c.get("actor"));
      return c.body(null, 204);
    },
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/tables",
      tags,
      summary: "Seat a booking at specific tables (empty list = unassign)",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: {
        params: restaurantIdParam.extend({ bookingId: z.uuid() }),
        body: jsonBody(assignTablesInputSchema),
      },
      responses: { 200: jsonResponse(z.array(bookingTableDtoSchema), "Tables of the booking") },
    }),
    async (c) =>
      c.json(
        await svc.assignTables(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").bookingId,
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );
}
