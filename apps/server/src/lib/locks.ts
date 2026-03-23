import { localDateParts } from "@sitli/core";
import type { DbOrTx } from "@sitli/db";
import { sql } from "drizzle-orm";

/**
 * Transaction-scoped advisory locks that serialise writers of one restaurant.
 * Every helper takes its keys in a fixed order, so two transactions that lock
 * the same things never deadlock. Callers must run inside a transaction: on a
 * plain connection the lock is released as soon as the statement ends.
 */

function yyyymmdd(date: string): number {
  const { year, month, day } = localDateParts(date);
  return year * 10_000 + month * 100 + day;
}

/** Bookings of the same restaurant on the same service dates are created and moved one at a time. */
export async function lockServiceDates(tx: DbOrTx, restaurantId: string, dates: string[]) {
  const keys = [...new Set(dates.map(yyyymmdd))].sort((a, b) => a - b);
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${restaurantId}), ${key})`);
  }
}

/** One guest-book entry per email or phone, even when the same guest books twice at once. */
export async function lockGuestIdentities(tx: DbOrTx, restaurantId: string, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${restaurantId}), hashtext(${`guest:${key}`}))`,
    );
  }
}

/** Name of the violated unique constraint when a query failed on one, else null. */
export function uniqueViolation(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (e.code === "23505") return typeof e.constraint === "string" ? e.constraint : "";
    current = e.cause;
  }
  return null;
}
