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

export const analyticsTotalsDtoSchema = z.object({
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
});
export type AnalyticsTotalsDto = z.infer<typeof analyticsTotalsDtoSchema>;

/** How far ahead guests book, from creation to arrival. Keys are the bucket upper bounds. */
export const LEAD_TIME_BUCKETS = ["1h", "6h", "24h", "3d", "7d", "14d", "30d", "30d+"] as const;
export const leadTimeBucketSchema = z.enum(LEAD_TIME_BUCKETS);
export type LeadTimeBucket = (typeof LEAD_TIME_BUCKETS)[number];

export const analyticsDtoSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  totals: analyticsTotalsDtoSchema,
  /** The same totals for the period of equal length that ends the day before `from`. */
  previous: z.object({
    from: localDateSchema,
    to: localDateSchema,
    totals: analyticsTotalsDtoSchema,
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
  /** Non-cancelled bookings by party size, ascending. */
  partySizes: z.array(
    z.object({ partySize: z.number().int(), bookings: z.number().int(), covers: z.number().int() }),
  ),
  leadTime: z.object({
    buckets: z.array(z.object({ bucket: leadTimeBucketSchema, bookings: z.number().int() })),
    medianHours: z.number().nullable(),
    averageHours: z.number().nullable(),
  }),
});
export type AnalyticsDto = z.infer<typeof analyticsDtoSchema>;
export type BookingSourceSchemaType = (typeof BOOKING_SOURCES)[number];
