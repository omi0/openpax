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
  cancelCount: number;
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

  it("counts cancellations per guest and forgets them when the booking is reopened", async () => {
    const fx = await createFixture(t);
    const first = await api<{ id: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx),
    );
    const second = await api<{ id: string; manageToken: string }>(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, { startsAt: romeInstant("2026-06-19", "20:00") }),
    );
    await api(
      t,
      "POST",
      `${bookings(fx)}/${first.body.id}/actions`,
      { action: "cancel", reason: "Change of plans" },
      fx.session,
    );
    await api(
      t,
      "POST",
      `${bookings(fx)}/${second.body.id}/actions`,
      { action: "no_show" },
      fx.session,
    );

    const list = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    const [mario] = list.body.items;
    if (!mario) throw new Error("customer missing");
    expect(mario).toMatchObject({ cancelCount: 1, noShowCount: 1 });

    const bookingList = await api<Page<{ id: string; customer: { cancelCount: number } }>>(
      t,
      "GET",
      `${bookings(fx)}?customerId=${mario.id}`,
      undefined,
      fx.session,
    );
    expect(bookingList.body.items[0]?.customer.cancelCount).toBe(1);

    for (const id of [first.body.id, second.body.id]) {
      const reopened = await api(
        t,
        "POST",
        `${bookings(fx)}/${id}/actions`,
        { action: "reopen" },
        fx.session,
      );
      expect(reopened.status).toBe(200);
    }
    const after = await api<Customer>(
      t,
      "GET",
      `${customers(fx)}/${mario.id}`,
      undefined,
      fx.session,
    );
    expect(after.body).toMatchObject({ cancelCount: 0, noShowCount: 0 });
  });

  it("suggests look-alike guests and merges them into one entry", async () => {
    const fx = await createFixture(t);
    // Staff take one booking with Mario's email only and, another day, one with his phone only.
    const online = await api<{ id: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant(FRIDAY, "20:00"),
        partySize: 2,
        customer: { name: "Mario Rossi", email: "mario@example.com" },
      },
      fx.session,
    );
    expect(online.status).toBe(201);
    const byPhone = await api<{ id: string }>(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-06-19", "20:00"),
        partySize: 2,
        customer: { name: "mario rossi", phone: "+39 333 1234567" },
        source: "phone",
      },
      fx.session,
    );
    expect(byPhone.status).toBe(201);
    await api(
      t,
      "POST",
      `/api/public/v1/restaurants/${fx.slug}/bookings`,
      guestBooking(fx, {
        startsAt: romeInstant(FRIDAY, "21:00"),
        guest: { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321" },
      }),
    );
    await api(
      t,
      "POST",
      `${bookings(fx)}/${byPhone.body.id}/actions`,
      { action: "seat" },
      fx.session,
    );
    await api(
      t,
      "POST",
      `${bookings(fx)}/${online.body.id}/actions`,
      { action: "cancel" },
      fx.session,
    );

    const list = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    expect(list.body.total).toBe(3);
    const target = list.body.items.find((c) => c.email === "mario@example.com");
    const source = list.body.items.find((c) => c.phone === "+393331234567");
    if (!target || !source) throw new Error("Mario entries missing");
    await api(
      t,
      "PATCH",
      `${customers(fx)}/${target.id}`,
      { tags: ["vip"], notes: "Ama il Barolo" },
      fx.session,
    );
    await api(
      t,
      "PATCH",
      `${customers(fx)}/${source.id}`,
      { tags: ["regular"], notes: "Tavolo vicino alla finestra" },
      fx.session,
    );

    const hints = await api<Array<Customer & { matches: string[] }>>(
      t,
      "GET",
      `${customers(fx)}/${target.id}/duplicates`,
      undefined,
      fx.session,
    );
    expect(hints.status).toBe(200);
    expect(hints.body.map((c) => [c.id, c.matches])).toEqual([[source.id, ["name"]]]);

    const staff = await addMember(t, fx, "staff");
    const denied = await api(
      t,
      "POST",
      `${customers(fx)}/${target.id}/merge`,
      { sourceId: source.id },
      staff,
    );
    expect(denied.status).toBe(403);
    const self = await api<{ code: string }>(
      t,
      "POST",
      `${customers(fx)}/${target.id}/merge`,
      { sourceId: target.id },
      fx.session,
    );
    expect(self.status).toBe(400);
    expect(self.body.code).toBe("same_customer");

    const merged = await api<Customer>(
      t,
      "POST",
      `${customers(fx)}/${target.id}/merge`,
      { sourceId: source.id },
      fx.session,
    );
    expect(merged.status).toBe(200);
    expect(merged.body).toMatchObject({
      id: target.id,
      name: "Mario Rossi",
      email: "mario@example.com",
      phone: "+393331234567",
      tags: ["vip", "regular"],
      notes: "Ama il Barolo\n\nTavolo vicino alla finestra",
      visitCount: 1,
      cancelCount: 1,
      noShowCount: 0,
    });
    expect(merged.body.lastVisitAt).not.toBeNull();

    const gone = await api(t, "GET", `${customers(fx)}/${source.id}`, undefined, fx.session);
    expect(gone.status).toBe(404);
    const history = await api<Page<{ id: string }>>(
      t,
      "GET",
      `${bookings(fx)}?customerId=${target.id}`,
      undefined,
      fx.session,
    );
    expect(history.body.items.map((b) => b.id).sort()).toEqual(
      [online.body.id, byPhone.body.id].sort(),
    );
    const after = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    expect(after.body.total).toBe(2);
    const noHints = await api<unknown[]>(
      t,
      "GET",
      `${customers(fx)}/${target.id}/duplicates`,
      undefined,
      fx.session,
    );
    expect(noHints.body).toEqual([]);

    // A booking with the surviving guest's phone now lands on the merged entry.
    const phoneAgain = await api(
      t,
      "POST",
      bookings(fx),
      {
        serviceId: fx.serviceId,
        startsAt: romeInstant("2026-06-20", "20:00"),
        partySize: 2,
        customer: { name: "Mario Rossi", phone: "+39 333 1234567" },
        source: "phone",
      },
      fx.session,
    );
    expect(phoneAgain.status).toBe(201);
    const again = await api<Page<Customer>>(t, "GET", customers(fx), undefined, fx.session);
    expect(again.body.total).toBe(2);
  });
});
