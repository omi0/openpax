import { z } from "zod";
import { idSchema, instantSchema } from "./common.js";
import { maskedSecretSchema } from "./notifications.js";

/** off = no payments; deposit = pay per guest up front; card_hold = save a card, charge on no-show. */
export const PAYMENT_MODES = ["off", "deposit", "card_hold"] as const;
export const paymentModeSchema = z.enum(PAYMENT_MODES);
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_KINDS = ["deposit", "card_hold"] as const;
export const paymentKindSchema = z.enum(PAYMENT_KINDS);
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "card_saved",
  "refunded",
  "charged",
  "failed",
  "expired",
  "cancelled",
] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Settings → Payments. Secrets are write-only: omitted keys keep their stored value. */
export const updatePaymentConfigInputSchema = z.object({
  secretKey: z.string().trim().max(200).optional(),
  webhookSecret: z.string().trim().max(200).optional(),
  mode: paymentModeSchema,
  /** Per guest, in the restaurant currency's minor unit (cents). */
  amountCents: z.number().int().min(0).max(1_000_000),
  /** Only ask parties of at least this size; null = everyone. */
  minPartySize: z.number().int().min(1).max(100).nullable(),
  /** Deposits: minutes the guest has to pay before the booking lapses. */
  paymentWindowMinutes: z
    .number()
    .int()
    .min(10)
    .max(24 * 60),
  /** Deposits: refund automatically when the booking is cancelled before the cutoff. */
  refundOnCancel: z.boolean(),
  /** Card hold: charge the fee automatically when a booking is marked no-show. */
  chargeNoShow: z.boolean(),
});
export type UpdatePaymentConfigInput = z.infer<typeof updatePaymentConfigInputSchema>;

export const paymentConfigDtoSchema = updatePaymentConfigInputSchema
  .omit({ secretKey: true, webhookSecret: true })
  .extend({
    provider: z.literal("stripe"),
    secretKey: maskedSecretSchema,
    webhookSecret: maskedSecretSchema,
    /** Where Stripe should send events for this restaurant. */
    webhookUrl: z.string(),
    /** Keys present and the account reachable at the last check. */
    connected: z.boolean(),
    currency: z.string(),
  });
export type PaymentConfigDto = z.infer<typeof paymentConfigDtoSchema>;

export const bookingPaymentDtoSchema = z.object({
  id: idSchema,
  bookingId: idSchema,
  kind: paymentKindSchema,
  status: paymentStatusSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  /** Open while the guest still has to pay or save a card. */
  checkoutUrl: z.string().nullable(),
  expiresAt: instantSchema.nullable(),
  paidAt: instantSchema.nullable(),
  refundedAt: instantSchema.nullable(),
  chargedAt: instantSchema.nullable(),
  error: z.string().nullable(),
  createdAt: instantSchema,
});
export type BookingPaymentDto = z.infer<typeof bookingPaymentDtoSchema>;

/** What the guest sees: enough to pay or to know it is settled. */
export const publicPaymentDtoSchema = bookingPaymentDtoSchema.pick({
  kind: true,
  status: true,
  amountCents: true,
  currency: true,
  checkoutUrl: true,
  expiresAt: true,
});
export type PublicPaymentDto = z.infer<typeof publicPaymentDtoSchema>;
