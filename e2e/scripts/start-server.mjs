// Creates a fresh database, then starts the server from source with tsx.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const admin = process.env.TEST_DATABASE_URL ?? "postgres://openpax:openpax@localhost:5432/openpax";
const name = `openpax_e2e_${randomBytes(4).toString("hex")}`;

const client = new pg.Client({ connectionString: admin });
await client.connect();
await client.query(`create database ${name}`);
await client.end();
const url = new URL(admin);
url.pathname = `/${name}`;

const port = process.env.E2E_PORT ?? "3100";
const child = spawn("pnpm", ["--filter", "@openpax/server", "exec", "tsx", "src/index.ts"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: port,
    PUBLIC_URL: `http://localhost:${port}`,
    DATABASE_URL: url.toString(),
    BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234",
    APP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    // specs sign up several owners against one server
    SIGNUP_MODE: process.env.SIGNUP_MODE ?? "open",
    SMTP_URL: process.env.MAILPIT_SMTP ?? "",
    SMTP_FROM: "OpenPax E2E <e2e@example.com>",
  },
});

const cleanup = async () => {
  child.kill("SIGTERM");
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query(`drop database if exists ${name} with (force)`);
  await c.end();
};
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => void cleanup().then(() => process.exit(0)));
child.on("exit", (code) => void cleanup().then(() => process.exit(code ?? 0)));
