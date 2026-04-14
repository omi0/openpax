import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  bookingPaymentDtoSchema,
  paymentConfigDtoSchema,
  updatePaymentConfigInputSchema,
} from "@openpax/shared";
import { requireRestaurant } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import { rateLimit } from "../../lib/rate-limit.js";
import * as svc from "./service.js";

const tags = ["Payments"];
const bookingIdParam = restaurantIdParam.extend({ bookingId: z.uuid() });

export function paymentRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  // Stripe posts events here; the restaurant id selects the signing secret.
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/public/v1/payments/stripe/webhook/{restaurantId}",
      tags,
      summary: "Stripe webhook endpoint (one per restaurant)",
      request: { params: restaurantIdParam },
      responses: {
        200: jsonResponse(
          z.object({ received: z.literal(true), handled: z.boolean() }),
          "Acknowledged",
        ),
      },
    }),
    async (c) => {
      const raw = await c.req.text();
      const result = await svc.handleWebhook(
        ctx,
        c.req.valid("param").restaurantId,
        raw,
        c.req.header("stripe-signature") ?? null,
      );
      return c.json({ received: true as const, handled: result.handled }, 200);
    },
  );

  const base = "/api/v1/restaurants/{restaurantId}/payments";
  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/config`,
      tags,
      summary: "Stripe keys (masked) and the deposit / no-show policy",
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(paymentConfigDtoSchema, "Payment configuration") },
    }),
    async (c) => c.json(await svc.getConfigDto(ctx, c.get("restaurant")), 200),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: `${base}/config`,
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updatePaymentConfigInputSchema) },
      responses: { 200: jsonResponse(paymentConfigDtoSchema, "Saved configuration") },
    }),
    async (c) =>
      c.json(
        await svc.upsertConfig(ctx, c.get("restaurant"), c.req.valid("json"), c.get("actor")),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/test`,
      tags,
      summary: "Check that the stored secret key is accepted by Stripe",
      middleware: [
        requireRestaurant(ctx, { settings: ["update"] }),
        rateLimit(
          ctx.limiter,
          { name: "test-send", limit: 5, windowMs: 60_000, keyOf: (c) => c.get("restaurant").id },
          { enabled: ctx.env.RATE_LIMIT === "on", trustProxy: ctx.env.TRUST_PROXY },
        ),
      ] as const,
      request: { params: restaurantIdParam },
      responses: { 200: jsonResponse(z.object({ ok: z.literal(true) }), "Key accepted") },
    }),
    async (c) => {
      await svc.testConnection(ctx, c.get("restaurant"));
      return c.json({ ok: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/payment/refund",
      tags,
      summary: "Refund the deposit of a booking",
      middleware: [requireRestaurant(ctx, { booking: ["cancel"] })] as const,
      request: { params: bookingIdParam },
      responses: { 200: jsonResponse(bookingPaymentDtoSchema, "Refunded payment") },
    }),
    async (c) =>
      c.json(
        svc.toPaymentDto(
          await svc.refundPayment(
            ctx,
            c.get("restaurant"),
            c.req.valid("param").bookingId,
            c.get("actor"),
          ),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/payment/charge",
      tags,
      summary: "Charge the no-show fee on the saved card",
      middleware: [requireRestaurant(ctx, { booking: ["cancel"] })] as const,
      request: { params: bookingIdParam },
      responses: { 200: jsonResponse(bookingPaymentDtoSchema, "Payment after the charge attempt") },
    }),
    async (c) =>
      c.json(
        svc.toPaymentDto(
          await svc.chargeNoShowFee(
            ctx,
            c.get("restaurant"),
            c.req.valid("param").bookingId,
            c.get("actor"),
          ),
        ),
        200,
      ),
  );
}
