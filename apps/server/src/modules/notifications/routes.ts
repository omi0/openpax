import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { notificationLog } from "@sitli/db";
import {
  notificationChannelSchema,
  notificationLogDtoSchema,
  notificationSettingDtoSchema,
  providerConfigDtoSchema,
  providerDescriptorDtoSchema,
  testProviderInputSchema,
  updateNotificationSettingsInputSchema,
  upsertProviderConfigInputSchema,
} from "@sitli/shared";
import { and, desc, eq } from "drizzle-orm";
import { requireRestaurant, requireSession } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonBody, jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import { describeProvider } from "../../notifications/provider.js";
import * as svc from "./service.js";

const tags = ["Notifications"];
const channelParam = restaurantIdParam.extend({ channel: notificationChannelSchema });

export function notificationRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/notification-providers",
      tags,
      summary: "Available email and SMS providers and the fields each one needs",
      middleware: [requireSession()] as const,
      responses: { 200: jsonResponse(z.array(providerDescriptorDtoSchema), "Providers") },
    }),
    async (c) => c.json(ctx.providers.list().map(describeProvider), 200),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/notification-providers/{channel}",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: channelParam },
      responses: {
        200: jsonResponse(
          providerConfigDtoSchema,
          "Active provider for the channel, secrets masked",
        ),
      },
    }),
    async (c) =>
      c.json(
        await svc.getProviderConfigDto(ctx, c.get("restaurant"), c.req.valid("param").channel),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/notification-providers/{channel}",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: channelParam, body: jsonBody(upsertProviderConfigInputSchema) },
      responses: { 200: jsonResponse(providerConfigDtoSchema, "Saved provider configuration") },
    }),
    async (c) =>
      c.json(
        await svc.upsertProviderConfig(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").channel,
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/restaurants/{restaurantId}/notification-providers/{channel}",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: {
        params: channelParam,
        query: z.object({ scope: z.enum(["restaurant", "organization"]).default("restaurant") }),
      },
      responses: {
        200: jsonResponse(
          providerConfigDtoSchema,
          "Provider after removal (may fall back to a wider scope)",
        ),
      },
    }),
    async (c) =>
      c.json(
        await svc.disableProviderConfig(
          ctx,
          c.get("restaurant"),
          c.req.valid("param").channel,
          c.req.valid("query").scope,
          c.get("actor"),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/notification-providers/{channel}/test",
      tags,
      summary: "Send a test message through the configured provider",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: channelParam, body: jsonBody(testProviderInputSchema) },
      responses: {
        200: jsonResponse(
          z.object({ ok: z.literal(true), providerId: z.string(), scope: z.string() }),
          "Test message sent",
        ),
      },
    }),
    async (c) => {
      const result = await svc.sendTestMessage(
        ctx,
        c.get("restaurant"),
        c.req.valid("param").channel,
        c.req.valid("json").to,
      );
      return c.json({ ok: true as const, ...result }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/notification-settings",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam },
      responses: {
        200: jsonResponse(z.array(notificationSettingDtoSchema), "Which notifications are enabled"),
      },
    }),
    async (c) => c.json(await svc.getSettings(ctx, c.get("restaurant").id), 200),
  );

  app.openapi(
    createRoute({
      method: "put",
      path: "/api/v1/restaurants/{restaurantId}/notification-settings",
      tags,
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(updateNotificationSettingsInputSchema) },
      responses: { 200: jsonResponse(z.array(notificationSettingDtoSchema), "Updated settings") },
    }),
    async (c) =>
      c.json(
        await svc.updateSettings(
          ctx,
          c.get("restaurant"),
          c.req.valid("json").settings,
          c.get("actor"),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/notifications",
      tags,
      middleware: [requireRestaurant(ctx, { booking: ["read"] })] as const,
      request: { params: restaurantIdParam.extend({ bookingId: z.uuid() }) },
      responses: {
        200: jsonResponse(z.array(notificationLogDtoSchema), "Notification history of a booking"),
      },
    }),
    async (c) => {
      const rows = await ctx.db
        .select()
        .from(notificationLog)
        .where(
          and(
            eq(notificationLog.restaurantId, c.get("restaurant").id),
            eq(notificationLog.bookingId, c.req.valid("param").bookingId),
          ),
        )
        .orderBy(desc(notificationLog.createdAt));
      return c.json(
        rows.map((r) => ({
          id: r.id,
          bookingId: r.bookingId,
          event: r.event,
          channel: r.channel,
          audience: r.audience,
          providerId: r.providerId,
          recipient: r.recipient,
          status: r.status,
          error: r.error,
          sentAt: r.sentAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        200,
      );
    },
  );
}
