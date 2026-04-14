import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { setupStatusDtoSchema, updateSetupInputSchema } from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["Setup"];

export function setupRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/setup",
      tags,
      summary: "Progress of the setup guide, judged from the restaurant's configuration",
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(setupStatusDtoSchema, "Setup status") },
    }),
    async (c) => c.json(await svc.getSetupStatus(ctx, c.get("restaurant")), 200),
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/api/v1/restaurants/{restaurantId}/setup",
      tags,
      summary: "Mark steps as reviewed, finish or reopen the guide",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateSetupInputSchema) },
      responses: { 200: jsonResponse(setupStatusDtoSchema, "Setup status after the change") },
    }),
    async (c) =>
      c.json(
        await svc.updateSetup(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        200,
      ),
  );
}
