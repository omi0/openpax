import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.js";

/** Path of this package's migrations folder when running from source. */
export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(db: Db, migrationsFolder = DEFAULT_MIGRATIONS_FOLDER) {
  await migrate(db, { migrationsFolder, migrationsTable: "drizzle_migrations" });
}
