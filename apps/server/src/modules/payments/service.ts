import { booking, bookingPayment, paymentConfig } from "@openpax/db";
import type {
  BookingPaymentDto,
  PaymentConfigDto,
  PaymentKind,
  PublicPaymentDto,
  UpdatePaymentConfigInput,
} from "@openpax/shared";
import { and, eq } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { emitEvent } from "../../events/outbox.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import type { CheckoutState, GatewayConfig } from "../../payments/gateway.js";
import { GatewayError } from "../../payments/gateway.js";
import { applyBookingAction } from "../bookings/index.js";

type ConfigRow = typeof paymentConfig.$inferSelect;
export type PaymentRow = typeof bookingPayment.$inferSelect;

const SYSTEM: Actor = { type: "system", id: null };

// ---------- configuration

export function webhookUrl(ctx: AppContext, restaurantId: string): string {
  return `${ctx.env.PUBLIC_URL}/api/public/v1/payments/stripe/webhook/${restaurantId}`;
}

async function findConfig(ctx: AppContext, restaurantId: string): Promise<ConfigRow | null> {
  const [row] = await ctx.db
    .select()
    .from(paymentConfig)
    .where(eq(paymentConfig.restaurantId, restaurantId))
    .limit(1);
  return row ?? null;
}

function decrypt(ctx: AppContext, value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  return ctx.secrets.isEncrypted(value) ? ctx.secrets.decrypt(value) : value;
}

/** Decrypted gateway credentials, or null when no secret key is stored. */
export function gatewayConfigOf(ctx: AppContext, row: ConfigRow | null): GatewayConfig | null {
  const secretKey = decrypt(ctx, row?.config.secretKey);
  if (!row || !secretKey) return null;
  return { secretKey, webhookSecret: decrypt(ctx, row.config.webhookSecret) };
}

const masked = (value: unknown) => {
  if (typeof value !== "string" || value === "") return { set: false };
  return { set: true, last4: value.slice(-4) };
};

export function toConfigDto(
  ctx: AppContext,
  r: RestaurantRow,
  row: ConfigRow | null,
  connected: boolean,
): PaymentConfigDto {
  return {
    provider: "stripe",
    secretKey: masked(decrypt(ctx, row?.config.secretKey)),
    webhookSecret: masked(decrypt(ctx, row?.config.webhookSecret)),
    webhookUrl: webhookUrl(ctx, r.id),
    connected,
    currency: r.currency,
    mode: row?.mode ?? "off",
    amountCents: row?.amountCents ?? 0,
    minPartySize: row?.minPartySize ?? null,
    paymentWindowMinutes: row?.paymentWindowMinutes ?? 30,
    refundOnCancel: row?.refundOnCancel ?? true,
    chargeNoShow: row?.chargeNoShow ?? true,
  };
}

export async function getConfigDto(ctx: AppContext, r: RestaurantRow): Promise<PaymentConfigDto> {
  const row = await findConfig(ctx, r.id);
  return toConfigDto(ctx, r, row, gatewayConfigOf(ctx, row) !== null);
}

export async function upsertConfig(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdatePaymentConfigInput,
  actor: Actor,
): Promise<PaymentConfigDto> {
  const existing = await findConfig(ctx, r.id);
  const keep = (key: "secretKey" | "webhookSecret") => {
    const fresh = input[key];
    if (fresh !== undefined && fresh !== "") return ctx.secrets.encrypt(fresh);
    return existing?.config[key] ?? null;
  };
  const config = { secretKey: keep("secretKey"), webhookSecret: keep("webhookSecret") };
  if (input.mode !== "off" && !config.secretKey)
    throw ApiError.badRequest("secret_key_required", "Add your Stripe secret key first");
  if (input.mode !== "off" && input.amountCents <= 0)
    throw ApiError.badRequest("amount_required", "Set an amount per guest");
  const values = {
    restaurantId: r.id,
    provider: "stripe",
    config,
    mode: input.mode,
    amountCents: input.amountCents,
    minPartySize: input.minPartySize,
    paymentWindowMinutes: input.paymentWindowMinutes,
    refundOnCancel: input.refundOnCancel,
    chargeNoShow: input.chargeNoShow,
    updatedByUserId: actor.type === "user" ? actor.id : null,
  };
  const [row] = await ctx.db
    .insert(paymentConfig)
    .values(values)
    .onConflictDoUpdate({ target: paymentConfig.restaurantId, set: values })
    .returning();
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "payments.config_updated",
    entityType: "payment_config",
    entityId: r.id,
    data: { mode: input.mode, amountCents: input.amountCents },
  });
  return toConfigDto(ctx, r, row ?? null, gatewayConfigOf(ctx, row ?? null) !== null);
}

export async function testConnection(ctx: AppContext, r: RestaurantRow): Promise<void> {
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, r.id));
  if (!gw) throw ApiError.badRequest("no_secret_key", "No Stripe secret key is configured");
  try {
    await ctx.payments.verify(gw);
  } catch (error) {
    throw new ApiError(
      502,
      "gateway_error",
      error instanceof Error ? error.message : "Stripe rejected the key",
    );
  }
}

// ---------- requirement and checkout

export interface PaymentRequirement {
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  windowMinutes: number;
}

/** Whether an online booking of this size must pay or save a card first. */
export async function requirementFor(
  ctx: AppContext,
  r: RestaurantRow,
  p: { partySize: number; source: string },
): Promise<PaymentRequirement | null> {
  if (p.source !== "widget") return null;
  const row = await findConfig(ctx, r.id);
  if (!row || row.mode === "off" || !gatewayConfigOf(ctx, row)) return null;
  if (row.minPartySize !== null && p.partySize < row.minPartySize) return null;
  const amountCents = row.amountCents * p.partySize;
  if (amountCents <= 0) return null;
  return {
    kind: row.mode,
    amountCents,
    currency: r.currency,
    windowMinutes: row.paymentWindowMinutes,
  };
}

export function formatAmount(amountCents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

/**
 * Create the gateway checkout for a freshly created (pending) booking. Runs
 * after the booking transaction committed; a gateway failure cancels the
 * booking again so the guest can retry.
 */
export async function startCheckout(
  ctx: AppContext,
  r: RestaurantRow,
  b: { id: string; startsAt: Date; partySize: number; manageToken: string; locale: string },
  guest: { name: string; email: string | null },
  req: PaymentRequirement,
): Promise<PaymentRow> {
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, r.id));
  if (!gw) throw new ApiError(503, "payment_unavailable", "Payments are not configured");
  const expiresAt = new Date(ctx.now().getTime() + req.windowMinutes * 60_000);
  const [row] = await ctx.db
    .insert(bookingPayment)
    .values({
      restaurantId: r.id,
      bookingId: b.id,
      provider: ctx.payments.id,
      kind: req.kind,
      amountCents: req.amountCents,
      currency: req.currency,
      expiresAt,
    })
    .returning();
  if (!row) throw new Error("payment insert failed");
  const manage = `${ctx.env.PUBLIC_URL}/book/${r.slug}/manage/${b.manageToken}`;
  const isIt = b.locale === "it";
  try {
    const session = await ctx.payments.createCheckout(gw, {
      mode: req.kind === "deposit" ? "payment" : "setup",
      amountCents: req.amountCents,
      currency: req.currency,
      description: isIt
        ? `${req.kind === "deposit" ? "Caparra" : "Garanzia"} prenotazione ${r.name}, ${b.partySize} persone`
        : `${req.kind === "deposit" ? "Deposit" : "Card guarantee"} for ${r.name}, ${b.partySize} guests`,
      customerEmail: guest.email,
      customerName: guest.name,
      successUrl: `${manage}?payment=success`,
      cancelUrl: `${manage}?payment=cancelled`,
      expiresAt,
      metadata: { bookingId: b.id, paymentId: row.id, restaurantId: r.id },
    });
    const [updated] = await ctx.db
      .update(bookingPayment)
      .set({
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
        expiresAt: session.expiresAt,
      })
      .where(eq(bookingPayment.id, row.id))
      .returning();
    await ctx.jobs.send(
      "payment.expire",
      { paymentId: row.id },
      {
        startAfter: new Date(session.expiresAt.getTime() + 60_000),
        singletonKey: `payment:${row.id}`,
      },
    );
    return updated ?? row;
  } catch (error) {
    await ctx.db
      .update(bookingPayment)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(eq(bookingPayment.id, row.id));
    throw new ApiError(
      502,
      "payment_unavailable",
      error instanceof GatewayError ? error.message : "Could not start the payment",
    );
  }
}

// ---------- state changes

export async function getPaymentForBooking(
  ctx: AppContext,
  bookingId: string,
): Promise<PaymentRow | null> {
  const [row] = await ctx.db
    .select()
    .from(bookingPayment)
    .where(eq(bookingPayment.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

async function loadRestaurantOf(ctx: AppContext, row: PaymentRow): Promise<RestaurantRow> {
  return findRestaurantById(ctx, row.restaurantId);
}

/** The guest paid / saved a card: record it and confirm the booking. */
export async function markCompleted(
  ctx: AppContext,
  paymentId: string,
  state: CheckoutState,
): Promise<PaymentRow | null> {
  const updated = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bookingPayment)
      .where(eq(bookingPayment.id, paymentId))
      .for("update");
    if (row?.status !== "pending") return null;
    const [next] = await tx
      .update(bookingPayment)
      .set({
        status: row.kind === "deposit" ? "paid" : "card_saved",
        paymentIntentId: state.paymentIntentId,
        setupIntentId: state.setupIntentId,
        gatewayCustomerId: state.customerId,
        paymentMethodId: state.paymentMethodId,
        paidAt: ctx.now(),
        checkoutUrl: null,
        error: null,
      })
      .where(eq(bookingPayment.id, row.id))
      .returning();
    await emitEvent(tx, {
      type: "payment.completed",
      restaurantId: row.restaurantId,
      aggregateType: "booking",
      aggregateId: row.bookingId,
      payload: { bookingId: row.bookingId, paymentId: row.id, kind: row.kind },
    });
    await writeAudit(tx, {
      restaurantId: row.restaurantId,
      actor: SYSTEM,
      action: "payment.completed",
      entityType: "booking",
      entityId: row.bookingId,
      data: { kind: row.kind, amountCents: row.amountCents },
    });
    return next ?? row;
  });
  if (!updated) return null;
  // the booking was held as pending for this payment: confirm it now
  const [b] = await ctx.db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, updated.bookingId))
    .limit(1);
  if (b?.status === "pending") {
    await applyBookingAction(ctx, await loadRestaurantOf(ctx, updated), {
      bookingId: updated.bookingId,
      action: "confirm",
      actor: SYSTEM,
    });
  }
  return updated;
}

/** The window closed without a payment: drop the booking. */
export async function expirePayment(ctx: AppContext, paymentId: string): Promise<void> {
  const row = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(bookingPayment)
      .where(eq(bookingPayment.id, paymentId))
      .for("update");
    if (row?.status !== "pending") return null;
    await tx
      .update(bookingPayment)
      .set({ status: "expired", checkoutUrl: null })
      .where(eq(bookingPayment.id, row.id));
    await emitEvent(tx, {
      type: "payment.expired",
      restaurantId: row.restaurantId,
      aggregateType: "booking",
      aggregateId: row.bookingId,
      payload: { bookingId: row.bookingId, paymentId: row.id },
    });
    return row;
  });
  if (!row) return;
  const r = await loadRestaurantOf(ctx, row);
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, r.id));
  if (gw && row.checkoutSessionId) {
    await ctx.payments.expireCheckout(gw, row.checkoutSessionId).catch(() => undefined);
  }
  const [b] = await ctx.db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, row.bookingId))
    .limit(1);
  if (b?.status === "pending") {
    await applyBookingAction(ctx, r, {
      bookingId: row.bookingId,
      action: "cancel",
      actor: SYSTEM,
      reason: r.locale === "it" ? "Caparra non pagata in tempo" : "Deposit not paid in time",
    });
  }
}

/** Ask the gateway how a pending checkout ended, and settle it. */
export async function syncPayment(ctx: AppContext, row: PaymentRow): Promise<PaymentRow | null> {
  if (row.status !== "pending" || !row.checkoutSessionId) return row;
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, row.restaurantId));
  if (!gw) return row;
  let state: CheckoutState;
  try {
    state = await ctx.payments.retrieveCheckout(gw, row.checkoutSessionId);
  } catch (error) {
    ctx.logger.warn({ err: error, paymentId: row.id }, "could not sync payment");
    return row;
  }
  if (state.status === "complete" && (row.kind === "card_hold" || state.paid)) {
    return (await markCompleted(ctx, row.id, state)) ?? row;
  }
  if (state.status === "expired") {
    await expirePayment(ctx, row.id);
    return getPaymentForBooking(ctx, row.bookingId);
  }
  return row;
}

/** Called when a guest looks at their booking: settles a checkout the webhook may have missed. */
export async function syncPendingForBooking(ctx: AppContext, bookingId: string): Promise<void> {
  const row = await getPaymentForBooking(ctx, bookingId);
  if (row?.status === "pending") await syncPayment(ctx, row);
}

export async function refundPayment(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  actor: Actor,
): Promise<PaymentRow> {
  const row = await getPaymentForBooking(ctx, bookingId);
  if (!row || row.restaurantId !== r.id) throw ApiError.notFound("Payment");
  if (row.status !== "paid" || !row.paymentIntentId)
    throw ApiError.conflict("not_refundable", `Payment is ${row.status}`);
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, r.id));
  if (!gw) throw new ApiError(503, "payment_unavailable", "Payments are not configured");
  let refundId: string;
  try {
    ({ refundId } = await ctx.payments.refund(gw, row.paymentIntentId));
  } catch (error) {
    throw new ApiError(
      502,
      "gateway_error",
      error instanceof Error ? error.message : "Refund failed",
    );
  }
  const [updated] = await ctx.db
    .update(bookingPayment)
    .set({ status: "refunded", refundId, refundedAt: ctx.now() })
    .where(eq(bookingPayment.id, row.id))
    .returning();
  await emitEvent(ctx.db, {
    type: "payment.refunded",
    restaurantId: r.id,
    aggregateType: "booking",
    aggregateId: bookingId,
    payload: { bookingId, paymentId: row.id, amountCents: row.amountCents },
  });
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "payment.refunded",
    entityType: "booking",
    entityId: bookingId,
    data: { amountCents: row.amountCents, refundId },
  });
  return updated ?? row;
}

export async function chargeNoShowFee(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  actor: Actor,
): Promise<PaymentRow> {
  const row = await getPaymentForBooking(ctx, bookingId);
  if (!row || row.restaurantId !== r.id) throw ApiError.notFound("Payment");
  if (row.status !== "card_saved" || !row.gatewayCustomerId || !row.paymentMethodId)
    throw ApiError.conflict("not_chargeable", `Payment is ${row.status}`);
  const gw = gatewayConfigOf(ctx, await findConfig(ctx, r.id));
  if (!gw) throw new ApiError(503, "payment_unavailable", "Payments are not configured");
  const result = await ctx.payments.chargeOffSession(gw, {
    customerId: row.gatewayCustomerId,
    paymentMethodId: row.paymentMethodId,
    amountCents: row.amountCents,
    currency: row.currency,
    description: r.locale === "it" ? `Penale no-show ${r.name}` : `No-show fee ${r.name}`,
    metadata: { bookingId, paymentId: row.id, restaurantId: r.id },
  });
  const [updated] = await ctx.db
    .update(bookingPayment)
    .set({
      status: result.succeeded ? "charged" : "failed",
      paymentIntentId: result.paymentIntentId || row.paymentIntentId,
      chargedAt: result.succeeded ? ctx.now() : null,
      error: result.error,
    })
    .where(eq(bookingPayment.id, row.id))
    .returning();
  await emitEvent(ctx.db, {
    type: "payment.charged",
    restaurantId: r.id,
    aggregateType: "booking",
    aggregateId: bookingId,
    payload: {
      bookingId,
      paymentId: row.id,
      amountCents: row.amountCents,
      succeeded: result.succeeded,
    },
  });
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "payment.charged",
    entityType: "booking",
    entityId: bookingId,
    data: { amountCents: row.amountCents, succeeded: result.succeeded, error: result.error },
  });
  return updated ?? row;
}

// ---------- webhooks

export async function handleWebhook(
  ctx: AppContext,
  restaurantId: string,
  rawBody: string,
  signature: string | null,
): Promise<{ handled: boolean }> {
  const config = await findConfig(ctx, restaurantId);
  const gw = gatewayConfigOf(ctx, config);
  if (!gw) throw ApiError.notFound("Payment configuration");
  let event: ReturnType<typeof ctx.payments.parseWebhook>;
  try {
    event = ctx.payments.parseWebhook(gw, rawBody, signature);
  } catch (error) {
    throw ApiError.badRequest(
      "bad_signature",
      error instanceof Error ? error.message : "Invalid webhook signature",
    );
  }
  const sessionId = typeof event.object.id === "string" ? event.object.id : null;
  if (!sessionId || !event.type.startsWith("checkout.session.")) return { handled: false };
  const [row] = await ctx.db
    .select()
    .from(bookingPayment)
    .where(
      and(
        eq(bookingPayment.restaurantId, restaurantId),
        eq(bookingPayment.checkoutSessionId, sessionId),
      ),
    )
    .limit(1);
  if (!row) return { handled: false };
  if (event.type === "checkout.session.expired") {
    await expirePayment(ctx, row.id);
    return { handled: true };
  }
  await syncPayment(ctx, row);
  return { handled: true };
}

// ---------- DTOs

export function toPaymentDto(row: PaymentRow): BookingPaymentDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    kind: row.kind,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    checkoutUrl: row.status === "pending" ? row.checkoutUrl : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    chargedAt: row.chargedAt?.toISOString() ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPublicPaymentDto(row: PaymentRow): PublicPaymentDto {
  return {
    kind: row.kind,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    checkoutUrl: row.status === "pending" ? row.checkoutUrl : null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

/** Guest-facing helper used by the notifications module. */
export async function paymentVarsFor(
  ctx: AppContext,
  bookingId: string,
  locale: string,
): Promise<{ paymentUrl: string; depositAmount: string }> {
  const row = await getPaymentForBooking(ctx, bookingId);
  if (!row) return { paymentUrl: "", depositAmount: "" };
  return {
    paymentUrl: row.status === "pending" ? (row.checkoutUrl ?? "") : "",
    depositAmount: formatAmount(row.amountCents, row.currency, locale),
  };
}
