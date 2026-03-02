import { notificationProviderConfig, paymentConfig } from "@sitli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildContext } from "../src/bootstrap.js";
import { loadEnv } from "../src/env.js";
import { MemoryJobQueue } from "../src/jobs/memory-queue.js";
import { createSecretBox } from "../src/lib/crypto.js";
import { rotateStoredSecrets } from "../src/lib/secret-rotation.js";
import { createLogger } from "../src/logger.js";
import { modules } from "../src/modules/index.js";
import { api, createFixture, createTestApp, PUBLIC_URL, type TestApp } from "./helpers.js";

const KEY_A = Buffer.alloc(32, 7).toString("base64"); // the test app's key
const KEY_B = Buffer.alloc(32, 9).toString("base64");

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe("encryption key rotation", () => {
  it("opens values with previous keys and re-encrypts them with the current one", () => {
    const a = createSecretBox(KEY_A);
    const b = createSecretBox(KEY_B, [KEY_A]);
    const stored = a.encrypt("hunter2");
    expect(b.decrypt(stored)).toBe("hunter2");
    expect(b.needsRotation(stored)).toBe(true);
    const fresh = b.rotate(stored);
    expect(fresh).not.toBeNull();
    expect(b.needsRotation(fresh ?? "")).toBe(false);
    expect(b.rotate(fresh ?? "")).toBeNull();
    // the old key alone can no longer read the rotated value
    expect(() => a.decrypt(fresh ?? "")).toThrow();
    expect(() => createSecretBox(KEY_B).decrypt(stored)).toThrow();
  });

  it("re-encrypts provider and payment secrets stored under the old key", async () => {
    const fx = await createFixture(t);
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "T <t@example.com>" },
      },
      fx.session,
    );
    await api(
      t,
      "PUT",
      `/api/v1/restaurants/${fx.restaurantId}/payments/config`,
      {
        secretKey: "sk_test_rotate_9876",
        webhookSecret: "whsec_rotate",
        mode: "off",
        amountCents: 0,
        minPartySize: null,
        paymentWindowMinutes: 30,
        refundOnCancel: true,
        chargeNoShow: true,
      },
      fx.session,
    );

    // a new process boots with the new key and the old one as "previous"
    const env = loadEnv({
      NODE_ENV: "test",
      DATABASE_URL: t.ctx.env.DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      APP_ENCRYPTION_KEY: KEY_B,
      APP_ENCRYPTION_KEY_PREVIOUS: `${KEY_A},${Buffer.alloc(32, 1).toString("base64")}`,
      PUBLIC_URL,
      LOG_LEVEL: "silent",
      RATE_LIMIT: "off",
    });
    const jobs = new MemoryJobQueue();
    const next = buildContext({ env, logger: createLogger("silent", false), modules, jobs });
    try {
      const first = await rotateStoredSecrets(next);
      expect(first).toEqual({ rotated: 2, failed: 0 });
      const again = await rotateStoredSecrets(next);
      expect(again).toEqual({ rotated: 0, failed: 0 });

      // everything now opens with the new key alone
      const only = createSecretBox(KEY_B);
      const [provider] = await next.db.select().from(notificationProviderConfig);
      expect(only.decrypt(String(provider?.config.apiKey))).toBe("secret-key-1234");
      const [payment] = await next.db.select().from(paymentConfig);
      expect(only.decrypt(String(payment?.config.secretKey))).toBe("sk_test_rotate_9876");
      expect(only.decrypt(String(payment?.config.webhookSecret))).toBe("whsec_rotate");
      // non-secret fields were left untouched
      expect(provider?.config.from).toBe("T <t@example.com>");
    } finally {
      await next.pool.end();
    }
  });

  it("refuses malformed previous keys", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "test",
        DATABASE_URL: "postgres://x",
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
        APP_ENCRYPTION_KEY: KEY_A,
        APP_ENCRYPTION_KEY_PREVIOUS: "not-a-key",
        PUBLIC_URL,
      }),
    ).toThrow(/APP_ENCRYPTION_KEY_PREVIOUS/);
  });
});
