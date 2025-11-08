import { isValidTimeZone } from "@sitli/core";
import { z } from "zod";

export const SUPPORTED_LOCALES = ["it", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const MEMBER_ROLES = ["owner", "manager", "staff"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const idSchema = z.uuid();
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");
export const timezoneSchema = z.string().refine(isValidTimeZone, "Unknown IANA timezone");
export const localDateSchema = z.iso.date();
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
export const instantSchema = z.iso.datetime({ offset: true });
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export const partySizeSchema = z.number().int().min(1).max(100);
export const emailSchema = z.email().max(254);
/** Loosely validated here; normalised to E.164 on the server. */
export const phoneSchema = z.string().trim().min(5).max(30);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB colour");
export const currencySchema = z.string().length(3).toUpperCase();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
