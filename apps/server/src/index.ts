import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createDb, runMigrations } from "@openpax/db";
import { createApp } from "./app.js";
import { buildContext } from "./bootstrap.js";
import { loadEnv } from "./env.js";
import { buildHandlerRegistry, startOutboxRelay } from "./events/dispatch.js";
import { createBoss, PgBossQueue, registerJobs } from "./jobs/boss.js";
import { rotateStoredSecrets } from "./lib/secret-rotation.js";
import { createLogger } from "./logger.js";
import { modules } from "./modules/index.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
const here = dirname(fileURLToPath(import.meta.url));

function firstExisting(...candidates: string[]): string | undefined {
  return candidates.find((c) => existsSync(c));
}

// Migrate before anything touches the database: Better Auth initialises as
// soon as it is built and the OAuth provider seeds its resources then.
const migrator = createDb(env.DATABASE_URL, { max: 1 });
await runMigrations(migrator.db, process.env.MIGRATIONS_DIR);
await migrator.pool.end();
logger.info("database migrated");

const boss = await createBoss(env.DATABASE_URL, logger);
const ctx = buildContext({ env, logger, modules, jobs: new PgBossQueue(boss) });

if (env.APP_ENCRYPTION_KEY_PREVIOUS.length > 0) {
  const { rotated, failed } = await rotateStoredSecrets(ctx);
  logger.warn(
    { rotated, failed },
    failed === 0
      ? "stored secrets re-encrypted with APP_ENCRYPTION_KEY; you can now remove APP_ENCRYPTION_KEY_PREVIOUS"
      : "some stored secrets could not be decrypted with any configured key",
  );
}

const jobs = modules.flatMap((m) => m.jobs ?? []);
const runWorkers = env.ROLE !== "api";
await registerJobs(boss, jobs, ctx, runWorkers);

let stopRelay: (() => void) | undefined;
if (runWorkers) {
  stopRelay = startOutboxRelay(
    ctx,
    buildHandlerRegistry(modules.flatMap((m) => m.eventHandlers ?? [])),
  );
  logger.info({ jobs: jobs.map((j) => j.name) }, "workers started");
}

let server: ReturnType<typeof serve> | undefined;
if (env.ROLE !== "worker") {
  const app = createApp(ctx, modules, {
    static: {
      dashboardDist:
        env.DASHBOARD_DIST ??
        firstExisting(resolve(here, "../public/dashboard"), resolve(here, "../../dashboard/dist")),
      widgetDist:
        env.WIDGET_DIST ??
        firstExisting(resolve(here, "../public/widget"), resolve(here, "../../widget/dist")),
    },
  });
  server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
    logger.info({ port: info.port, url: env.PUBLIC_URL }, "openpax listening");
  });
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  stopRelay?.();
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  await boss.stop({ graceful: true, timeout: 10_000 });
  await ctx.pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
