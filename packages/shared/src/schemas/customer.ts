import { z } from "zod";
import {
  emailSchema,
  idSchema,
  instantSchema,
  localeSchema,
  paginationQuerySchema,
  phoneSchema,
} from "./common.js";

export const customerDtoSchema = z.object({
  id: idSchema,
  restaurantId: idSchema,
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  locale: localeSchema.nullable(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  visitCount: z.number().int(),
  noShowCount: z.number().int(),
  marketingConsent: z.boolean(),
  lastVisitAt: instantSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type CustomerDto = z.infer<typeof customerDtoSchema>;

export const updateCustomerInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  locale: localeSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  marketingConsent: z.boolean().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});
