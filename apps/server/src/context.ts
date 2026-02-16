import type { Db, restaurant } from "@sitli/db";
import type pg from "pg";
import type { RoleName } from "./auth/access.js";
import type { Auth, AuthSession } from "./auth/create-auth.js";
import type { Env } from "./env.js";
import type { JobQueue } from "./jobs/queue.js";
import type { SecretBox } from "./lib/crypto.js";
import type { Logger } from "./logger.js";
import type { ProviderRegistry } from "./notifications/provider.js";
import type { PaymentGateway } from "./payments/gateway.js";

export type RestaurantRow = typeof restaurant.$inferSelect;

/** Everything a module needs, built once at boot and passed explicitly. */
export interface AppContext {
  env: Env;
  logger: Logger;
  db: Db;
  pool: pg.Pool;
  auth: Auth;
  jobs: JobQueue;
  secrets: SecretBox;
  providers: ProviderRegistry;
  /** Card payments (Stripe in production, a fake in tests). */
  payments: PaymentGateway;
  /** Injected clock so tests can freeze time. */
  now: () => Date;
}

export type Actor =
  | { type: "user"; id: string; role: RoleName }
  | { type: "api_key"; id: string; organizationId: string; role: RoleName }
  | { type: "guest"; id: null }
  | { type: "system"; id: null };

export type AppVariables = {
  requestId: string;
  session: AuthSession["session"] | null;
  user: AuthSession["user"] | null;
  restaurant: RestaurantRow;
  actor: Actor;
};

export type AppEnv = { Variables: AppVariables };
