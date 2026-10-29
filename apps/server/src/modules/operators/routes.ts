import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  createOperatorInputSchema,
  operatorDtoSchema,
  updateOperatorInputSchema,
  verifyOperatorInputSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const idParam = restaurantIdParam.extend({ id: z.uuid() });
const tags = ["Operators"];

export function operatorRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  const base = "/api/v1/restaurants/{restaurantId}/operators";
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      tags,
      summary: "Staff members who take bookings at the shared dashboard (names only)",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.array(operatorDtoSchema), "Operators") },
    }),
    async (c) => c.json(await svc.listOperators(ctx, c.get("restaurant")), 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: base,
      tags,
      summary: "Add an operator with their 6-digit code",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(createOperatorInputSchema) },
      responses: { 201: jsonResponse(operatorDtoSchema, "Operator") },
    }),
    async (c) =>
      c.json(
        await svc.createOperator(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        201,
      ),
  );
  app.openapi(
    createRoute({
      method: "patch",
      path: `${base}/{id}`,
      tags,
      summary: "Rename an operator or give them a new code",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: idParam, body: jsonBody(updateOperatorInputSchema) },
      responses: { 200: jsonResponse(operatorDtoSchema, "Operator") },
    }),
    async (c) =>
      c.json(
        await svc.updateOperator(
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
      summary: "Remove an operator (their name stays on past bookings)",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: idParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.deleteOperator(ctx, c.get("restaurant"), c.req.valid("param").id, c.get("actor"));
      return c.body(null, 204);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{id}/verify`,
      tags,
      summary: "Check an operator's code before opening a form",
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: idParam, body: jsonBody(verifyOperatorInputSchema) },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.checkOperator(ctx, c.get("restaurant"), {
        id: c.req.valid("param").id,
        pin: c.req.valid("json").pin,
      });
      return c.body(null, 204);
    },
  );
}
