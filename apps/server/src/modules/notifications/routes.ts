import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { booking, notificationLog } from "@openpax/db";
import {
  localeSchema,
  notificationAudienceSchema,
  notificationChannelSchema,
  notificationEventSchema,
  notificationLogDtoSchema,
  notificationSettingDtoSchema,
  notificationTemplateDtoSchema,
  notificationTemplatePreviewSchema,
  providerConfigDtoSchema,
  providerDescriptorDtoSchema,
  testProviderInputSchema,
  updateNotificationSettingsInputSchema,
  upsertNotificationTemplateInputSchema,
  upsertProviderConfigInputSchema,
} from "@openpax/shared";
import { and, desc, eq } from "drizzle-orm";
import { requireRestaurant, requireSession } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { jsonBody, jsonResponse, restaurantIdParam } from "../../lib/openapi.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { describeProvider } from "../../notifications/provider.js";
import { resendToGuest } from "./dispatch.js";
import * as svc from "./service.js";
import * as templates from "./templates.js";

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
      middleware: [
        requireRestaurant(ctx, { settings: ["update"] }),
        rateLimit(
          ctx.limiter,
          { name: "test-send", limit: 5, windowMs: 60_000, keyOf: (c) => c.get("restaurant").id },
          { enabled: ctx.env.RATE_LIMIT === "on", trustProxy: ctx.env.TRUST_PROXY },
        ),
      ] as const,
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

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/restaurants/{restaurantId}/bookings/{bookingId}/notifications/resend",
      tags,
      summary: "Send the guest the message for the booking's current status again",
      middleware: [requireRestaurant(ctx, { booking: ["update"] })] as const,
      request: { params: restaurantIdParam.extend({ bookingId: z.uuid() }) },
      responses: {
        200: jsonResponse(
          z.object({ queued: z.number().int(), event: notificationEventSchema.nullable() }),
          "How many messages were queued",
        ),
      },
    }),
    async (c) => {
      const bookingId = c.req.valid("param").bookingId;
      const [row] = await ctx.db
        .select({ id: booking.id })
        .from(booking)
        .where(and(eq(booking.id, bookingId), eq(booking.restaurantId, c.get("restaurant").id)))
        .limit(1);
      if (!row) throw ApiError.notFound("Booking");
      return c.json(await resendToGuest(ctx, bookingId), 200);
    },
  );

  // ----- templates
  const templatesPath = "/api/v1/restaurants/{restaurantId}/notification-templates";
  app.openapi(
    createRoute({
      method: "get",
      path: templatesPath,
      tags,
      summary: "Message templates in effect for a locale (defaults unless customised)",
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam, query: z.object({ locale: localeSchema }) },
      responses: { 200: jsonResponse(z.array(notificationTemplateDtoSchema), "Templates") },
    }),
    async (c) =>
      c.json(
        await templates.listTemplates(ctx, c.get("restaurant").id, c.req.valid("query").locale),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "put",
      path: templatesPath,
      tags,
      summary: "Save the restaurant's own wording for a message",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(upsertNotificationTemplateInputSchema) },
      responses: { 200: jsonResponse(notificationTemplateDtoSchema, "Saved template") },
    }),
    async (c) =>
      c.json(
        await templates.upsertTemplate(
          ctx,
          c.get("restaurant"),
          c.req.valid("json"),
          c.get("actor"),
        ),
        200,
      ),
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${templatesPath}/preview`,
      tags,
      summary: "Render a template with sample data without saving it",
      middleware: [requireRestaurant(ctx, { settings: ["read"] })] as const,
      request: { params: restaurantIdParam, body: jsonBody(upsertNotificationTemplateInputSchema) },
      responses: { 200: jsonResponse(notificationTemplatePreviewSchema, "Rendered preview") },
    }),
    async (c) =>
      c.json(await templates.previewTemplate(ctx, c.get("restaurant"), c.req.valid("json")), 200),
  );
  app.openapi(
    createRoute({
      method: "delete",
      path: `${templatesPath}/{event}/{channel}/{audience}/{locale}`,
      tags,
      summary: "Go back to the default wording",
      middleware: [requireRestaurant(ctx, { settings: ["update"] })] as const,
      request: {
        params: restaurantIdParam.extend({
          event: notificationEventSchema,
          channel: notificationChannelSchema,
          audience: notificationAudienceSchema,
          locale: localeSchema,
        }),
      },
      responses: { 200: jsonResponse(notificationTemplateDtoSchema, "Default template") },
    }),
    async (c) => {
      const { restaurantId: _r, ...key } = c.req.valid("param");
      return c.json(
        await templates.resetTemplate(ctx, c.get("restaurant"), key, c.get("actor")),
        200,
      );
    },
  );
}
