import { z } from "zod";
import { idSchema, instantSchema, localDateSchema, localTimeSchema } from "./common.js";
import { timeWindowSchema, weekdaySchema, weeklyHoursSchema } from "./weekly-hours.js";

export const upsertServiceInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  weeklyHours: weeklyHoursSchema,
  slotIntervalMinutes: z.number().int().min(5).max(240),
  durationMinutes: z.number().int().min(15).max(600),
  maxCoversPerSlot: z.number().int().min(1).max(1000).nullable().default(null),
  maxBookingsPerSlot: z.number().int().min(1).max(1000).nullable().default(null),
  minPartySize: z.number().int().min(1).max(100).nullable().default(null),
  maxPartySize: z.number().int().min(1).max(100).nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type UpsertServiceInput = z.infer<typeof upsertServiceInputSchema>;

export const serviceDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  name: z.string(),
  weeklyHours: weeklyHoursSchema,
  slotIntervalMinutes: z.number().int(),
  durationMinutes: z.number().int(),
  maxCoversPerSlot: z.number().int().nullable(),
  maxBookingsPerSlot: z.number().int().nullable(),
  minPartySize: z.number().int().nullable(),
  maxPartySize: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type ServiceDto = z.infer<typeof serviceDtoSchema>;

const dateRangeInOrder = (v: { date: string; endDate: string | null }) =>
  v.endDate === null || v.endDate >= v.date;

export const upsertScheduleExceptionInputSchema = z
  .object({
    serviceId: idSchema.nullable().default(null),
    /** First day. */
    date: localDateSchema,
    /** Last day (inclusive); null or equal to `date` for a single day. */
    endDate: localDateSchema.nullable().default(null),
    closed: z.boolean().default(true),
    windows: z.array(timeWindowSchema).max(6).nullable().default(null),
    reason: z.string().trim().max(200).nullable().default(null),
  })
  .refine(dateRangeInOrder, { message: "endDate must not be before date", path: ["endDate"] });
export type UpsertScheduleExceptionInput = z.infer<typeof upsertScheduleExceptionInputSchema>;

export const scheduleExceptionDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  serviceId: idSchema.nullable(),
  date: localDateSchema,
  /** Last day (inclusive); equals `date` for a single day. */
  endDate: localDateSchema,
  closed: z.boolean(),
  windows: z.array(timeWindowSchema).nullable(),
  reason: z.string().nullable(),
});
export type ScheduleExceptionDto = z.infer<typeof scheduleExceptionDtoSchema>;

const capacityRuleFields = {
  name: z.string().trim().max(80).nullable().default(null),
  serviceId: idSchema.nullable().default(null),
  areaId: idSchema.nullable().default(null),
  weekday: weekdaySchema.nullable().default(null),
  /** First day the rule applies to; null = every day (or the weekday). */
  date: localDateSchema.nullable().default(null),
  /** Last day (inclusive) of a date range; null = only `date`. */
  endDate: localDateSchema.nullable().default(null),
  startTime: localTimeSchema.nullable().default(null),
  endTime: localTimeSchema.nullable().default(null),
  maxCovers: z.number().int().min(0).max(10000).nullable().default(null),
  maxBookings: z.number().int().min(0).max(10000).nullable().default(null),
  maxPartySize: z.number().int().min(1).max(100).nullable().default(null),
  active: z.boolean().default(true),
};

export const upsertCapacityRuleInputSchema = z
  .object(capacityRuleFields)
  .refine((v) => v.date !== null || v.endDate === null, {
    message: "endDate needs a date",
    path: ["endDate"],
  })
  .refine((v) => v.date === null || dateRangeInOrder({ date: v.date, endDate: v.endDate }), {
    message: "endDate must not be before date",
    path: ["endDate"],
  });
export type UpsertCapacityRuleInput = z.infer<typeof upsertCapacityRuleInputSchema>;

export const capacityRuleDtoSchema = z.object({
  ...capacityRuleFields,
  id: idSchema,
  restaurantId: idSchema,
});
export type CapacityRuleDto = z.infer<typeof capacityRuleDtoSchema>;

export const bookingPolicyDtoSchema = z.object({
  minLeadMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30),
  maxAdvanceDays: z.number().int().min(0).max(730),
  minPartySize: z.number().int().min(1).max(100),
  maxPartySize: z.number().int().min(1).max(100),
  autoConfirm: z.boolean(),
  cancellationCutoffMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30),
  largePartyThreshold: z.number().int().min(1).max(100).nullable(),
  /** Guests can queue for a date with no free table. */
  waitlistEnabled: z.boolean(),
  /** Offer freed tables to the queue automatically. */
  waitlistAutoOffer: z.boolean(),
  /** Minutes a guest has to accept an offered table. */
  waitlistOfferMinutes: z
    .number()
    .int()
    .min(15)
    .max(60 * 24 * 7),
});
export type BookingPolicyDto = z.infer<typeof bookingPolicyDtoSchema>;

export const updateBookingPolicyInputSchema = bookingPolicyDtoSchema.partial();
export type UpdateBookingPolicyInput = z.infer<typeof updateBookingPolicyInputSchema>;
