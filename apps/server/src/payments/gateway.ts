/**
 * Payment gateway abstraction. Only Stripe ships, but the payments module
 * never talks to Stripe directly, so tests plug in a fake and another
 * processor can be added as one file.
 */

export interface GatewayConfig {
  secretKey: string;
  webhookSecret: string | null;
}

export interface CheckoutParams {
  /** "payment" collects a deposit now, "setup" saves a card for later. */
  mode: "payment" | "setup";
  amountCents: number;
  currency: string;
  description: string;
  customerEmail: string | null;
  customerName: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface CheckoutState {
  status: "open" | "complete" | "expired";
  /** Deposits: whether the money is in. */
  paid: boolean;
  paymentIntentId: string | null;
  setupIntentId: string | null;
  customerId: string | null;
  paymentMethodId: string | null;
}

export interface OffSessionCharge {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency: string;
  description: string;
  metadata: Record<string, string>;
}

export interface WebhookEvent {
  id: string;
  type: string;
  /** The object inside `data.object`, as sent by the gateway. */
  object: Record<string, unknown>;
}

export interface PaymentGateway {
  id: string;
  /** Cheap authenticated call that proves the secret key works. */
  verify(config: GatewayConfig): Promise<void>;
  createCheckout(config: GatewayConfig, params: CheckoutParams): Promise<CheckoutSession>;
  retrieveCheckout(config: GatewayConfig, sessionId: string): Promise<CheckoutState>;
  expireCheckout(config: GatewayConfig, sessionId: string): Promise<void>;
  refund(config: GatewayConfig, paymentIntentId: string): Promise<{ refundId: string }>;
  chargeOffSession(
    config: GatewayConfig,
    charge: OffSessionCharge,
  ): Promise<{ paymentIntentId: string; succeeded: boolean; error: string | null }>;
  /** Throws when the signature does not match. */
  parseWebhook(config: GatewayConfig, rawBody: string, signature: string | null): WebhookEvent;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly code = "gateway_error",
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
