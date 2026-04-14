import { booking, bookingFeedback, customer, waitlistEntry } from "@openpax/db";
import type {
  CustomerDto,
  CustomerDuplicateDto,
  CustomerMatch,
  CustomerTagDto,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "@openpax/shared";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { lockGuestIdentities } from "../../lib/locks.js";
import { normalizePhone } from "../../lib/phone.js";

/** What a deleted guest is renamed to; such entries never count as look-alikes. */
const anonymisedName = (r: RestaurantRow) =>
  r.locale === "it" ? "Ospite eliminato" : "Deleted guest";

type CustomerRow = typeof customer.$inferSelect;

export function toCustomerDto(row: CustomerRow): CustomerDto {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    locale: row.locale as CustomerDto["locale"],
    tags: row.tags,
    notes: row.notes,
    visitCount: row.visitCount,
    noShowCount: row.noShowCount,
    cancelCount: row.cancelCount,
    marketingConsent: row.marketingConsent,
    lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Entries that look like the same person as `customerId`: same email, same
 * phone, or the same name (walk-ins and phone bookings taken without contact
 * details create one entry per booking). The system cannot tell on its own
 * that an email and a phone belong to one guest, so this is only a hint for
 * staff; the decision to merge stays with them.
 */
export async function listDuplicates(
  ctx: AppContext,
  r: RestaurantRow,
  customerId: string,
): Promise<CustomerDuplicateDto[]> {
  const me = await getCustomer(ctx, r.id, customerId);
  const clauses = [];
  if (me.email) clauses.push(eq(customer.email, me.email));
  if (me.phone) clauses.push(eq(customer.phone, me.phone));
  const name = me.name.trim().toLowerCase();
  const nameMatters = name.length > 0 && me.name !== anonymisedName(r);
  if (nameMatters) clauses.push(sql`lower(trim(${customer.name})) = ${name}`);
  const match = or(...clauses);
  if (!match) return [];
  const rows = await ctx.db
    .select()
    .from(customer)
    .where(and(eq(customer.restaurantId, r.id), ne(customer.id, me.id), match))
    .orderBy(desc(customer.visitCount), desc(customer.createdAt))
    .limit(10);
  return rows.map((row) => {
    const matches: CustomerMatch[] = [];
    if (me.email && row.email === me.email) matches.push("email");
    if (me.phone && row.phone === me.phone) matches.push("phone");
    if (nameMatters && row.name.trim().toLowerCase() === name) matches.push("name");
    return { ...toCustomerDto(row), matches };
  });
}

const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a: Date, b: Date) => (a < b ? a : b);

/**
 * Fold `sourceId` into `targetId`: bookings, waitlist entries and feedback
 * move over, counters add up, tags and notes are combined, missing contact
 * details are filled from the source, and the source entry is deleted. When
 * both entries carry a different email or phone, the target keeps its own and
 * the source's are written into the notes so nothing is lost.
 */
export async function mergeCustomers(
  ctx: AppContext,
  r: RestaurantRow,
  targetId: string,
  sourceId: string,
  actor: Actor,
): Promise<CustomerRow> {
  if (targetId === sourceId)
    throw ApiError.badRequest("same_customer", "Choose a different guest to merge");
  const target0 = await getCustomer(ctx, r.id, targetId);
  const source0 = await getCustomer(ctx, r.id, sourceId);
  return ctx.db.transaction(async (tx) => {
    // Same lock order as bookings: guest identities, then the guest rows.
    // A booking arriving for either guest meanwhile waits for the merge and
    // then lands on the entry that survives.
    await lockGuestIdentities(
      tx,
      r.id,
      [target0, source0].flatMap((c) => [
        ...(c.email ? [`email:${c.email}`] : []),
        ...(c.phone ? [`phone:${c.phone}`] : []),
      ]),
    );
    const rows = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.restaurantId, r.id), inArray(customer.id, [targetId, sourceId])))
      .orderBy(asc(customer.id))
      .for("update");
    const target = rows.find((x) => x.id === targetId);
    const source = rows.find((x) => x.id === sourceId);
    if (!target || !source) throw ApiError.notFound("Customer");

    const moved = await tx
      .update(booking)
      .set({ customerId: target.id })
      .where(eq(booking.customerId, source.id))
      .returning({ id: booking.id });
    await tx
      .update(waitlistEntry)
      .set({ customerId: target.id })
      .where(eq(waitlistEntry.customerId, source.id));
    await tx
      .update(bookingFeedback)
      .set({ customerId: target.id })
      .where(eq(bookingFeedback.customerId, source.id));

    const leftovers = [
      ...(source.email && target.email && source.email !== target.email ? [source.email] : []),
      ...(source.phone && target.phone && source.phone !== target.phone ? [source.phone] : []),
    ];
    const notes =
      [
        target.notes,
        source.notes,
        leftovers.length > 0
          ? `${r.locale === "it" ? "Altri contatti" : "Other contacts"}: ${leftovers.join(", ")}`
          : null,
      ]
        .filter((x): x is string => !!x)
        .join("\n\n") || null;

    const [merged] = await tx
      .update(customer)
      .set({
        email: target.email ?? source.email,
        phone: target.phone ?? source.phone,
        locale: target.locale ?? source.locale,
        tags: normalizeTags([...target.tags, ...source.tags]),
        notes,
        visitCount: target.visitCount + source.visitCount,
        noShowCount: target.noShowCount + source.noShowCount,
        cancelCount: target.cancelCount + source.cancelCount,
        marketingConsent: target.marketingConsent || source.marketingConsent,
        lastVisitAt: later(target.lastVisitAt, source.lastVisitAt),
        createdAt: earlier(target.createdAt, source.createdAt),
      })
      .where(eq(customer.id, target.id))
      .returning();
    if (!merged) throw ApiError.notFound("Customer");
    await tx.delete(customer).where(eq(customer.id, source.id));
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "customer.merged",
      entityType: "customer",
      entityId: target.id,
      data: { mergedFrom: source.id, bookings: moved.length },
    });
    return merged;
  });
}

export async function getCustomer(
  ctx: AppContext,
  restaurantId: string,
  customerId: string,
): Promise<CustomerRow> {
  const [row] = await ctx.db
    .select()
    .from(customer)
    .where(and(eq(customer.id, customerId), eq(customer.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Customer");
  return row;
}

export async function listCustomers(ctx: AppContext, r: RestaurantRow, q: ListCustomersQuery) {
  const conditions = [eq(customer.restaurantId, r.id)];
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(
      ilike(customer.name, term),
      ilike(customer.email, term),
      ilike(customer.phone, term),
    );
    if (match) conditions.push(match);
  }
  if (q.tag) conditions.push(sql`${q.tag} = any(${customer.tags})`);
  const where = and(...conditions);
  const orderBy = {
    recent: [sql`${customer.lastVisitAt} desc nulls last`, desc(customer.createdAt)],
    name: [asc(customer.name), desc(customer.createdAt)],
    visits: [desc(customer.visitCount), asc(customer.name)],
    created: [desc(customer.createdAt)],
  }[q.sort];
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select()
      .from(customer)
      .where(where)
      .orderBy(...orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    ctx.db.select({ total: sql<number>`count(*)::int` }).from(customer).where(where),
  ]);
  return {
    items: rows.map(toCustomerDto),
    page: q.page,
    pageSize: q.pageSize,
    total: count?.total ?? 0,
  };
}

/** Distinct tags in use, most common first, for tag pickers. */
export async function listTags(ctx: AppContext, restaurantId: string): Promise<CustomerTagDto[]> {
  const rows = await ctx.db.execute<{ tag: string; count: number }>(sql`
    select tag, count(*)::int as count
    from ${customer}, unnest(${customer.tags}) as tag
    where ${customer.restaurantId} = ${restaurantId}
    group by tag
    order by count desc, tag asc
  `);
  return rows.rows.map((row) => ({ tag: row.tag, count: row.count }));
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export async function updateCustomer(
  ctx: AppContext,
  r: RestaurantRow,
  customerId: string,
  input: UpdateCustomerInput,
  actor: Actor,
): Promise<CustomerRow> {
  const existing = await getCustomer(ctx, r.id, customerId);

  const patch: Partial<CustomerRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null;
  if (input.locale !== undefined) patch.locale = input.locale;
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.marketingConsent !== undefined) patch.marketingConsent = input.marketingConsent;
  if (input.phone !== undefined) {
    if (input.phone === null) patch.phone = null;
    else {
      const phone = normalizePhone(input.phone, input.locale ?? existing.locale ?? r.locale);
      if (!phone) throw ApiError.badRequest("invalid_phone", "Phone number is not valid");
      patch.phone = phone;
    }
  }

  // Email and phone identify guests on future bookings, so keep them unique per restaurant.
  for (const field of ["email", "phone"] as const) {
    const value = patch[field];
    if (!value || value === existing[field]) continue;
    const [clash] = await ctx.db
      .select({ id: customer.id })
      .from(customer)
      .where(
        and(
          eq(customer.restaurantId, r.id),
          eq(customer[field], value),
          ne(customer.id, existing.id),
        ),
      )
      .limit(1);
    if (clash)
      throw ApiError.conflict(`duplicate_${field}`, `Another customer already uses this ${field}`, {
        customerId: clash.id,
      });
  }

  const changes = (Object.keys(patch) as Array<keyof CustomerRow>).filter((k) => {
    const a = patch[k];
    const b = existing[k];
    return Array.isArray(a) ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
  });
  if (changes.length === 0) return existing;

  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(customer)
      .set(patch)
      .where(eq(customer.id, existing.id))
      .returning();
    if (!row) throw ApiError.notFound("Customer");
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "customer.updated",
      entityType: "customer",
      entityId: row.id,
      data: { changes },
    });
    return row;
  });
}

/**
 * GDPR-style removal. Customers with bookings are anonymised so the booking
 * history and statistics stay intact; customers without any are deleted.
 */
export async function deleteCustomer(
  ctx: AppContext,
  r: RestaurantRow,
  customerId: string,
  actor: Actor,
): Promise<{ anonymized: boolean }> {
  const existing = await getCustomer(ctx, r.id, customerId);
  return ctx.db.transaction(async (tx) => {
    const [ref] = await tx
      .select({ id: booking.id })
      .from(booking)
      .where(eq(booking.customerId, existing.id))
      .limit(1);
    const anonymized = !!ref;
    if (anonymized) {
      await tx
        .update(customer)
        .set({
          name: anonymisedName(r),
          email: null,
          phone: null,
          locale: null,
          tags: [],
          notes: null,
          marketingConsent: false,
        })
        .where(eq(customer.id, existing.id));
    } else {
      await tx.delete(customer).where(eq(customer.id, existing.id));
    }
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "customer.deleted",
      entityType: "customer",
      entityId: existing.id,
      data: { anonymized },
    });
    return { anonymized };
  });
}
