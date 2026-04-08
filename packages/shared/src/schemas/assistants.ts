import { z } from "zod";
import { instantSchema } from "./common.js";

/** An assistant (Claude, ChatGPT, an MCP client) the current user has connected. */
export const assistantConnectionDtoSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string().nullable(),
  clientUri: z.string().nullable(),
  /** false = the connection was granted read access only. */
  canWrite: z.boolean(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export type AssistantConnectionDto = z.infer<typeof assistantConnectionDtoSchema>;

export const assistantsStatusDtoSchema = z.object({
  /** false when the instance is served over plain HTTP (MCP needs HTTPS). */
  enabled: z.boolean(),
  /** The address to paste into the assistant; null when disabled. */
  url: z.string().nullable(),
  connections: z.array(assistantConnectionDtoSchema),
});
export type AssistantsStatusDto = z.infer<typeof assistantsStatusDtoSchema>;
