import { z } from "zod";
import {
  currencySchema,
  emailSchema,
  idSchema,
  instantSchema,
  localeSchema,
  memberRoleSchema,
  slugSchema,
  timezoneSchema,
} from "./common.js";

export const createRestaurantInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  timezone: timezoneSchema,
  locale: localeSchema.default("it"),
  currency: currencySchema.default("EUR"),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(30).optional(),
  email: emailSchema.optional(),
  /** Seats of the first room; when given, a room is created with this capacity. */
  seats: z.number().int().min(1).max(5000).optional(),
  /** Only needed when the user belongs to more than one organization. */
  organizationId: z.string().optional(),
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInputSchema>;

export const updateRestaurantInputSchema = createRestaurantInputSchema
  .omit({ organizationId: true, seats: true })
  .partial();
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantInputSchema>;

export const restaurantDtoSchema = z.object({
  id: idSchema,
  organizationId: z.string(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  locale: localeSchema,
  currency: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type RestaurantDto = z.infer<typeof restaurantDtoSchema>;

export const restaurantSummaryDtoSchema = restaurantDtoSchema
  .pick({ id: true, organizationId: true, name: true, slug: true, timezone: true, locale: true })
  .extend({ role: memberRoleSchema });
export type RestaurantSummaryDto = z.infer<typeof restaurantSummaryDtoSchema>;

/**
 * A room (dining room, terrace, garden…). `seats` is how many guests it can
 * hold at once; `active: false` closes the room (its seats and tables stop
 * counting until it is reopened).
 */
export const areaDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  name: z.string(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  seats: z.number().int().nullable(),
});
export type AreaDto = z.infer<typeof areaDtoSchema>;

export const upsertAreaInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  seats: z.number().int().min(0).max(5000).nullable().default(null),
});
export type UpsertAreaInput = z.infer<typeof upsertAreaInputSchema>;
