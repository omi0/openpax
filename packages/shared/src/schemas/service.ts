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

export const upsertScheduleExceptionInputSchema = z.object({
  serviceId: idSchema.nullable().default(null),
  date: localDateSchema,
  closed: z.boolean().default(true),
  windows: z.array(timeWindowSchema).max(6).nullable().default(null),
  reason: z.string().trim().max(200).nullable().default(null),
});
export type UpsertScheduleExceptionInput = z.infer<typeof upsertScheduleExceptionInputSchema>;

export const scheduleExceptionDtoSchema = upsertScheduleExceptionInputSchema.extend({
  id: idSchema,
  restaurantId: idSchema,
});
export type ScheduleExceptionDto = z.infer<typeof scheduleExceptionDtoSchema>;

export const upsertCapacityRuleInputSchema = z.object({
  name: z.string().trim().max(80).nullable().default(null),
  serviceId: idSchema.nullable().default(null),
  areaId: idSchema.nullable().default(null),
  weekday: weekdaySchema.nullable().default(null),
  date: localDateSchema.nullable().default(null),
  startTime: localTimeSchema.nullable().default(null),
  endTime: localTimeSchema.nullable().default(null),
  maxCovers: z.number().int().min(0).max(10000).nullable().default(null),
  maxBookings: z.number().int().min(0).max(10000).nullable().default(null),
  maxPartySize: z.number().int().min(1).max(100).nullable().default(null),
  active: z.boolean().default(true),
});
export type UpsertCapacityRuleInput = z.infer<typeof upsertCapacityRuleInputSchema>;

export const capacityRuleDtoSchema = upsertCapacityRuleInputSchema.extend({
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
});
export type BookingPolicyDto = z.infer<typeof bookingPolicyDtoSchema>;

export const updateBookingPolicyInputSchema = bookingPolicyDtoSchema.partial();
export type UpdateBookingPolicyInput = z.infer<typeof updateBookingPolicyInputSchema>;
