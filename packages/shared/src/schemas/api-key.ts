import { z } from "zod";
import { instantSchema } from "./common.js";

export const apiKeyDtoSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** First characters of the key, for recognising it in lists. */
  start: z.string().nullable(),
  enabled: z.boolean(),
  expiresAt: instantSchema.nullable(),
  lastUsedAt: instantSchema.nullable(),
  requestCount: z.number().int(),
  createdAt: instantSchema,
});
export type ApiKeyDto = z.infer<typeof apiKeyDtoSchema>;

/** Returned once, right after creation: the only time the secret is visible. */
export const createdApiKeyDtoSchema = apiKeyDtoSchema.extend({ key: z.string() });
export type CreatedApiKeyDto = z.infer<typeof createdApiKeyDtoSchema>;

export const createApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;
