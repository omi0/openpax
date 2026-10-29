import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { bookingOperator } from "@openpax/db";
import type {
  CreateOperatorInput,
  OperatorDto,
  OperatorProof,
  UpdateOperatorInput,
} from "@openpax/shared";
import { and, asc, count, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { uniqueViolation } from "../../lib/locks.js";

const scryptAsync = promisify(scrypt) as (
  pin: string,
  salt: Buffer,
  len: number,
) => Promise<Buffer>;

/** Wrong PINs in a row before the operator is locked, and for how long. */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

type OperatorRow = typeof bookingOperator.$inferSelect;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function pinMatches(stored: string, pin: string): Promise<boolean> {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(pin, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const toDto = (o: OperatorRow): OperatorDto => ({ id: o.id, name: o.name });

export async function listOperators(ctx: AppContext, r: RestaurantRow): Promise<OperatorDto[]> {
  const rows = await ctx.db
    .select()
    .from(bookingOperator)
    .where(eq(bookingOperator.restaurantId, r.id))
    .orderBy(asc(bookingOperator.sortOrder), asc(bookingOperator.name));
  return rows.map(toDto);
}

const duplicate = () => ApiError.conflict("operator_exists", "An operator with this name exists");

export async function createOperator(
  ctx: AppContext,
  r: RestaurantRow,
  input: CreateOperatorInput,
  actor: Actor,
): Promise<OperatorDto> {
  try {
    const [row] = await ctx.db
      .insert(bookingOperator)
      .values({ restaurantId: r.id, name: input.name, pinHash: await hashPin(input.pin) })
      .returning();
    if (!row) throw new Error("operator insert failed");
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: "operator.created",
      entityType: "booking_operator",
      entityId: row.id,
      data: { name: row.name },
    });
    return toDto(row);
  } catch (error) {
    if (uniqueViolation(error) === "booking_operator_name_uidx") throw duplicate();
    throw error;
  }
}

export async function updateOperator(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  input: UpdateOperatorInput,
  actor: Actor,
): Promise<OperatorDto> {
  try {
    const [row] = await ctx.db
      .update(bookingOperator)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        // a new PIN also lifts a lock
        ...(input.pin !== undefined
          ? { pinHash: await hashPin(input.pin), failedAttempts: 0, lockedUntil: null }
          : {}),
      })
      .where(and(eq(bookingOperator.id, id), eq(bookingOperator.restaurantId, r.id)))
      .returning();
    if (!row) throw ApiError.notFound("Operator");
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: "operator.updated",
      entityType: "booking_operator",
      entityId: row.id,
      data: { name: row.name, pinChanged: input.pin !== undefined },
    });
    return toDto(row);
  } catch (error) {
    if (uniqueViolation(error) === "booking_operator_name_uidx") throw duplicate();
    throw error;
  }
}

export async function deleteOperator(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  actor: Actor,
): Promise<void> {
  const [row] = await ctx.db
    .delete(bookingOperator)
    .where(and(eq(bookingOperator.id, id), eq(bookingOperator.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Operator");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "operator.deleted",
    entityType: "booking_operator",
    entityId: row.id,
    data: { name: row.name },
  });
}

/**
 * Check an operator's PIN; five wrong ones in a row lock them for five minutes.
 * Each try first takes one of the five attempts in a single UPDATE, so codes
 * sent in parallel cannot slip past the limit.
 */
export async function checkOperator(
  ctx: AppContext,
  r: RestaurantRow,
  proof: OperatorProof,
): Promise<OperatorRow> {
  const now = ctx.now();
  const mine = and(eq(bookingOperator.id, proof.id), eq(bookingOperator.restaurantId, r.id));
  const [op] = await ctx.db
    .update(bookingOperator)
    .set({ failedAttempts: sql`${bookingOperator.failedAttempts} + 1` })
    .where(
      and(
        mine,
        or(isNull(bookingOperator.lockedUntil), lte(bookingOperator.lockedUntil, now)),
        lt(bookingOperator.failedAttempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!op) {
    const [exists] = await ctx.db
      .select({ id: bookingOperator.id })
      .from(bookingOperator)
      .where(mine)
      .limit(1);
    if (!exists) throw ApiError.badRequest("unknown_operator", "This operator does not exist");
    throw new ApiError(429, "operator_locked", "Too many wrong codes, try again in a few minutes");
  }
  if (!(await pinMatches(op.pinHash, proof.pin))) {
    if (op.failedAttempts >= MAX_ATTEMPTS)
      await ctx.db
        .update(bookingOperator)
        .set({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) })
        .where(eq(bookingOperator.id, op.id));
    throw ApiError.badRequest("wrong_pin", "Wrong code");
  }
  await ctx.db
    .update(bookingOperator)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(bookingOperator.id, op.id));
  return op;
}

/**
 * Dashboard users (signed in with the shared login) must say who they are
 * once the restaurant has operators; API keys and assistants are not asked.
 */
export async function requireOperator(
  ctx: AppContext,
  r: RestaurantRow,
  actor: Actor,
  proof: OperatorProof | undefined,
): Promise<OperatorRow | null> {
  if (actor.type !== "user" || actor.via === "assistant") {
    return proof ? checkOperator(ctx, r, proof) : null;
  }
  if (proof) return checkOperator(ctx, r, proof);
  const [row] = await ctx.db
    .select({ n: count() })
    .from(bookingOperator)
    .where(eq(bookingOperator.restaurantId, r.id));
  if ((row?.n ?? 0) > 0)
    throw ApiError.badRequest("operator_required", "Choose who you are and type your code");
  return null;
}

/** For corrections: the name must belong to a current operator (or be cleared). */
export async function assertOperatorName(ctx: AppContext, r: RestaurantRow, name: string | null) {
  if (name === null) return;
  const names = (await listOperators(ctx, r)).map((o) => o.name);
  if (!names.includes(name))
    throw ApiError.badRequest("unknown_operator", "This name is not in the operator list");
}
