import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  feedbackDtoSchema,
  feedbackSummaryDtoSchema,
  listFeedbackQuerySchema,
  paginatedSchema,
  publicFeedbackDtoSchema,
  submitFeedbackInputSchema,
} from "@sitli/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import * as svc from "./service.js";

const tokenParam = z.object({ token: z.string().min(10) });
const tags = ["Feedback"];

export function feedbackRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/feedback/{token}",
      tags: ["Public"],
      summary: "The visit behind a feedback link, and the answer so far",
      request: { params: tokenParam },
      responses: { 200: jsonResponse(publicFeedbackDtoSchema, "Feedback page") },
    }),
    async (c) => c.json(await svc.getFeedbackPage(ctx, c.req.valid("param").token), 200),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/feedback/{token}",
      tags: ["Public"],
      summary: "Rate the visit (1–5) with an optional comment",
      request: { params: tokenParam, body: jsonBody(submitFeedbackInputSchema) },
      responses: { 200: jsonResponse(publicFeedbackDtoSchema, "Saved answer") },
    }),
    async (c) =>
      c.json(await svc.submitFeedback(ctx, c.req.valid("param").token, c.req.valid("json")), 200),
  );

  const base = "/api/v1/restaurants/{restaurantId}/feedback";
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam, query: listFeedbackQuerySchema },
      responses: {
        200: jsonResponse(paginatedSchema(feedbackDtoSchema), "Feedback, newest first"),
      },
    }),
    async (c) =>
      c.json(await svc.listFeedback(ctx, c.get("restaurant"), c.req.valid("query")), 200),
  );
  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/summary`,
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(feedbackSummaryDtoSchema, "All-time responses and average") },
    }),
    async (c) => c.json(await svc.feedbackSummary(ctx, c.get("restaurant").id), 200),
  );
}
