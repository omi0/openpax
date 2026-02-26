import { z } from "zod";
import { bookingStatusSchema } from "./booking.js";
import { localDateSchema } from "./common.js";

/** Filters of a bookings CSV export (the same ones as the bookings list, no paging). */
export const exportBookingsQuerySchema = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  status: z
    .union([bookingStatusSchema, z.array(bookingStatusSchema)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  search: z.string().trim().max(100).optional(),
});
export type ExportBookingsQuery = z.infer<typeof exportBookingsQuerySchema>;

export const exportCustomersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
});
export type ExportCustomersQuery = z.infer<typeof exportCustomersQuerySchema>;

export const importQuerySchema = z.object({
  /** "1"/"true": validate and count, write nothing. */
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const importResultDtoSchema = z.object({
  total: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  dryRun: z.boolean(),
  /** Line numbers count the header as line 1. */
  errors: z.array(z.object({ line: z.number().int(), message: z.string() })).max(200),
});
export type ImportResultDto = z.infer<typeof importResultDtoSchema>;

export const BOOKING_CSV_COLUMNS = [
  "date",
  "time",
  "guests",
  "name",
  "email",
  "phone",
  "service",
  "status",
  "source",
  "code",
  "tables",
  "notes",
  "created_at",
] as const;

export const CUSTOMER_CSV_COLUMNS = [
  "name",
  "email",
  "phone",
  "locale",
  "tags",
  "notes",
  "visits",
  "no_shows",
  "marketing_consent",
  "last_visit",
  "created_at",
] as const;
