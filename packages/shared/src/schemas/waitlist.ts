import { WAITLIST_STATUSES } from "@sitli/core";
import { z } from "zod";
import { bookingCustomerDtoSchema, bookingSourceSchema, guestInputSchema } from "./booking.js";
import {
  emailSchema,
  idSchema,
  instantSchema,
  localDateSchema,
  localeSchema,
  localTimeSchema,
  paginationQuerySchema,
  partySizeSchema,
  phoneSchema,
} from "./common.js";

export const waitlistStatusSchema = z.enum(WAITLIST_STATUSES);

/** A guest queues for a date from the widget. */
export const joinWaitlistInputSchema = z.object({
  serviceDate: localDateSchema,
  partySize: partySizeSchema,
  serviceId: idSchema.nullable().optional(),
  preferredTime: localTimeSchema.nullable().optional(),
  guest: guestInputSchema,
  notes: z.string().trim().max(1000).optional(),
  marketingConsent: z.boolean().default(false),
});
export type JoinWaitlistInput = z.infer<typeof joinWaitlistInputSchema>;

/** Staff add someone who called. */
export const createWaitlistEntryInputSchema = z.object({
  serviceDate: localDateSchema,
  partySize: partySizeSchema,
  serviceId: idSchema.nullable().optional(),
  preferredTime: localTimeSchema.nullable().optional(),
  customer: z.object({
    id: idSchema.optional(),
    name: z.string().trim().min(1).max(120),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    locale: localeSchema.optional(),
  }),
  notes: z.string().trim().max(1000).optional(),
  source: z.enum(["manual", "phone", "walk_in"]).default("phone"),
});
export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntryInputSchema>;

export const waitlistEntryDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  customer: bookingCustomerDtoSchema,
  serviceId: idSchema.nullable(),
  serviceName: z.string().nullable(),
  serviceDate: localDateSchema,
  partySize: z.number().int(),
  preferredTime: localTimeSchema.nullable(),
  notes: z.string().nullable(),
  locale: localeSchema,
  source: bookingSourceSchema,
  status: waitlistStatusSchema,
  offer: z
    .object({
      serviceId: idSchema,
      serviceName: z.string(),
      startsAt: instantSchema,
      expiresAt: instantSchema,
    })
    .nullable(),
  bookingId: idSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type WaitlistEntryDto = z.infer<typeof waitlistEntryDtoSchema>;

/** What the guest sees on their waitlist link. */
export const publicWaitlistEntryDtoSchema = z.object({
  id: idSchema,
  status: waitlistStatusSchema,
  serviceDate: localDateSchema,
  partySize: z.number().int(),
  preferredTime: localTimeSchema.nullable(),
  guestName: z.string(),
  restaurant: z.object({
    name: z.string(),
    slug: z.string(),
    timezone: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  offer: z
    .object({ serviceName: z.string(), startsAt: instantSchema, expiresAt: instantSchema })
    .nullable(),
  /** The offer is still open. */
  canAccept: z.boolean(),
  /** Set once the guest was booked in: the usual manage link. */
  bookingManageUrl: z.string().nullable(),
  manageUrl: z.string(),
});
export type PublicWaitlistEntryDto = z.infer<typeof publicWaitlistEntryDtoSchema>;

export const offerWaitlistInputSchema = z.object({
  serviceId: idSchema,
  startsAt: instantSchema,
});
export type OfferWaitlistInput = z.infer<typeof offerWaitlistInputSchema>;

export const bookWaitlistInputSchema = offerWaitlistInputSchema.extend({
  ignoreCapacity: z.boolean().default(false),
});
export type BookWaitlistInput = z.infer<typeof bookWaitlistInputSchema>;

export const listWaitlistQuerySchema = paginationQuerySchema.extend({
  date: localDateSchema.optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  status: z
    .union([waitlistStatusSchema, z.array(waitlistStatusSchema)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  customerId: idSchema.optional(),
});
export type ListWaitlistQuery = z.infer<typeof listWaitlistQuerySchema>;
