import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export interface CreateDbOptions {
  /** Max pool size (default 10). */
  max?: number;
  /** Log every query (development only). */
  logger?: boolean;
}

export function createDb(connectionString: string, options: CreateDbOptions = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
  const db = drizzle({ client: pool, schema, casing: "snake_case", logger: options.logger ?? false });
  return { pool, db };
}

export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either a database handle or a transaction: repositories accept both. */
export type DbOrTx = Db | Tx;
