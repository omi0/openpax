import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  // pg-boss manages its own "pgboss" schema; keep drizzle-kit out of it.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://openpax:openpax@localhost:5432/openpax",
  },
});
