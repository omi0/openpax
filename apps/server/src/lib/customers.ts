import type { DbOrTx } from "@sitli/db";
import { customer } from "@sitli/db";
import { and, eq } from "drizzle-orm";

export type CustomerRow = typeof customer.$inferSelect;

export interface GuestIdentity {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  locale?: string | null;
}

/**
 * Find the guest book entry for a guest (by id, then email, then phone) and
 * refresh what we learned, or create it. `phone` must already be normalised.
 */
export async function upsertCustomer(
  tx: DbOrTx,
  restaurantId: string,
  guest: GuestIdentity,
  phone: string | null,
  marketingConsent: boolean | undefined,
): Promise<CustomerRow> {
  const email = guest.email?.trim().toLowerCase() || null;
  let existing: CustomerRow | undefined;
  if (guest.id) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.id, guest.id), eq(customer.restaurantId, restaurantId)))
      .limit(1);
  }
  if (!existing && email) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.restaurantId, restaurantId), eq(customer.email, email)))
      .limit(1);
  }
  if (!existing && phone) {
    [existing] = await tx
      .select()
      .from(customer)
      .where(and(eq(customer.restaurantId, restaurantId), eq(customer.phone, phone)))
      .limit(1);
  }
  if (existing) {
    const [updated] = await tx
      .update(customer)
      .set({
        name: guest.name || existing.name,
        ...(email && !existing.email ? { email } : {}),
        ...(phone && !existing.phone ? { phone } : {}),
        ...(guest.locale ? { locale: guest.locale } : {}),
        ...(marketingConsent ? { marketingConsent: true } : {}),
      })
      .where(eq(customer.id, existing.id))
      .returning();
    return updated ?? existing;
  }
  const [created] = await tx
    .insert(customer)
    .values({
      restaurantId,
      name: guest.name,
      email,
      phone,
      locale: guest.locale ?? null,
      marketingConsent: marketingConsent ?? false,
    })
    .returning();
  if (!created) throw new Error("customer insert failed");
  return created;
}
