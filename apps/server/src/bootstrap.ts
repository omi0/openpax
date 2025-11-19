import { createDb } from "@sitli/db";
import { createAuth } from "./auth/create-auth.js";
import type { AppContext } from "./context.js";
import type { Env } from "./env.js";
import type { JobQueue } from "./jobs/queue.js";
import { createSecretBox } from "./lib/crypto.js";
import type { Logger } from "./logger.js";
import type { SitliModule } from "./modules/module.js";
import { ProviderRegistry } from "./notifications/provider.js";

export interface BuildContextOptions {
  env: Env;
  logger: Logger;
  modules: SitliModule[];
  jobs: JobQueue;
  now?: () => Date;
}

/** Wire the shared services every module receives. */
export function buildContext(options: BuildContextOptions): AppContext {
  const { env, logger } = options;
  const { db, pool } = createDb(env.DATABASE_URL, { max: 10 });
  const providers = new ProviderRegistry();
  for (const m of options.modules) if (m.providers) providers.register(m.providers);

  const auth = createAuth({
    db,
    baseURL: env.PUBLIC_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL, env.DASHBOARD_ORIGIN].filter((v): v is string => !!v),
    secureCookies: env.SECURE_COOKIES,
    trustProxy: env.TRUST_PROXY,
    sendInvitationEmail: async (data) => {
      logger.info(
        { email: data.email, organization: data.organizationName },
        "invitation created (email delivery not wired yet)",
      );
    },
  });

  return {
    env,
    logger,
    db,
    pool,
    auth,
    jobs: options.jobs,
    secrets: createSecretBox(env.APP_ENCRYPTION_KEY),
    providers,
    now: options.now ?? (() => new Date()),
  };
}
