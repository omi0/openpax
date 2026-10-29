import { z } from "zod";
import { idSchema } from "./common.js";

export const operatorPinSchema = z.string().regex(/^\d{6}$/, "The code has 6 digits");

export const operatorDtoSchema = z.object({ id: idSchema, name: z.string() });
export type OperatorDto = z.infer<typeof operatorDtoSchema>;

export const createOperatorInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  pin: operatorPinSchema,
});
export type CreateOperatorInput = z.infer<typeof createOperatorInputSchema>;

export const updateOperatorInputSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  pin: operatorPinSchema.optional(),
});
export type UpdateOperatorInput = z.infer<typeof updateOperatorInputSchema>;

export const verifyOperatorInputSchema = z.object({ pin: operatorPinSchema });

/** Who is at the dashboard: their operator id and the PIN they just typed. */
export const operatorProofSchema = z.object({ id: idSchema, pin: operatorPinSchema });
export type OperatorProof = z.infer<typeof operatorProofSchema>;
