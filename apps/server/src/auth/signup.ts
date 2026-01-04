import type { Db } from "@sitli/db";
import { invitation, user } from "@sitli/db";
import { and, eq, gt, sql } from "drizzle-orm";

/**
 * Who may create an account:
 * - `open`: anyone (hosted, multi-tenant instances)
 * - `invite_only`: only people with a pending invitation
 * - `first_user` (default): open until the first account exists, then invite-only,
 *   which is what a restaurant running its own instance wants.
 */
export type SignupMode = "open" | "invite_only" | "first_user";

async function hasUsers(db: Db): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  return (row?.n ?? 0) > 0;
}

/** Can a visitor without an invitation sign up right now? */
export async function isSignupOpen(db: Db, mode: SignupMode): Promise<boolean> {
  if (mode === "open") return true;
  if (mode === "invite_only") return false;
  return !(await hasUsers(db));
}

/** Can this specific email sign up (open instance, first account, or invited)? */
export async function signupAllowed(
  db: Db,
  mode: SignupMode,
  email: string,
  now = new Date(),
): Promise<boolean> {
  if (await isSignupOpen(db, mode)) return true;
  const [invited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email.trim().toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .limit(1);
  return !!invited;
}
