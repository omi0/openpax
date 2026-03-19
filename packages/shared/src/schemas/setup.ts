import { z } from "zod";
import { instantSchema } from "./common.js";

/**
 * The setup guide walks a new restaurant through what it needs before going
 * live. Steps are in display order; the dashboard renders one screen per step.
 */
export const SETUP_STEPS = [
  "restaurant",
  "services",
  "rooms",
  "policy",
  "notifications",
  "team",
  "widget",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const setupStepSchema = z.enum(SETUP_STEPS);

export const setupStepStatusSchema = z.object({
  step: setupStepSchema,
  /** Derived from the data where possible, otherwise from the steps the owner went through. */
  done: z.boolean(),
  /** The owner pressed "continue" on this step at least once. */
  reviewed: z.boolean(),
});
export type SetupStepStatusDto = z.infer<typeof setupStepStatusSchema>;

export const setupStatusDtoSchema = z.object({
  steps: z.array(setupStepStatusSchema),
  /** Steps done over steps total, for progress bars. */
  done: z.number().int(),
  total: z.number().int(),
  /** Set once the owner finished the guide; the reminders disappear. */
  completedAt: instantSchema.nullable(),
  /** Facts the guide screens need to explain what is missing. */
  facts: z.object({
    services: z.number().int(),
    rooms: z.number().int(),
    roomsMissingSeats: z.number().int(),
    tables: z.number().int(),
    emailProvider: z.enum(["restaurant", "organization", "instance", "none"]),
    smsProvider: z.enum(["restaurant", "organization", "none"]),
    members: z.number().int(),
    pendingInvitations: z.number().int(),
    restaurantEmail: z.boolean(),
  }),
});
export type SetupStatusDto = z.infer<typeof setupStatusDtoSchema>;

export const updateSetupInputSchema = z.object({
  /** Steps to mark as reviewed (added to the ones already recorded). */
  reviewed: z.array(setupStepSchema).max(SETUP_STEPS.length).optional(),
  /** true marks the guide finished, false reopens it. */
  completed: z.boolean().optional(),
});
export type UpdateSetupInput = z.infer<typeof updateSetupInputSchema>;
