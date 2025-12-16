import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  api,
  createFixture,
  createTestApp,
  FRIDAY,
  guestBooking,
  romeInstant,
  type TestApp,
} from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  visitCount: number;
  noShowCount: number;
  lastVisitAt: string | null;
}
interface Page<T> {
  items: T[];
  total: number;
}

const customers = (fx: { restaurantId: string }) =>
  `/api/v1/restaurants/${fx.restaurantId}/customers`;
const bookings = (fx: { restaurantId: string }) =>
  `/api/v1/restaurants/${fx.restaurantId}/bookings`;

describe("customers", () => {
  it("lists guests created by bookings and searches them by name, email or phone", async () => {
    const fx = await createFixture(t);
    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));
    await api(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        startsAt: romeInstant(FRIDAY, "21:00"),
        guest: { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321" },
      }),
    );

    const all = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items.map((c) => c.name).sort()).toEqual(["Lucia Bianchi", "Mario Rossi"]);
    expect(all.body.items.every((c) => c.visitCount === 0)).toBe(true);

    const byPhone = await api<Page<Customer>>(
      t,
      "GET",
      `${customers(fx)}?search=7654`,
      undefined,
      fx.session,
    );
    expect(byPhone.body.items.map((c) => c.name)).toEqual(["Lucia Bianchi"]);

    const byEmail = await api<Page<Customer>>(
      t,
      "GET",
      `${customers(fx)}?search=MARIO%40`,
      undefined,
      fx.session,
    );
    expect(byEmail.body.items.map((c) => c.name)).toEqual(["Mario Rossi"]);

    const none = await api<Page<Customer>>(
      t,
      "GET",
      `${customers(fx)}?search=nobody`,
      undefined,
      fx.session,
    );
    expect(none.body.total).toBe(0);
  });

  it("edits notes, tags and contact details and keeps email and phone unique", async () => {
    const fx = await createFixture(t);
    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));
    await api(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        startsAt: romeInstant(FRIDAY, "21:00"),
        guest: { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321" },
      }),
    );
    const list = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    const mario = list.body.items.find((c) => c.name === "Mario Rossi");
    if (!mario) throw new Error("Mario missing");

    const updated = await api<Customer>(
      t,
      "PATCH",
      `${customers(fx)}/${mario.id}`,
      { notes: "Allergic to nuts", tags: [" VIP ", "vip", "Regular"], phone: "333 9998877" },
      fx.session,
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      notes: "Allergic to nuts",
      tags: ["vip", "regular"],
      phone: "+393339998877",
    });

    const tags = await api<Array<{ tag: string; count: number }>>(
      t,
      "GET",
      `${customers(fx)}/tags`,
      undefined,
      fx.session,
    );
    expect(tags.body).toEqual([
      { tag: "regular", count: 1 },
      { tag: "vip", count: 1 },
    ]);

    const tagged = await api<Page<Customer>>(
      t,
      "GET",
      `${customers(fx)}?tag=vip`,
      undefined,
      fx.session,
    );
    expect(tagged.body.items.map((c) => c.id)).toEqual([mario.id]);

    const clash = await api<{ code: string }>(
      t,
      "PATCH",
      `${customers(fx)}/${mario.id}`,
      { email: "Lucia@example.com" },
      fx.session,
    );
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("duplicate_email");

    const badPhone = await api<{ code: string }>(
      t,
      "PATCH",
      `${customers(fx)}/${mario.id}`,
      { phone: "12345" },
      fx.session,
    );
    expect(badPhone.status).toBe(400);
    expect(badPhone.body.code).toBe("invalid_phone");
  });

  it("returns a guest's booking history newest first and tracks visits", async () => {
    const fx = await createFixture(t);
    const first = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    const second = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { startsAt: romeInstant("2026-06-19", "20:00") }),
    );
    await api(
      t,
      "POST",
      `${bookings(fx)}/${first.body.id}/actions`,
      { action: "seat" },
      fx.session,
    );

    const list = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    const [mario] = list.body.items;
    if (!mario) throw new Error("customer missing");
    expect(mario.visitCount).toBe(1);
    expect(mario.lastVisitAt).not.toBeNull();

    const history = await api<Page<{ id: string; status: string }>>(
      t,
      "GET",
      `${bookings(fx)}?customerId=${mario.id}&order=desc`,
      undefined,
      fx.session,
    );
    expect(history.body.total).toBe(2);
    expect(history.body.items.map((b) => b.id)).toEqual([second.body.id, first.body.id]);
    expect(history.body.items[1]?.status).toBe("seated");
  });

  it("anonymises guests with bookings on delete and lets only managers do it", async () => {
    const fx = await createFixture(t);
    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));
    const list = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    const [mario] = list.body.items;
    if (!mario) throw new Error("customer missing");

    const staff = await addMember(t, fx, "staff");
    const canRead = await api(t, "GET", `${customers(fx)}/${mario.id}`, undefined, staff);
    expect(canRead.status).toBe(200);
    const canNote = await api(
      t,
      "PATCH",
      `${customers(fx)}/${mario.id}`,
      { notes: "prefers the window" },
      staff,
    );
    expect(canNote.status).toBe(200);
    const denied = await api(t, "DELETE", `${customers(fx)}/${mario.id}`, undefined, staff);
    expect(denied.status).toBe(403);

    const removed = await api(t, "DELETE", `${customers(fx)}/${mario.id}`, undefined, fx.session);
    expect(removed.status).toBe(204);
    const after = await api<Customer>(
      t,
      "GET",
      `${customers(fx)}/${mario.id}`,
      undefined,
      fx.session,
    );
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({ name: "Ospite eliminato", email: null, phone: null });
    const history = await api<Page<{ id: string }>>(
      t,
      "GET",
      `${bookings(fx)}?customerId=${mario.id}`,
      undefined,
      fx.session,
    );
    expect(history.body.total).toBe(1);
  });
});
