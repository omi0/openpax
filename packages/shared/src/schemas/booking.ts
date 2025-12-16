import { BOOKING_ACTIONS, BOOKING_SOURCES, BOOKING_STATUSES } from "@sitli/core";
import { z } from "zod";
import {
  emailSchema,
  idSchema,
  instantSchema,
  localDateSchema,
  localeSchema,
  paginationQuerySchema,
  partySizeSchema,
  phoneSchema,
} from "./common.js";

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const bookingSourceSchema = z.enum(BOOKING_SOURCES);
export const bookingActionSchema = z.enum(BOOKING_ACTIONS);

export const guestInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  locale: localeSchema.optional(),
});
export type GuestInput = z.infer<typeof guestInputSchema>;

/** Booking created by a guest through the widget or the public API. */
export const createPublicBookingInputSchema = z.object({
  serviceId: idSchema,
  startsAt: instantSchema,
  partySize: partySizeSchema,
  areaId: idSchema.nullable().optional(),
  guest: guestInputSchema,
  notes: z.string().trim().max(1000).optional(),
  marketingConsent: z.boolean().default(false),
  /** Client-generated key so retries return the same booking instead of a duplicate. */
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export type CreatePublicBookingInput = z.infer<typeof createPublicBookingInputSchema>;

/** Booking created by staff from the dashboard (walk-in, phone, manual). */
export const createStaffBookingInputSchema = z.object({
  serviceId: idSchema,
  startsAt: instantSchema,
  partySize: partySizeSchema,
  areaId: idSchema.nullable().optional(),
  customer: z.object({
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(120),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    locale: localeSchema.optional(),
  }),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(["manual", "phone", "walk_in"]).default("manual"),
  /** Walk-ins are usually seated immediately. */
  seatNow: z.boolean().default(false),
  /** Staff may override capacity (e.g. squeeze in regulars). */
  ignoreCapacity: z.boolean().default(false),
  notifyGuest: z.boolean().default(true),
});
export type CreateStaffBookingInput = z.infer<typeof createStaffBookingInputSchema>;

export const bookingCustomerDtoSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  locale: localeSchema.nullable(),
  visitCount: z.number().int(),
  noShowCount: z.number().int(),
});

export const bookingDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  serviceId: idSchema,
  serviceName: z.string(),
  areaId: idSchema.nullable(),
  customer: bookingCustomerDtoSchema,
  serviceDate: localDateSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  partySize: z.number().int(),
  status: bookingStatusSchema,
  source: bookingSourceSchema,
  locale: localeSchema,
  notes: z.string().nullable(),
  confirmationCode: z.string(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type BookingDto = z.infer<typeof bookingDtoSchema>;

/** What a guest sees after booking or when following the manage link. */
export const publicBookingDtoSchema = z.object({
  id: idSchema,
  confirmationCode: z.string(),
  status: bookingStatusSchema,
  serviceDate: localDateSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  partySize: z.number().int(),
  guestName: z.string(),
  serviceName: z.string(),
  restaurant: z.object({
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  canCancel: z.boolean(),
  manageUrl: z.string(),
});
export type PublicBookingDto = z.infer<typeof publicBookingDtoSchema>;

export const bookingActionInputSchema = z.object({
  action: bookingActionSchema,
  reason: z.string().trim().max(500).optional(),
});
export type BookingActionInput = z.infer<typeof bookingActionInputSchema>;

export const updateBookingInputSchema = z.object({
  serviceId: idSchema.optional(),
  startsAt: instantSchema.optional(),
  partySize: partySizeSchema.optional(),
  areaId: idSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  ignoreCapacity: z.boolean().default(false),
  notifyGuest: z.boolean().default(true),
});
export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;

export const listBookingsQuerySchema = paginationQuerySchema.extend({
  date: localDateSchema.optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  status: z
    .union([bookingStatusSchema, z.array(bookingStatusSchema)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  serviceId: idSchema.optional(),
  customerId: idSchema.optional(),
  search: z.string().trim().max(100).optional(),
  /** Chronological by default; "desc" for history views. */
  order: z.enum(["asc", "desc"]).default("asc"),
});
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
