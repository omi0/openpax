import { createDb } from "../client.js";
import { runMigrations } from "../migrate.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });
try {
  await runMigrations(db, process.env.MIGRATIONS_DIR);
  console.log("migrations applied");
} finally {
  await pool.end();
}
