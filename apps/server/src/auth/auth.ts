/**
 * Entry point for the Better Auth CLI (`pnpm auth:generate`).
 * The running server builds its own instance in src/context.ts; this file only
 * needs to expose an `auth` object with the same plugins and adapter so the
 * CLI can derive the Drizzle schema. The pool never connects here.
 */
import { createDb } from "@sitli/db";
import { createAuth } from "./create-auth.js";

const { db } = createDb(process.env.DATABASE_URL ?? "postgres://sitli:sitli@localhost:5432/sitli", {
  max: 1,
});

// The OAuth provider seeds its resources table when the instance initialises.
// While this generation is the one adding that table, the background seed
// fails; the CLI only reads `auth.options`, so the failure must not abort it.
process.on("unhandledRejection", (error) => {
  console.warn(
    "[auth:generate] ignoring init error:",
    error instanceof Error ? error.message : error,
  );
});

export const auth = createAuth({
  db,
  baseURL: process.env.PUBLIC_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "cli-only-not-a-real-secret",
});
