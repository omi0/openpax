import { z } from "zod";
import { bookingCustomerDtoSchema } from "./booking.js";
import { idSchema, instantSchema, localDateSchema, paginationQuerySchema } from "./common.js";

export const ratingSchema = z.number().int().min(1).max(5);

export const submitFeedbackInputSchema = z.object({
  rating: ratingSchema,
  comment: z.string().trim().max(2000).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackInputSchema>;

export const feedbackDtoSchema = z.object({
  id: idSchema,
  bookingId: idSchema,
  customer: bookingCustomerDtoSchema,
  serviceDate: localDateSchema,
  startsAt: instantSchema,
  partySize: z.number().int(),
  serviceName: z.string(),
  rating: ratingSchema,
  comment: z.string().nullable(),
  createdAt: instantSchema,
});
export type FeedbackDto = z.infer<typeof feedbackDtoSchema>;

/** The guest's feedback page: the visit and what they already answered, if anything. */
export const publicFeedbackDtoSchema = z.object({
  restaurant: z.object({ name: z.string(), slug: z.string(), timezone: z.string() }),
  booking: z.object({
    startsAt: instantSchema,
    partySize: z.number().int(),
    serviceName: z.string(),
    guestName: z.string(),
  }),
  /** False for bookings that were cancelled or a no-show. */
  canAnswer: z.boolean(),
  feedback: z.object({ rating: ratingSchema, comment: z.string().nullable() }).nullable(),
});
export type PublicFeedbackDto = z.infer<typeof publicFeedbackDtoSchema>;

export const listFeedbackQuerySchema = paginationQuerySchema.extend({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  rating: z.coerce.number().pipe(ratingSchema).optional(),
  customerId: idSchema.optional(),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

export const feedbackSummaryDtoSchema = z.object({
  responses: z.number().int(),
  averageRating: z.number().nullable(),
  /** Count per star, index 0 = 1 star. */
  distribution: z.array(z.number().int()).length(5),
});
export type FeedbackSummaryDto = z.infer<typeof feedbackSummaryDtoSchema>;
