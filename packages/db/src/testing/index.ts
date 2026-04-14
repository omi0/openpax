import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDb, type Db } from "../client.js";
import { runMigrations } from "../migrate.js";

export interface TestDatabase {
  db: Db;
  pool: pg.Pool;
  connectionString: string;
  /** Drops the database (or stops the container). */
  cleanup: () => Promise<void>;
}

/**
 * Fresh, migrated Postgres for a test file.
 * - With TEST_DATABASE_URL set (any reachable Postgres with CREATEDB rights),
 *   a throwaway database is created next to it: fast, no Docker needed.
 * - Otherwise a postgres:16 container is started via testcontainers.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (adminUrl) return createFromAdminUrl(adminUrl);
  return createFromContainer();
}

async function createFromAdminUrl(adminUrl: string): Promise<TestDatabase> {
  const name = `openpax_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const connectionString = url.toString();
  const { db, pool } = createDb(connectionString, { max: 20 });
  await runMigrations(db);

  return {
    db,
    pool,
    connectionString,
    cleanup: async () => {
      await pool.end();
      await dropDatabase(adminUrl, name);
    },
  };
}

/**
 * Drop a throwaway database. `with (force)` cannot terminate backends owned
 * by another role (an autovacuum worker, typically), so retry a few times and
 * leave the database behind rather than fail the suite over cleanup.
 */
async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await admin.query(`drop database if exists ${name} with (force)`);
        return;
      } catch (error) {
        if (attempt === 5) {
          console.warn(`could not drop test database ${name}: ${String(error)}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  } finally {
    await admin.end();
  }
}

async function createFromContainer(): Promise<TestDatabase> {
  const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const connectionString = container.getConnectionUri();
  const { db, pool } = createDb(connectionString, { max: 20 });
  await runMigrations(db);
  return {
    db,
    pool,
    connectionString,
    cleanup: async () => {
      await pool.end();
      await container.stop();
    },
  };
}
