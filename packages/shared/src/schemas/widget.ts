import { z } from "zod";
import { hexColorSchema, idSchema, localeSchema } from "./common.js";

export const updateWidgetConfigInputSchema = z.object({
  primaryColor: hexColorSchema,
  logoUrl: z.url().max(500).nullable(),
  defaultLocale: localeSchema,
  requirePhone: z.boolean(),
  welcomeMessage: z.string().trim().max(500).nullable(),
  termsUrl: z.url().max(500).nullable(),
  privacyUrl: z.url().max(500).nullable(),
  allowedOrigins: z.array(z.string().trim().max(200)).max(20),
});
export type UpdateWidgetConfigInput = z.infer<typeof updateWidgetConfigInputSchema>;

export const widgetConfigDtoSchema = updateWidgetConfigInputSchema.extend({
  restaurantId: idSchema,
  embedSnippet: z.string(),
  hostedUrl: z.string(),
});
export type WidgetConfigDto = z.infer<typeof widgetConfigDtoSchema>;

/** Everything the public widget needs to render, with no secrets. */
export const publicWidgetConfigDtoSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    locale: localeSchema,
    currency: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  widget: z.object({
    primaryColor: z.string(),
    logoUrl: z.string().nullable(),
    defaultLocale: localeSchema,
    locales: z.array(localeSchema),
    requirePhone: z.boolean(),
    welcomeMessage: z.string().nullable(),
    termsUrl: z.string().nullable(),
    privacyUrl: z.string().nullable(),
  }),
  services: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      minPartySize: z.number().int().nullable(),
      maxPartySize: z.number().int().nullable(),
    }),
  ),
  areas: z.array(z.object({ id: idSchema, name: z.string() })),
  policy: z.object({
    minPartySize: z.number().int(),
    maxPartySize: z.number().int(),
    maxAdvanceDays: z.number().int(),
    minLeadMinutes: z.number().int(),
    autoConfirm: z.boolean(),
    waitlistEnabled: z.boolean(),
  }),
});
export type PublicWidgetConfigDto = z.infer<typeof publicWidgetConfigDtoSchema>;
