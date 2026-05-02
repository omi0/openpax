import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createFixture, createTestApp, guestBooking, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
}

async function importCsv(
  path: string,
  csv: string,
  cookie: string,
  dryRun = false,
): Promise<{ status: number; body: ImportResult }> {
  const res = await t.app.request(`${path}?dryRun=${dryRun ? "1" : "0"}`, {
    method: "POST",
    headers: { "content-type": "text/csv; charset=utf-8", cookie, origin: "http://localhost:3000" },
    body: csv,
  });
  return { status: res.status, body: (await res.json()) as ImportResult };
}

async function download(
  path: string,
  cookie: string,
): Promise<{ status: number; text: string; type: string }> {
  const res = await t.app.request(path, { headers: { cookie, origin: "http://localhost:3000" } });
  return {
    status: res.status,
    text: await res.text(),
    type: res.headers.get("content-type") ?? "",
  };
}

describe("CSV import and export", () => {
  it("imports guests (creating and updating), previews first, and exports them back", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    // one guest already exists from a booking
    await api(t, "POST", `/api/public/v1/restaurants/${fx.slug}/bookings`, guestBooking(fx));

    const csv = [
      "Nome;E-mail;Telefono;Tags;Note;Marketing",
      "Mario Rossi;mario@example.com;;vip, regular;Ama il Barolo;si",
      'Lucia Bianchi;lucia@example.com;+39 340 7654321;"amica";;no',
      ";nobody@example.com;;;;",
      "Paolo Verdi;;12;;;",
    ].join("\r\n");
    const preview = await importCsv(`${base}/customers/import`, csv, fx.session.cookie, true);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({
      total: 4,
      created: 2,
      updated: 1,
      skipped: 1,
      dryRun: true,
    });
    expect(preview.body.errors.map((e) => e.line)).toEqual([4]);
    // a phone that cannot be read does not lose the guest: it goes in the notes
    expect(preview.body.warnings).toEqual([
      { line: 5, message: 'phone "12" could not be read; kept in the notes' },
    ]);
    // a preview writes nothing
    const still = await api<{ total: number }>(
      t,
      "GET",
      `${base}/customers`,
      undefined,
      fx.session,
    );
    expect(still.body.total).toBe(1);

    const run = await importCsv(`${base}/customers/import`, csv, fx.session.cookie);
    expect(run.body).toMatchObject({ created: 2, updated: 1, skipped: 1, dryRun: false });
    const list = await api<{
      items: Array<{
        name: string;
        phone: string | null;
        tags: string[];
        notes: string | null;
        marketingConsent: boolean;
      }>;
    }>(t, "GET", `${base}/customers?sort=name`, undefined, fx.session);
    expect(list.body.items.map((c) => c.name)).toEqual([
      "Lucia Bianchi",
      "Mario Rossi",
      "Paolo Verdi",
    ]);
    expect(list.body.items[1]).toMatchObject({
      tags: ["vip", "regular"],
      notes: "Ama il Barolo",
      marketingConsent: true,
    });
    expect(list.body.items[2]).toMatchObject({ phone: null, notes: "Tel. 12" });
    // importing the same file again only updates (the name-only guest included)
    const again = await importCsv(`${base}/customers/import`, csv, fx.session.cookie);
    expect(again.body).toMatchObject({ created: 0, updated: 3 });

    const exported = await download(`${base}/customers/export?tag=vip`, fx.session.cookie);
    expect(exported.type).toContain("text/csv");
    const lines = exported.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "name,email,phone,locale,tags,notes,visits,no_shows,cancellations,marketing_consent,last_visit,created_at",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(
      'Mario Rossi,mario@example.com,+393331234567,it,"vip, regular",Ama il Barolo,0,0,0,true',
    );

    // staff cannot export the guest book
    const staff = await api(t, "GET", `${base}/customers/export`, undefined, fx.session, {});
    expect(staff.status).toBe(200);
  });

  it("imports historical bookings silently and exports bookings with their tables", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    await api(
      t,
      "PUT",
      `${base}/notification-providers/email`,
      {
        providerId: "test-email",
        config: { apiKey: "secret-key-1234", from: "T <t@example.com>" },
      },
      fx.session,
    );
    const csv = [
      "date,time,guests,name,email,phone,service,status,notes,source",
      "2026-05-15,20:00,4,Mario Rossi,mario@example.com,,Cena,,Compleanno,phone",
      "2026-05-16,20:30,2,Anna Neri,,+39 333 0000002,cena,no-show,,",
      "2026-05-15,20:00,4,Mario Rossi,mario@example.com,,,,,",
      "2026-07-03,21:00,6,Famiglia Conti,,,Cena,,,walk in",
      "2026-05-17,19:00,3,Giulia,,,Pranzo,,,",
      "15/05/2026,20:00,2,Bad Date,,,,,,",
    ].join("\n");
    // drain what earlier bookings left in the outbox, then watch what the import adds
    await t.processEvents();
    const before = t.sentEmails.length;
    const jobsBefore = t.jobs.sent.length;
    const result = await importCsv(`${base}/bookings/import`, csv, fx.session.cookie);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body).toMatchObject({ total: 6, created: 3, skipped: 3 });
    expect(result.body.errors.map((e) => e.line)).toEqual([6, 7]);
    await t.processEvents();
    // history never emails anyone
    expect(t.sentEmails.length).toBe(before);

    const list = await api<{
      items: Array<{
        status: string;
        source: string;
        partySize: number;
        customer: { name: string; visitCount: number; noShowCount: number };
      }>;
    }>(t, "GET", `${base}/bookings?from=2026-05-01&to=2026-07-31`, undefined, fx.session);
    expect(list.body.items.map((b) => [b.customer.name, b.status, b.source])).toEqual([
      ["Mario Rossi", "completed", "phone"],
      ["Anna Neri", "no_show", "manual"],
      ["Famiglia Conti", "confirmed", "walk_in"],
    ]);
    expect(list.body.items[0]?.customer).toMatchObject({ visitCount: 1, noShowCount: 0 });
    expect(list.body.items[1]?.customer).toMatchObject({ visitCount: 0, noShowCount: 1 });
    // history schedules nothing either: no reminders, no feedback request
    expect(t.jobs.sent.slice(jobsBefore).map((j) => j.name)).toEqual([]);

    const exported = await download(
      `${base}/bookings/export?from=2026-05-01&to=2026-05-31&status=completed`,
      fx.session.cookie,
    );
    const lines = exported.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "date,time,guests,name,email,phone,service,status,source,code,tables,room,notes,created_at",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(
      /^2026-05-15,20:00,4,Mario Rossi,mario@example\.com,,Cena,completed,phone,[A-Z0-9]{6},,,Compleanno,/,
    );
  });

  it("brings rooms, creation dates, references and unreadable phones over from another system", async () => {
    const fx = await createFixture(t);
    const base = `/api/v1/restaurants/${fx.restaurantId}`;
    const room = await api<{ id: string }>(
      t,
      "POST",
      `${base}/areas`,
      { name: "Sala sopra", seats: 40 },
      fx.session,
    );
    expect(room.status, JSON.stringify(room.body)).toBe(201);
    const csv = [
      "id;data;ora;persone;nome;telefono;email;stato;origine;note;creata_il;sala;newsletter",
      "101;2026-03-21;19:30;2;Ippolito;1111111;;confermato;telefono;;2026-03-21T18:00:43Z;sopra;false",
      "102;2026-03-22;20:00;6;Tony Manero;+39 393 5222227;;arrivato;sito;Tavolo tranquillo;2026-03-20 18:38:12;sotto;true",
      "103;2026-06-20;20:30;4;Anna Neri;+39 333 0000002;;confermato;sito;;2026-06-01T10:00:00Z;;",
      "104;2026-06-21;12:30;3;Luca Bruni;;luca@example.com;annullata;telefono;;;;",
    ].join("\n");
    const preview = await importCsv(`${base}/bookings/import`, csv, fx.session.cookie, true);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body).toMatchObject({ total: 4, created: 4, skipped: 0, errors: [] });
    expect(preview.body.warnings).toEqual([
      { line: 2, message: 'phone "1111111" could not be read; kept in the notes' },
      { line: 3, message: 'unknown room "sotto"; imported without a room' },
    ]);
    const run = await importCsv(`${base}/bookings/import`, csv, fx.session.cookie);
    expect(run.body).toMatchObject({ created: 4, skipped: 0 });
    // the same file again: every row carries its id and is already in
    const again = await importCsv(`${base}/bookings/import`, csv, fx.session.cookie);
    expect(again.body).toMatchObject({ created: 0, skipped: 4 });

    const list = await api<{
      items: Array<{
        status: string;
        source: string;
        areaId: string | null;
        notes: string | null;
        createdAt: string;
        customer: { name: string; phone: string | null };
      }>;
    }>(t, "GET", `${base}/bookings?from=2026-03-01&to=2026-06-30`, undefined, fx.session);
    expect(list.body.items).toHaveLength(4);
    const byName = Object.fromEntries(list.body.items.map((b) => [b.customer.name, b]));
    // a placeholder phone typed by staff: the booking keeps the date it was taken and its room
    expect(byName.Ippolito).toMatchObject({
      status: "completed",
      source: "phone",
      areaId: room.body.id,
      notes: "Tel. 1111111",
      createdAt: "2026-03-21T18:00:43.000Z",
      customer: { phone: null },
    });
    // "arrivato" on a past date is a visit; a bare timestamp is read in Rome time (CET in March)
    expect(byName["Tony Manero"]).toMatchObject({
      status: "completed",
      source: "widget",
      areaId: null,
      notes: "Tavolo tranquillo",
      createdAt: "2026-03-20T17:38:12.000Z",
      customer: { phone: "+393935222227" },
    });
    expect(byName["Anna Neri"]).toMatchObject({ status: "confirmed", source: "widget" });
    expect(byName["Luca Bruni"]).toMatchObject({ status: "cancelled", source: "phone" });
    const guests = await api<{ items: Array<{ name: string; marketingConsent: boolean }> }>(
      t,
      "GET",
      `${base}/customers?search=Tony`,
      undefined,
      fx.session,
    );
    expect(guests.body.items).toEqual([expect.objectContaining({ marketingConsent: true })]);
  });
});
