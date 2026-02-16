import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type CheckoutParams,
  type CheckoutSession,
  type CheckoutState,
  type GatewayConfig,
  GatewayError,
  type OffSessionCharge,
  type PaymentGateway,
  type WebhookEvent,
} from "./gateway.js";

const API = "https://api.stripe.com/v1";
const API_VERSION = "2025-08-27.basil";

/** Nested objects become Stripe's bracket notation: line_items[0][price_data][currency]=eur */
function encode(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === "object" && v !== null)
          out.push(...encode(v as Record<string, unknown>, `${name}[${i}]`));
        else out.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
    } else if (typeof value === "object") {
      out.push(...encode(value as Record<string, unknown>, name));
    } else {
      out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return out;
}

async function call<T>(
  config: GatewayConfig,
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.secretKey}`,
      "stripe-version": API_VERSION,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    ...(method === "POST" && params ? { body: encode(params).join("&") } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; type?: string };
  };
  if (!res.ok) {
    throw new GatewayError(
      body.error?.message ?? `Stripe returned ${res.status}`,
      body.error?.code ?? body.error?.type ?? "stripe_error",
    );
  }
  return body as T;
}

interface StripeSession {
  id: string;
  url: string | null;
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  expires_at: number;
  payment_intent: string | { id: string; payment_method?: string | { id: string } } | null;
  setup_intent: string | { id: string; payment_method?: string | { id: string } } | null;
  customer: string | { id: string } | null;
}

const idOf = (v: string | { id: string } | null | undefined): string | null =>
  v === null || v === undefined ? null : typeof v === "string" ? v : v.id;

export const stripeGateway: PaymentGateway = {
  id: "stripe",

  async verify(config) {
    await call(config, "GET", "/balance");
  },

  async createCheckout(config, p: CheckoutParams): Promise<CheckoutSession> {
    const session = await call<StripeSession>(
      config,
      "POST",
      "/checkout/sessions",
      {
        mode: p.mode,
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        expires_at: Math.floor(p.expiresAt.getTime() / 1000),
        ...(p.customerEmail ? { customer_email: p.customerEmail } : {}),
        // a customer object lets us charge the saved card later
        customer_creation: p.mode === "payment" ? "always" : undefined,
        metadata: p.metadata,
        ...(p.mode === "payment"
          ? {
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: p.currency.toLowerCase(),
                    unit_amount: p.amountCents,
                    product_data: { name: p.description },
                  },
                },
              ],
              payment_intent_data: { description: p.description, metadata: p.metadata },
            }
          : {
              setup_intent_data: { description: p.description, metadata: p.metadata },
            }),
      },
      `checkout:${p.metadata.bookingId ?? ""}:${p.mode}`,
    );
    if (!session.url) throw new GatewayError("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000) };
  },

  async retrieveCheckout(config, sessionId): Promise<CheckoutState> {
    const s = await call<StripeSession>(
      config,
      "GET",
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent&expand[]=setup_intent`,
    );
    const intent =
      (typeof s.payment_intent === "object" ? s.payment_intent : null) ??
      (typeof s.setup_intent === "object" ? s.setup_intent : null);
    return {
      status: s.status,
      paid: s.payment_status === "paid" || s.payment_status === "no_payment_required",
      paymentIntentId: idOf(s.payment_intent),
      setupIntentId: idOf(s.setup_intent),
      customerId: idOf(s.customer),
      paymentMethodId: idOf(intent?.payment_method ?? null),
    };
  },

  async expireCheckout(config, sessionId) {
    await call(config, "POST", `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`);
  },

  async refund(config, paymentIntentId) {
    const refund = await call<{ id: string }>(
      config,
      "POST",
      "/refunds",
      { payment_intent: paymentIntentId },
      `refund:${paymentIntentId}`,
    );
    return { refundId: refund.id };
  },

  async chargeOffSession(config, c: OffSessionCharge) {
    try {
      const intent = await call<{ id: string; status: string }>(
        config,
        "POST",
        "/payment_intents",
        {
          amount: c.amountCents,
          currency: c.currency.toLowerCase(),
          customer: c.customerId,
          payment_method: c.paymentMethodId,
          off_session: true,
          confirm: true,
          description: c.description,
          metadata: c.metadata,
        },
        `no_show:${c.metadata.bookingId ?? ""}`,
      );
      return {
        paymentIntentId: intent.id,
        succeeded: intent.status === "succeeded",
        error: intent.status === "succeeded" ? null : `Payment intent ${intent.status}`,
      };
    } catch (error) {
      if (error instanceof GatewayError)
        return { paymentIntentId: "", succeeded: false, error: error.message };
      throw error;
    }
  },

  parseWebhook(config, rawBody, signature): WebhookEvent {
    if (!config.webhookSecret) throw new GatewayError("Webhook secret not configured", "no_secret");
    if (!signature) throw new GatewayError("Missing Stripe-Signature header", "bad_signature");
    const parts = Object.fromEntries(
      signature.split(",").map((kv) => {
        const [k, ...rest] = kv.split("=");
        return [k, rest.join("=")];
      }),
    );
    const timestamp = parts.t;
    const expected = parts.v1;
    if (!timestamp || !expected) throw new GatewayError("Malformed signature", "bad_signature");
    const digest = createHmac("sha256", config.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(digest);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      throw new GatewayError("Invalid signature", "bad_signature");
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
      throw new GatewayError("Signature too old", "bad_signature");
    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    return { id: event.id, type: event.type, object: event.data.object };
  },
};
