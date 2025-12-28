import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { apiKeyDtoSchema, createApiKeyInputSchema, createdApiKeyDtoSchema } from "@sitli/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, noContentResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tags = ["API keys"];
const keyParam = restaurantIdParam.extend({ keyId: z.uuid() });

export function apiKeyRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/api-keys",
      tags,
      summary: "Organization API keys (secrets are never returned)",
      middleware: [requireRestaurant(ctx, { apiKey: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.array(apiKeyDtoSchema), "API keys") },
    }),
    async (c) => c.json(await svc.listApiKeys(ctx, c.get("restaurant")), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/api-keys",
      tags,
      summary: "Create an API key; the secret is only returned here",
      middleware: [requireRestaurant(ctx, { apiKey: ["create"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(createApiKeyInputSchema) },
      responses: { 201: jsonResponse(createdApiKeyDtoSchema, "Created key with its secret") },
    }),
    async (c) =>
      c.json(
        await svc.createApiKey(
          ctx,
          c.get("restaurant"),
          c.req.valid("json"),
          c.get("actor"),
          c.req.raw.headers,
        ),
        201,
      ),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/api-keys/{keyId}",
      tags,
      middleware: [requireRestaurant(ctx, { apiKey: ["delete"] })] as const,
      request: { params: keyParam },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      await svc.deleteApiKey(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").keyId,
        c.get("actor"),
        c.req.raw.headers,
      );
      return c.body(null, 204);
    },
  );
}
