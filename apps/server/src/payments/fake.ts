import { randomUUID } from "node:crypto";
import {
  type CheckoutParams,
  type CheckoutState,
  type GatewayConfig,
  GatewayError,
  type PaymentGateway,
} from "./gateway.js";

interface FakeSession {
  id: string;
  params: CheckoutParams;
  state: CheckoutState;
}

/**
 * In-memory gateway for tests: sessions are completed by the test, webhooks
 * are accepted when the signature is "test".
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly id = "fake";
  readonly sessions = new Map<string, FakeSession>();
  readonly refunds: string[] = [];
  readonly charges: Array<{ customerId: string; amountCents: number; succeeded: boolean }> = [];
  /** Flip to make the next off-session charge fail. */
  failNextCharge = false;

  async verify(config: GatewayConfig) {
    if (!config.secretKey.startsWith("sk_test")) throw new GatewayError("Invalid API key");
  }

  async createCheckout(_config: GatewayConfig, params: CheckoutParams) {
    const id = `cs_${randomUUID().slice(0, 8)}`;
    this.sessions.set(id, {
      id,
      params,
      state: {
        status: "open",
        paid: false,
        paymentIntentId: null,
        setupIntentId: null,
        customerId: null,
        paymentMethodId: null,
      },
    });
    return { id, url: `https://checkout.example/${id}`, expiresAt: params.expiresAt };
  }

  /** Test helper: the guest paid (or saved a card). */
  complete(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`unknown session ${sessionId}`);
    s.state = {
      status: "complete",
      paid: s.params.mode === "payment",
      paymentIntentId: s.params.mode === "payment" ? `pi_${sessionId}` : null,
      setupIntentId: s.params.mode === "setup" ? `seti_${sessionId}` : null,
      customerId: `cus_${sessionId}`,
      paymentMethodId: `pm_${sessionId}`,
    };
  }

  async retrieveCheckout(_config: GatewayConfig, sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new GatewayError("No such session", "resource_missing");
    return s.state;
  }

  async expireCheckout(_config: GatewayConfig, sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (s && s.state.status === "open") s.state = { ...s.state, status: "expired" };
  }

  async refund(_config: GatewayConfig, paymentIntentId: string) {
    this.refunds.push(paymentIntentId);
    return { refundId: `re_${paymentIntentId}` };
  }

  async chargeOffSession(
    _config: GatewayConfig,
    charge: { customerId: string; amountCents: number },
  ) {
    const succeeded = !this.failNextCharge;
    this.failNextCharge = false;
    this.charges.push({
      customerId: charge.customerId,
      amountCents: charge.amountCents,
      succeeded,
    });
    return {
      paymentIntentId: `pi_charge_${this.charges.length}`,
      succeeded,
      error: succeeded ? null : "Your card was declined.",
    };
  }

  parseWebhook(_config: GatewayConfig, rawBody: string, signature: string | null) {
    if (signature !== "test") throw new GatewayError("Invalid signature", "bad_signature");
    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    return { id: event.id, type: event.type, object: event.data.object };
  }
}
