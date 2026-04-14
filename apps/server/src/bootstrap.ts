import { randomUUID } from "node:crypto";
import { createDb } from "@openpax/db";
import { createAuth } from "./auth/create-auth.js";
import type { AppContext } from "./context.js";
import type { Env } from "./env.js";
import { emitEvent } from "./events/outbox.js";
import type { JobQueue } from "./jobs/queue.js";
import { createSecretBox } from "./lib/crypto.js";
import { RateLimiter } from "./lib/rate-limit.js";
import type { Logger } from "./logger.js";
import type { OpenPaxModule } from "./modules/module.js";
import { ProviderRegistry } from "./notifications/provider.js";
import type { PaymentGateway } from "./payments/gateway.js";
import { stripeGateway } from "./payments/stripe.js";

export interface BuildContextOptions {
  env: Env;
  logger: Logger;
  modules: OpenPaxModule[];
  jobs: JobQueue;
  now?: () => Date;
  paymentGateway?: PaymentGateway;
}

/** Wire the shared services every module receives. */
export function buildContext(options: BuildContextOptions): AppContext {
  const { env, logger } = options;
  const { db, pool } = createDb(env.DATABASE_URL, { max: 10 });
  const providers = new ProviderRegistry();
  for (const m of options.modules) if (m.providers) providers.register(m.providers);

  const authOptions: Parameters<typeof createAuth>[0] = {
    db,
    baseURL: env.PUBLIC_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL, env.DASHBOARD_ORIGIN].filter((v): v is string => !!v),
    secureCookies: env.SECURE_COOKIES,
    trustProxy: env.TRUST_PROXY,
    signupMode: env.SIGNUP_MODE,
    // Better Auth calls this after it stored the invitation; delivery is a
    // module concern, so hand it to the outbox like any other domain event.
    sendInvitationEmail: async (data) => {
      await emitEvent(db, {
        type: "team.invitation_created",
        restaurantId: null,
        aggregateType: "invitation",
        aggregateId: data.id,
        payload: {
          invitationId: data.id,
          organizationId: data.organizationId,
          email: data.email,
          role: data.role,
        },
      });
    },
  };
  const auth = createAuth(authOptions);

  // Reset links are secrets with a short life: hand them straight to the job
  // queue rather than recording them as domain events.
  authOptions.sendResetPassword = async (data) => {
    await options.jobs.send("notify.password_reset", { ...data, requestId: randomUUID() });
  };

  return {
    env,
    logger,
    db,
    pool,
    auth,
    jobs: options.jobs,
    secrets: createSecretBox(env.APP_ENCRYPTION_KEY, env.APP_ENCRYPTION_KEY_PREVIOUS),
    providers,
    payments: options.paymentGateway ?? stripeGateway,
    limiter: new RateLimiter(),
    now: options.now ?? (() => new Date()),
  };
}
