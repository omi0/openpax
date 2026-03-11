import { z } from "zod";
import {
  idSchema,
  instantSchema,
  localDateSchema,
  localTimeSchema,
  partySizeSchema,
} from "./common.js";

export const UNAVAILABLE_REASONS = [
  "closed",
  "no_service",
  "in_past",
  "outside_lead_time",
  "too_far_ahead",
  "party_too_small",
  "party_too_large",
  "full",
  "no_table",
  "room_closed",
  "not_a_slot",
] as const;
export const unavailableReasonSchema = z.enum(UNAVAILABLE_REASONS);

export const availabilityQuerySchema = z.object({
  date: localDateSchema,
  partySize: z.coerce.number().pipe(partySizeSchema),
  areaId: idSchema.optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilitySlotDtoSchema = z.object({
  serviceId: idSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  startLocal: localTimeSchema,
  remainingCovers: z.number().int().nullable(),
  available: z.boolean(),
  reason: unavailableReasonSchema.optional(),
});
export type AvailabilitySlotDto = z.infer<typeof availabilitySlotDtoSchema>;

export const availabilityResponseSchema = z.object({
  date: localDateSchema,
  timezone: z.string(),
  closed: z.boolean(),
  reasons: z.array(unavailableReasonSchema),
  services: z.array(z.object({ id: idSchema, name: z.string() })),
  slots: z.array(availabilitySlotDtoSchema),
});
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/** Which days in a month have at least one open service (for the widget calendar). */
export const monthAvailabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
});
export const monthAvailabilityResponseSchema = z.object({
  month: z.string(),
  openDates: z.array(localDateSchema),
});
export type MonthAvailabilityResponse = z.infer<typeof monthAvailabilityResponseSchema>;
