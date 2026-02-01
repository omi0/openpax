import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { area, bookingPolicy, service, widgetConfig } from "@sitli/db";
import {
  type PublicWidgetConfigDto,
  publicWidgetConfigDtoSchema,
  SUPPORTED_LOCALES,
} from "@sitli/shared";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext, AppEnv } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { jsonResponse, slugParam } from "../../lib/openapi.js";
import { findRestaurantBySlug } from "../../lib/restaurant-lookup.js";

export function widgetRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  app.openapi(
    createRoute({
      method: "get",
      path: "/api/public/v1/restaurants/{slug}/widget-config",
      tags: ["Public"],
      summary: "Everything the booking widget needs to render",
      request: { params: slugParam },
      responses: { 200: jsonResponse(publicWidgetConfigDtoSchema, "Public widget configuration") },
    }),
    async (c) => {
      const r = await findRestaurantBySlug(ctx, c.req.valid("param").slug);
      const [[cfg], [policy], services, areas] = await Promise.all([
        ctx.db.select().from(widgetConfig).where(eq(widgetConfig.restaurantId, r.id)).limit(1),
        ctx.db.select().from(bookingPolicy).where(eq(bookingPolicy.restaurantId, r.id)).limit(1),
        ctx.db
          .select({
            id: service.id,
            name: service.name,
            minPartySize: service.minPartySize,
            maxPartySize: service.maxPartySize,
          })
          .from(service)
          .where(and(eq(service.restaurantId, r.id), eq(service.active, true)))
          .orderBy(asc(service.sortOrder), asc(service.name)),
        ctx.db
          .select({ id: area.id, name: area.name })
          .from(area)
          .where(and(eq(area.restaurantId, r.id), eq(area.active, true)))
          .orderBy(asc(area.sortOrder), asc(area.name)),
      ]);
      if (!cfg || !policy) throw ApiError.notFound("Restaurant");
      const dto: PublicWidgetConfigDto = {
        restaurant: {
          name: r.name,
          slug: r.slug,
          timezone: r.timezone,
          locale: r.locale as PublicWidgetConfigDto["restaurant"]["locale"],
          currency: r.currency,
          address: r.address,
          phone: r.phone,
          email: r.email,
        },
        widget: {
          primaryColor: cfg.primaryColor,
          logoUrl: cfg.logoUrl,
          defaultLocale: cfg.defaultLocale as PublicWidgetConfigDto["widget"]["defaultLocale"],
          locales: [...SUPPORTED_LOCALES],
          requirePhone: cfg.requirePhone,
          welcomeMessage: cfg.welcomeMessage,
          termsUrl: cfg.termsUrl,
          privacyUrl: cfg.privacyUrl,
        },
        services,
        areas,
        policy: {
          minPartySize: policy.minPartySize,
          maxPartySize: policy.maxPartySize,
          maxAdvanceDays: policy.maxAdvanceDays,
          minLeadMinutes: policy.minLeadMinutes,
          autoConfirm: policy.autoConfirm,
          waitlistEnabled: policy.waitlistEnabled,
        },
      };
      c.header("Cache-Control", "public, max-age=60");
      return c.json(dto, 200);
    },
  );
}
