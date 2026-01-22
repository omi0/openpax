import { BOOKING_SOURCES } from "@sitli/core";
import { z } from "zod";
import { idSchema, localDateSchema } from "./common.js";
import { weekdaySchema } from "./weekly-hours.js";

export const analyticsQuerySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const counts = {
  /** Bookings that were not cancelled. */
  bookings: z.number().int(),
  /** Party sizes of those bookings. */
  covers: z.number().int(),
  cancelled: z.number().int(),
  noShows: z.number().int(),
};

export const analyticsDayDtoSchema = z.object({
  date: localDateSchema,
  ...counts,
  /** Covers the restaurant could have seated that day; null when no service has a limit. */
  capacity: z.number().int().nullable(),
});

export const analyticsDtoSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  totals: z.object({
    ...counts,
    /** Bookings ever created for the range, any status. */
    created: z.number().int(),
    averagePartySize: z.number().nullable(),
    /** Share of non-cancelled bookings on past dates that did not show up. */
    noShowRate: z.number().nullable(),
    cancellationRate: z.number().nullable(),
    capacity: z.number().int().nullable(),
    /** covers / capacity over days where capacity is known. */
    occupancy: z.number().nullable(),
  }),
  days: z.array(analyticsDayDtoSchema),
  services: z.array(
    z.object({
      serviceId: idSchema,
      name: z.string(),
      ...counts,
      capacity: z.number().int().nullable(),
    }),
  ),
  sources: z.array(z.object({ source: z.enum(BOOKING_SOURCES), ...counts })),
  weekdays: z.array(
    z.object({ weekday: weekdaySchema, bookings: z.number().int(), covers: z.number().int() }),
  ),
});
export type AnalyticsDto = z.infer<typeof analyticsDtoSchema>;
export type BookingSourceSchemaType = (typeof BOOKING_SOURCES)[number];
