/**
 * Load test for the booking API: an "autocannon for bookings".
 *
 * Seeds a few restaurants through the real API, then hammers a running server
 * with concurrent guests and staff (availability lookups, bookings, cancels,
 * status changes, edits, waitlist, table assignment) and finally checks the
 * database for the invariants the engine promises: no overbooking, no
 * double-booked tables, no duplicate guests, consistent counters, no failed
 * events or jobs, and no 5xx responses.
 *
 *   LOAD_BASE_URL=http://127.0.0.1:3100 LOAD_DATABASE_URL=postgres://... \
 *     pnpm --filter @sitli/server exec tsx scripts/load-test.ts \
 *     [--scenario all|rush|idem|same-guest|reopen|tables|waitlist|mixed] \
 *     [--concurrency 50] [--duration 30] [--requests 200]
 *
 * The server must run with RATE_LIMIT=off and SIGNUP_MODE=open against the
 * same database. Every run creates fresh restaurants, so it can be repeated.
 */
import { randomInt, randomUUID } from "node:crypto";
import { Pool } from "pg";

// ---------- configuration

const BASE = (process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const DATABASE_URL =
  process.env.LOAD_DATABASE_URL ?? "postgres://sitli:sitli@localhost:5432/sitli_load";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}
const SCENARIO = arg("scenario", "all");
const CONCURRENCY = Number(arg("concurrency", "50"));
const DURATION_S = Number(arg("duration", "30"));
const REQUESTS = Number(arg("requests", "200"));

const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });

// ---------- tiny http client with stats

interface Res<T = unknown> {
  status: number;
  body: T;
  ms: number;
}

interface OpStats {
  n: number;
  statuses: Map<number, number>;
  lat: number[];
  samples: Map<string, string>;
}

const stats = new Map<string, OpStats>();
const failures: string[] = [];

function record(op: string, res: Res) {
  let s = stats.get(op);
  if (!s) {
    s = { n: 0, statuses: new Map(), lat: [], samples: new Map() };
    stats.set(op, s);
  }
  s.n += 1;
  s.statuses.set(res.status, (s.statuses.get(res.status) ?? 0) + 1);
  s.lat.push(res.ms);
  if (res.status >= 400) {
    const body = res.body as { code?: string; reason?: string } | null;
    const key = `${res.status} ${body?.code ?? "?"}${body?.reason ? `/${body.reason}` : ""}`;
    if (!s.samples.has(key)) s.samples.set(key, JSON.stringify(res.body).slice(0, 200));
  }
}

async function call<T = unknown>(
  op: string,
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<Res<T>> {
  const start = performance.now();
  let status = 0;
  let parsed: unknown = null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        origin: BASE,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    status = res.status;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
  } catch (error) {
    status = 0;
    parsed = { code: "network", message: error instanceof Error ? error.message : String(error) };
  }
  const out = { status, body: parsed as T, ms: performance.now() - start };
  record(op, out);
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

function printStats(title: string, elapsedMs: number) {
  console.log(`\n== ${title}: ${(elapsedMs / 1000).toFixed(1)}s`);
  const rows = [...stats.entries()].sort((a, b) => b[1].n - a[1].n);
  const pad = (s: string | number, w: number) => String(s).padStart(w);
  console.log(
    `${"op".padEnd(28)}${pad("n", 7)}${pad("2xx", 7)}${pad("4xx", 7)}${pad("5xx", 6)}${pad("p50", 8)}${pad("p95", 8)}${pad("p99", 8)}${pad("max", 8)}`,
  );
  let total = 0;
  for (const [op, s] of rows) {
    total += s.n;
    const sorted = [...s.lat].sort((a, b) => a - b);
    const count = (lo: number, hi: number) =>
      [...s.statuses.entries()].filter(([c]) => c >= lo && c < hi).reduce((a, [, n]) => a + n, 0);
    console.log(
      `${op.padEnd(28)}${pad(s.n, 7)}${pad(count(200, 300), 7)}${pad(count(400, 500), 7)}${pad(count(500, 600) + count(0, 1), 6)}${pad(percentile(sorted, 50).toFixed(0), 8)}${pad(percentile(sorted, 95).toFixed(0), 8)}${pad(percentile(sorted, 99).toFixed(0), 8)}${pad((sorted.at(-1) ?? 0).toFixed(0), 8)}`,
    );
    const codes = [...s.statuses.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, n]) => `${c}×${n}`)
      .join(" ");
    console.log(`  ${codes}`);
    for (const [key, sample] of s.samples) console.log(`  ${key}: ${sample}`);
  }
  console.log(`total ${total} requests, ${(total / (elapsedMs / 1000)).toFixed(1)} req/s`);
  stats.clear();
}

// ---------- seeding

interface Room {
  id: string;
  name: string;
  seats: number | null;
}
interface Table {
  id: string;
  name: string;
  areaId: string | null;
  minCovers: number;
  maxCovers: number;
}
interface Service {
  id: string;
  name: string;
  slotIntervalMinutes: number;
  maxCoversPerSlot: number | null;
}
interface Restaurant {
  label: string;
  id: string;
  slug: string;
  cookie: string;
  services: Service[];
  rooms: Room[];
  tables: Table[];
  /** Invariants that only hold without staff overrides. */
  strict: boolean;
}

interface Slot {
  serviceId: string;
  startsAt: string;
  startLocal: string;
  available: boolean;
  remainingCovers: number | null;
}
interface Availability {
  date: string;
  closed: boolean;
  slots: Slot[];
}

const everyDay = (start: string, end: string) =>
  Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [{ start, end }]]),
  );

async function must<T>(pending: Promise<Res<T>> | Res<T>, what: string): Promise<T> {
  const res = await pending;
  if (res.status < 200 || res.status >= 300)
    throw new Error(`${what} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function signUp(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: "password-1234", name: "Load Owner" }),
  });
  if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function seedRestaurant(
  label: string,
  opts: { tables: boolean; strict: boolean; dinnerCovers: number; lunchCovers: number },
): Promise<Restaurant> {
  const run = randomUUID().slice(0, 8);
  const cookie = await signUp(`owner-${label}-${run}@example.com`);
  const created = await must(
    call<{ id: string; slug: string }>(
      "seed",
      "POST",
      "/api/v1/restaurants",
      {
        name: `Load ${label} ${run}`,
        timezone: "Europe/Rome",
        locale: "it",
        email: `load-${label}-${run}@example.com`,
        phone: "+39 051 1234567",
        seats: 60,
      },
      cookie,
    ),
    "restaurant",
  );
  const rid = created.id;
  const base = `/api/v1/restaurants/${rid}`;
  const rooms = await must(
    call<Room[]>("seed", "GET", `${base}/areas`, undefined, cookie),
    "areas",
  );
  const terrace = await must(
    call<Room>(
      "seed",
      "POST",
      `${base}/areas`,
      { name: "Terrazza", seats: 20, sortOrder: 1 },
      cookie,
    ),
    "area",
  );
  rooms.push(terrace);
  const services: Service[] = [];
  services.push(
    await must(
      call<Service>(
        "seed",
        "POST",
        `${base}/services`,
        {
          name: "Pranzo",
          weeklyHours: everyDay("12:00", "14:30"),
          slotIntervalMinutes: 30,
          durationMinutes: 90,
          maxCoversPerSlot: opts.lunchCovers,
          sortOrder: 0,
        },
        cookie,
      ),
      "service",
    ),
  );
  services.push(
    await must(
      call<Service>(
        "seed",
        "POST",
        `${base}/services`,
        {
          name: "Cena",
          weeklyHours: everyDay("19:00", "22:30"),
          slotIntervalMinutes: 15,
          durationMinutes: 120,
          maxCoversPerSlot: opts.dinnerCovers,
          maxBookingsPerSlot: 8,
          sortOrder: 1,
        },
        cookie,
      ),
      "service",
    ),
  );
  await must(
    call(
      "seed",
      "PUT",
      `${base}/policy`,
      {
        minLeadMinutes: 0,
        maxAdvanceDays: 90,
        minPartySize: 1,
        maxPartySize: 12,
        autoConfirm: true,
        cancellationCutoffMinutes: 0,
        largePartyThreshold: 8,
        waitlistEnabled: true,
        waitlistAutoOffer: true,
        waitlistOfferMinutes: 15,
      },
      cookie,
    ),
    "policy",
  );
  const tables: Table[] = [];
  if (opts.tables) {
    const sala = rooms[0] as Room;
    const plan: Array<[Room, number, number, number]> = [
      [sala, 8, 1, 2],
      [sala, 6, 3, 4],
      [sala, 2, 5, 6],
      [terrace, 4, 2, 4],
    ];
    let n = 1;
    for (const [room, count, min, max] of plan) {
      for (let i = 0; i < count; i += 1) {
        tables.push(
          await must(
            call<Table>(
              "seed",
              "POST",
              `${base}/tables`,
              {
                name: `T${n}`,
                areaId: room.id,
                minCovers: min,
                maxCovers: max,
                joinable: max <= 4,
                sortOrder: n,
                x: (n * 7) % 90,
                y: Math.floor(n / 13) * 20,
              },
              cookie,
            ),
            "table",
          ),
        );
        n += 1;
      }
    }
  }
  return {
    label,
    id: rid,
    slug: created.slug,
    cookie,
    services,
    rooms,
    tables,
    strict: opts.strict,
  };
}

// ---------- guests and slots

interface Guest {
  name: string;
  email: string;
  phone: string;
}
const RUN = randomUUID().slice(0, 6);
function guest(i: number): Guest {
  return {
    name: `Guest ${i}`,
    email: `guest${i}-${RUN}@example.com`,
    phone: `+393${randomInt(2, 10)}${String(i).padStart(8, "0")}`,
  };
}
const pick = <T>(xs: readonly T[]): T => xs[randomInt(0, xs.length)] as T;
const chance = (p: number) => Math.random() < p;

function isoDate(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const DATES = Array.from({ length: 12 }, (_, i) => isoDate(i + 2));

const slotCache = new Map<string, Availability>();

async function availability(
  r: Restaurant,
  date: string,
  partySize: number,
  op = "availability GET",
) {
  const res = await call<Availability>(
    op,
    "GET",
    `/api/public/v1/restaurants/${r.slug}/availability?date=${date}&partySize=${partySize}`,
  );
  if (res.status === 200) slotCache.set(`${r.id}:${date}`, res.body);
  return res;
}

function cachedSlots(r: Restaurant, date: string): Slot[] {
  return slotCache.get(`${r.id}:${date}`)?.slots ?? [];
}

interface Created {
  id: string;
  token: string;
  restaurant: Restaurant;
  serviceId: string;
  startsAt: string;
  partySize: number;
  status: string;
}
const created: Created[] = [];

interface PublicBooking {
  id: string;
  status: string;
  manageUrl: string;
  confirmationCode: string;
}

async function bookAsGuest(
  r: Restaurant,
  input: {
    serviceId: string;
    startsAt: string;
    partySize: number;
    guest: Guest;
    areaId?: string | null;
    idempotencyKey?: string;
  },
  op = "booking POST (guest)",
) {
  const res = await call<PublicBooking>(
    op,
    "POST",
    `/api/public/v1/restaurants/${r.slug}/bookings`,
    {
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      partySize: input.partySize,
      ...(input.areaId !== undefined ? { areaId: input.areaId } : {}),
      guest: { ...input.guest, locale: "it" },
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    },
  );
  if (res.status === 201) {
    created.push({
      id: res.body.id,
      token: res.body.manageUrl.split("/").pop() ?? "",
      restaurant: r,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      partySize: input.partySize,
      status: res.body.status,
    });
  }
  return res;
}

// ---------- workers

async function runWorkers(
  concurrency: number,
  fn: (i: number) => Promise<void>,
  limit: { requests?: number; durationMs?: number },
): Promise<number> {
  const start = performance.now();
  let next = 0;
  const stopAt = limit.durationMs ? start + limit.durationMs : Number.POSITIVE_INFINITY;
  const max = limit.requests ?? Number.POSITIVE_INFINITY;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (performance.now() < stopAt) {
        const i = next;
        next += 1;
        if (i >= max) break;
        try {
          await fn(i);
        } catch (error) {
          failures.push(`worker error: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }),
  );
  return performance.now() - start;
}

// ---------- invariants (SQL)

const ACTIVE = "('pending','confirmed','seated')";
const violations: string[] = [];
function violation(scope: string, msg: string) {
  violations.push(`[${scope}] ${msg}`);
}

async function checkPacing(r: Restaurant, scope: string) {
  const { rows } = await pool.query(
    `select b.service_id, b.starts_at, sum(b.party_size)::int covers, count(*)::int n,
            s.max_covers_per_slot mc, s.max_bookings_per_slot mb, s.name
       from booking b join service s on s.id = b.service_id
      where b.restaurant_id = $1 and b.status in ${ACTIVE}
      group by 1, 2, mc, mb, s.name
     having (s.max_covers_per_slot is not null and sum(b.party_size) > s.max_covers_per_slot)
         or (s.max_bookings_per_slot is not null and count(*) > s.max_bookings_per_slot)`,
    [r.id],
  );
  for (const x of rows)
    violation(
      scope,
      `pacing exceeded: ${x.name} ${new Date(x.starts_at).toISOString()} covers=${x.covers}/${x.mc} bookings=${x.n}/${x.mb}`,
    );
}

async function checkRooms(r: Restaurant, scope: string) {
  const { rows: rooms } = await pool.query(
    "select id, name, seats, active from area where restaurant_id = $1",
    [r.id],
  );
  const { rows } = await pool.query(
    `select id, area_id, starts_at, ends_at, party_size from booking
      where restaurant_id = $1 and status in ${ACTIVE}`,
    [r.id],
  );
  const open = rooms.filter((x) => x.active);
  const total = open.every((x) => x.seats !== null)
    ? open.reduce((a, x) => a + Number(x.seats), 0)
    : null;
  const peakAt = (t: number, filter: (b: (typeof rows)[number]) => boolean) =>
    rows
      .filter(
        (b) =>
          filter(b) && new Date(b.starts_at).getTime() <= t && new Date(b.ends_at).getTime() > t,
      )
      .reduce((a, b) => a + b.party_size, 0);
  let worst = 0;
  for (const b of rows) {
    const t = new Date(b.starts_at).getTime();
    if (total !== null) {
      const covers = peakAt(t, () => true);
      worst = Math.max(worst, covers);
      if (covers > total)
        violation(
          scope,
          `house seats exceeded at ${b.starts_at.toISOString()}: ${covers} > ${total}`,
        );
    }
    if (b.area_id) {
      const room = rooms.find((x) => x.id === b.area_id);
      if (room?.seats !== null && room) {
        const covers = peakAt(t, (x) => x.area_id === room.id);
        if (covers > Number(room.seats))
          violation(
            scope,
            `room ${room.name} seats exceeded at ${b.starts_at.toISOString()}: ${covers} > ${room.seats}`,
          );
      }
    }
  }
  return { total, worst, active: rows.length };
}

async function checkTables(r: Restaurant, scope: string, requireAssignment: boolean) {
  const { rows: clashes } = await pool.query(
    `select dt.name, b1.id b1, b2.id b2, b1.starts_at s1, b2.starts_at s2
       from booking_table t1 join booking_table t2 on t1.table_id = t2.table_id and t1.booking_id < t2.booking_id
       join booking b1 on b1.id = t1.booking_id join booking b2 on b2.id = t2.booking_id
       join dining_table dt on dt.id = t1.table_id
      where b1.restaurant_id = $1 and b1.status in ${ACTIVE} and b2.status in ${ACTIVE}
        and b1.starts_at < b2.ends_at and b2.starts_at < b1.ends_at`,
    [r.id],
  );
  for (const c of clashes)
    violation(
      scope,
      `table ${c.name} double-booked: ${c.b1} (${c.s1.toISOString()}) and ${c.b2} (${c.s2.toISOString()})`,
    );
  const { rows: fit } = await pool.query(
    `select b.id, b.party_size, sum(dt.max_covers)::int mx, sum(dt.min_covers)::int mn
       from booking b join booking_table bt on bt.booking_id = b.id join dining_table dt on dt.id = bt.table_id
      where b.restaurant_id = $1 and b.status in ${ACTIVE}
      group by b.id having b.party_size > sum(dt.max_covers) or b.party_size < sum(dt.min_covers)`,
    [r.id],
  );
  // staff may seat a small party on a big table by hand: only automatic seating must fit
  if (requireAssignment)
    for (const f of fit)
      violation(
        scope,
        `booking ${f.id} party ${f.party_size} does not fit its tables (${f.mn}–${f.mx})`,
      );
  if (requireAssignment) {
    const { rows } = await pool.query(
      `select count(*)::int n from booking b where b.restaurant_id = $1 and b.status in ${ACTIVE}
          and not exists (select 1 from booking_table bt where bt.booking_id = b.id)`,
      [r.id],
    );
    if (rows[0].n > 0) violation(scope, `${rows[0].n} active bookings have no table`);
  }
}

async function checkCustomers(r: Restaurant, scope: string) {
  const { rows: emails } = await pool.query(
    `select email, count(*)::int n from customer where restaurant_id = $1 and email is not null
      group by email having count(*) > 1`,
    [r.id],
  );
  for (const e of emails) violation(scope, `duplicate customer email ${e.email} ×${e.n}`);
  const { rows: phones } = await pool.query(
    `select phone, count(*)::int n from customer where restaurant_id = $1 and phone is not null
      group by phone having count(*) > 1`,
    [r.id],
  );
  for (const p of phones) violation(scope, `duplicate customer phone ${p.phone} ×${p.n}`);
  const { rows: counters } = await pool.query(
    `select c.id, c.name, c.visit_count, c.no_show_count,
       (select count(*) from audit_log a join booking b on b.id::text = a.entity_id
         where b.customer_id = c.id and (a.action = 'booking.seat'
            or (a.action = 'booking.created' and a.data->>'status' = 'seated')))::int expected_visits,
       (select count(*) from audit_log a join booking b on b.id::text = a.entity_id
         where b.customer_id = c.id and a.action = 'booking.no_show')::int expected_no_shows
       from customer c where c.restaurant_id = $1`,
    [r.id],
  );
  for (const c of counters) {
    if (c.visit_count !== c.expected_visits)
      violation(
        scope,
        `customer ${c.name} visitCount=${c.visit_count} expected ${c.expected_visits}`,
      );
    if (c.no_show_count !== c.expected_no_shows)
      violation(
        scope,
        `customer ${c.name} noShowCount=${c.no_show_count} expected ${c.expected_no_shows}`,
      );
  }
}

async function checkWaitlist(r: Restaurant, scope: string) {
  const { rows } = await pool.query(
    `select w.id, w.status, w.booking_id, w.offered_service_id, w.offered_starts_at, w.offer_expires_at,
            w.service_date, b.status booking_status
       from waitlist_entry w left join booking b on b.id = w.booking_id
      where w.restaurant_id = $1`,
    [r.id],
  );
  const offeredPerDate = new Map<string, number>();
  for (const w of rows) {
    if (w.status === "booked" && (!w.booking_id || !w.booking_status))
      violation(scope, `waitlist entry ${w.id} is booked without a booking`);
    if (w.status === "offered") {
      if (!w.offered_service_id || !w.offered_starts_at || !w.offer_expires_at)
        violation(scope, `waitlist entry ${w.id} is offered without offer details`);
      const d = String(w.service_date);
      offeredPerDate.set(d, (offeredPerDate.get(d) ?? 0) + 1);
    }
  }
  for (const [d, n] of offeredPerDate)
    if (n > 1) violation(scope, `${n} open offers on ${d} (expected at most one at a time)`);
  return rows;
}

async function checkSystem(scope: string) {
  const { rows: outbox } = await pool.query(
    `select type, attempts, last_error, published_at from outbox_event
      where attempts > 0 or last_error is not null order by occurred_at desc limit 10`,
  );
  for (const o of outbox)
    violation(scope, `outbox ${o.type} attempts=${o.attempts}: ${o.last_error}`);
  const { rows: jobs } = await pool.query(
    "select name, state, count(*)::int n from pgboss.job group by 1, 2 order by 1, 2",
  );
  const failed = jobs.filter((j) => j.state === "failed");
  for (const j of failed) violation(scope, `job ${j.name} failed ×${j.n}`);
  return jobs;
}

/** Wait for the outbox and the immediate jobs to drain; report how long that took. */
async function waitForQuiet(scope: string, maxMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { rows } = await pool.query(
      `select (select count(*) from outbox_event where published_at is null and attempts < 10)::int pending,
              (select count(*) from pgboss.job where state in ('created','active','retry') and start_after <= now())::int jobs`,
    );
    if (rows[0].pending === 0 && rows[0].jobs === 0) {
      const s = (Date.now() - start) / 1000;
      if (s >= 1) console.log(`  events and jobs drained in ${s.toFixed(1)}s`);
      return;
    }
    await new Promise((f) => setTimeout(f, 500));
  }
  const { rows } = await pool.query(
    `select name, count(*)::int n from pgboss.job
      where state in ('created','active','retry') and start_after <= now() group by 1`,
  );
  violation(
    scope,
    `queue still busy after ${maxMs / 1000}s: ${rows.map((r) => `${r.name}×${r.n}`).join(" ")}`,
  );
}

async function checkAll(r: Restaurant, scope: string) {
  await waitForQuiet(scope);
  if (r.strict) {
    await checkPacing(r, scope);
    const rooms = await checkRooms(r, scope);
    console.log(
      `  ${r.label}: ${rooms.active} active bookings, peak ${rooms.worst}/${rooms.total ?? "∞"} seats`,
    );
  }
  await checkTables(r, scope, r.strict && r.tables.length > 0);
  await checkCustomers(r, scope);
  await checkWaitlist(r, scope);
  await checkSystem(scope);
}

function report(scope: string) {
  const mine = violations.filter((v) => v.startsWith(`[${scope}]`));
  if (mine.length === 0) console.log(`  invariants OK (${scope})`);
  else {
    console.log(`  ${mine.length} VIOLATIONS (${scope}):`);
    for (const v of mine.slice(0, 15)) console.log(`   - ${v}`);
    if (mine.length > 15) console.log(`   … ${mine.length - 15} more`);
  }
}

// ---------- scenarios

/** Everyone wants the same table at the same time. */
async function rush(r: Restaurant) {
  const date = DATES[0] as string;
  await availability(r, date, 2);
  const dinner = r.services[1] as Service;
  const slot = cachedSlots(r, date).find(
    (s) => s.serviceId === dinner.id && s.startLocal === "20:00",
  );
  if (!slot) throw new Error("no 20:00 slot");
  const elapsed = await runWorkers(
    CONCURRENCY,
    async (i) => {
      await bookAsGuest(r, {
        serviceId: dinner.id,
        startsAt: slot.startsAt,
        partySize: randomInt(1, 5),
        guest: guest(1000 + i),
      });
    },
    { requests: REQUESTS },
  );
  printStats(`rush: ${REQUESTS} guests, one slot (${r.label})`, elapsed);
  await checkAll(r, "rush");
  report("rush");
}

/** The same request retried many times at once must yield one booking. */
async function idem(r: Restaurant) {
  const date = DATES[1] as string;
  await availability(r, date, 2);
  const lunch = r.services[0] as Service;
  const slot = cachedSlots(r, date).find((s) => s.serviceId === lunch.id && s.available);
  if (!slot) throw new Error("no lunch slot");
  const key = `retry-${randomUUID()}`;
  const g = guest(2000);
  const ids = new Set<string>();
  const elapsed = await runWorkers(
    20,
    async () => {
      const res = await bookAsGuest(
        r,
        {
          serviceId: lunch.id,
          startsAt: slot.startsAt,
          partySize: 2,
          guest: g,
          idempotencyKey: key,
        },
        "booking POST (same key)",
      );
      if (res.status === 201) ids.add(res.body.id);
    },
    { requests: 40 },
  );
  printStats("idempotency: 40 identical retries", elapsed);
  const { rows } = await pool.query(
    "select count(*)::int n from booking where restaurant_id = $1 and idempotency_key = $2",
    [r.id, key],
  );
  if (rows[0].n !== 1) violation("idem", `${rows[0].n} bookings share the idempotency key`);
  if (ids.size > 1) violation("idem", `retries returned ${ids.size} different booking ids`);
  await checkAll(r, "idem");
  report("idem");
}

/** One guest booking several dates at once must stay one guest-book entry. */
async function sameGuest(r: Restaurant) {
  const g = guest(3000);
  const lunch = r.services[0] as Service;
  for (const d of DATES) await availability(r, d, 2);
  const elapsed = await runWorkers(
    CONCURRENCY,
    async (i) => {
      const date = DATES[i % DATES.length] as string;
      const slots = cachedSlots(r, date).filter((s) => s.serviceId === lunch.id);
      await bookAsGuest(
        r,
        { serviceId: lunch.id, startsAt: pick(slots).startsAt, partySize: 2, guest: g },
        "booking POST (one guest)",
      );
    },
    { requests: 40 },
  );
  printStats("same guest: 40 bookings, 12 dates", elapsed);
  await checkAll(r, "same-guest");
  report("same-guest");
}

/** Cancel, let other parties take every table, then reopen. */
async function reopen(r: Restaurant) {
  const date = DATES[2] as string;
  await availability(r, date, 2);
  const dinner = r.services[1] as Service;
  const slotAt = (time: string) => {
    const s = cachedSlots(r, date).find((x) => x.serviceId === dinner.id && x.startLocal === time);
    if (!s) throw new Error(`no ${time} slot`);
    return s;
  };
  const start = performance.now();
  const first = await bookAsGuest(r, {
    serviceId: dinner.id,
    startsAt: slotAt("20:30").startsAt,
    partySize: 2,
    guest: guest(4000),
  });
  const firstId = first.body.id;
  const actions = `/api/v1/restaurants/${r.id}/bookings/${firstId}/actions`;
  await call(
    "action POST (staff)",
    "POST",
    actions,
    { action: "cancel", reason: "test" },
    r.cookie,
  );
  // twelve parties of two at 20:00 and 20:15 keep every table that fits two busy until 22:00
  const twoTops = r.tables.filter((t) => t.minCovers <= 2 && t.maxCovers >= 2).length;
  for (let i = 0; i < twoTops; i += 1)
    await bookAsGuest(r, {
      serviceId: dinner.id,
      startsAt: slotAt(i < 8 ? "20:00" : "20:15").startsAt,
      partySize: 2,
      guest: guest(4001 + i),
    });
  const res = await call<{ status: string; tables: unknown[] }>(
    "action POST (reopen)",
    "POST",
    actions,
    { action: "reopen" },
    r.cookie,
  );
  console.log(
    `  reopen after the tables were taken → ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`,
  );
  if (res.status !== 409)
    violation("reopen", `reopen succeeded although no table was free (${res.status})`);
  printStats(`reopen (${r.label})`, performance.now() - start);
  await checkAll(r, "reopen");
  report("reopen");
}

/** Staff seat several parties on the same table at the same time. */
async function manualTables(r: Restaurant) {
  const date = DATES[3] as string;
  await availability(r, date, 2);
  const dinner = r.services[1] as Service;
  const slot = cachedSlots(r, date).find(
    (s) => s.serviceId === dinner.id && s.startLocal === "19:30",
  );
  if (!slot) throw new Error("no slot");
  const start = performance.now();
  const ids: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await bookAsGuest(r, {
      serviceId: dinner.id,
      startsAt: slot.startsAt,
      partySize: 2,
      guest: guest(5000 + i),
    });
    if (res.status === 201) ids.push(res.body.id);
  }
  const target = r.tables.find((t) => t.maxCovers === 6) as Table;
  const elapsed = await runWorkers(
    ids.length,
    async (i) => {
      await call(
        "tables PUT (manual)",
        "PUT",
        `/api/v1/restaurants/${r.id}/bookings/${ids[i]}/tables`,
        { tableIds: [target.id] },
        r.cookie,
      );
    },
    { requests: ids.length },
  );
  printStats(`manual table assignment race (${r.label})`, elapsed + (performance.now() - start));
  await checkAll(r, "tables");
  report("tables");
}

/** A full night, a queue of hopefuls, cancellations and offers at the same time. */
async function waitlist(r: Restaurant) {
  const date = DATES[4] as string;
  const dinner = r.services[1] as Service;
  const start = performance.now();
  // fill the dinner
  let full = false;
  let i = 0;
  while (!full && i < 400) {
    await availability(r, date, 4);
    const open = cachedSlots(r, date).filter((s) => s.serviceId === dinner.id && s.available);
    if (open.length === 0) {
      full = true;
      break;
    }
    await Promise.all(
      open.slice(0, 10).map((s) =>
        bookAsGuest(r, {
          serviceId: dinner.id,
          startsAt: s.startsAt,
          partySize: 4,
          guest: guest(6000 + i++),
        }),
      ),
    );
  }
  const mine = created.filter(
    (c) => c.restaurant === r && c.serviceId === dinner.id && c.startsAt.startsWith(date),
  );
  console.log(`  dinner ${date} filled with ${mine.length} bookings`);
  // queue 15 hopefuls
  const entries: Array<{ token: string }> = [];
  await runWorkers(
    5,
    async (k) => {
      const res = await call<{ manageUrl: string }>(
        "waitlist POST (guest)",
        "POST",
        `/api/public/v1/restaurants/${r.slug}/waitlist`,
        { serviceDate: date, partySize: 2, guest: { ...guest(6500 + k), locale: "it" } },
      );
      if (res.status === 201) entries.push({ token: res.body.manageUrl.split("/").pop() ?? "" });
    },
    { requests: 15 },
  );
  // cancel a third of the bookings concurrently while guests poll and accept offers
  const toCancel = mine.filter((_, idx) => idx % 3 === 0);
  const accepted: string[] = [];
  await Promise.all([
    runWorkers(
      10,
      async (k) => {
        const c = toCancel[k] as Created;
        await call("cancel POST (guest)", "POST", `/api/public/v1/bookings/${c.token}/cancel`, {
          reason: "load",
        });
      },
      { requests: toCancel.length },
    ),
    runWorkers(
      5,
      async () => {
        for (let round = 0; round < 40; round += 1) {
          for (const e of entries) {
            const res = await call<{ status: string; canAccept: boolean }>(
              "waitlist GET (guest)",
              "GET",
              `/api/public/v1/waitlist/${e.token}`,
            );
            if (res.status === 200 && res.body.canAccept) {
              const acc = await call<{ id: string }>(
                "waitlist accept POST",
                "POST",
                `/api/public/v1/waitlist/${e.token}/accept`,
                {},
              );
              if (acc.status === 201) accepted.push(e.token);
            }
          }
          await new Promise((f) => setTimeout(f, 250));
        }
      },
      { requests: 5 },
    ),
  ]);
  console.log(`  ${toCancel.length} cancellations, ${accepted.length} offers accepted`);
  printStats(`waitlist (${r.label})`, performance.now() - start);
  await checkAll(r, "waitlist");
  const rows = await checkWaitlist(r, "waitlist");
  const byStatus = new Map<string, number>();
  for (const w of rows) byStatus.set(w.status, (byStatus.get(w.status) ?? 0) + 1);
  console.log(
    `  waitlist states: ${[...byStatus.entries()].map(([s, n]) => `${s}×${n}`).join(" ")}`,
  );
  report("waitlist");
}

/** Realistic traffic mix: guests browse and book, staff work the floor. */
async function mixed(rests: Restaurant[]) {
  for (const r of rests) for (const d of DATES.slice(0, 6)) await availability(r, d, 2);
  stats.clear();
  const staffActions = ["confirm", "seat", "complete", "cancel", "no_show", "reopen"] as const;
  const elapsed = await runWorkers(
    CONCURRENCY,
    async (i) => {
      const r = pick(rests);
      const date = pick(DATES.slice(0, 6));
      const roll = Math.random();
      if (roll < 0.3) {
        await availability(r, date, randomInt(1, 7));
      } else if (roll < 0.62) {
        const slots = cachedSlots(r, date);
        if (slots.length === 0) return;
        const open = slots.filter((s) => s.available);
        const slot = open.length > 0 && chance(0.85) ? pick(open) : pick(slots);
        const partySize = chance(0.1) ? randomInt(8, 11) : randomInt(1, 7);
        const areaId = chance(0.2) && r.rooms.length > 0 ? pick(r.rooms).id : undefined;
        await bookAsGuest(r, {
          serviceId: slot.serviceId,
          startsAt: slot.startsAt,
          partySize,
          guest: guest(randomInt(0, 400)),
          areaId,
        });
      } else if (roll < 0.72) {
        const mine = created.filter((c) => c.restaurant === r);
        if (mine.length === 0) return;
        const c = pick(mine);
        await call("cancel POST (guest)", "POST", `/api/public/v1/bookings/${c.token}/cancel`, {
          reason: "changed plans",
        });
      } else if (roll < 0.84) {
        const mine = created.filter((c) => c.restaurant === r);
        if (mine.length === 0) return;
        const c = pick(mine);
        await call(
          "action POST (staff)",
          "POST",
          `/api/v1/restaurants/${r.id}/bookings/${c.id}/actions`,
          { action: pick(staffActions) },
          r.cookie,
        );
      } else if (roll < 0.9) {
        const mine = created.filter((c) => c.restaurant === r);
        if (mine.length === 0) return;
        const c = pick(mine);
        const slots = cachedSlots(r, pick(DATES.slice(0, 6)));
        if (slots.length === 0) return;
        const slot = pick(slots);
        await call(
          "booking PATCH (staff)",
          "PATCH",
          `/api/v1/restaurants/${r.id}/bookings/${c.id}`,
          chance(0.5)
            ? { startsAt: slot.startsAt, serviceId: slot.serviceId }
            : { partySize: randomInt(1, 7), notes: `edited ${i}` },
          r.cookie,
        );
      } else if (roll < 0.93) {
        await call(
          "waitlist POST (guest)",
          "POST",
          `/api/public/v1/restaurants/${r.slug}/waitlist`,
          {
            serviceDate: date,
            partySize: randomInt(2, 5),
            guest: { ...guest(randomInt(0, 400)), locale: "it" },
          },
        );
      } else if (roll < 0.96) {
        await call(
          "bookings GET (staff)",
          "GET",
          `/api/v1/restaurants/${r.id}/bookings?date=${date}`,
          undefined,
          r.cookie,
        );
      } else if (!r.strict) {
        // staff overrides on the free-for-all restaurant only
        const slots = cachedSlots(r, date);
        if (slots.length === 0) return;
        const slot = pick(slots);
        const g = guest(randomInt(0, 400));
        await call<{ id: string }>(
          "booking POST (staff)",
          "POST",
          `/api/v1/restaurants/${r.id}/bookings`,
          {
            serviceId: slot.serviceId,
            startsAt: slot.startsAt,
            partySize: randomInt(1, 9),
            customer: { name: g.name, email: g.email, phone: g.phone },
            source: pick(["phone", "walk_in", "manual"] as const),
            seatNow: chance(0.3),
            ignoreCapacity: chance(0.5),
          },
          r.cookie,
        );
        if (chance(0.2) && r.rooms.length > 1) {
          const room = pick(r.rooms);
          await call(
            "area PUT (toggle room)",
            "PUT",
            `/api/v1/restaurants/${r.id}/areas/${room.id}`,
            { name: room.name, seats: room.seats, active: chance(0.7), sortOrder: 0 },
            r.cookie,
          );
        }
      } else {
        // strict restaurants: plain staff booking without overrides
        const slots = cachedSlots(r, date).filter((s) => s.available);
        if (slots.length === 0) return;
        const slot = pick(slots);
        const g = guest(randomInt(0, 400));
        await call(
          "booking POST (staff)",
          "POST",
          `/api/v1/restaurants/${r.id}/bookings`,
          {
            serviceId: slot.serviceId,
            startsAt: slot.startsAt,
            partySize: randomInt(1, 7),
            customer: { name: g.name, email: g.email, phone: g.phone },
            source: "phone",
          },
          r.cookie,
        );
      }
    },
    { durationMs: DURATION_S * 1000 },
  );
  printStats(`mixed traffic: ${CONCURRENCY} workers for ${DURATION_S}s`, elapsed);
  for (const r of rests) {
    await checkAll(r, `mixed:${r.label}`);
    report(`mixed:${r.label}`);
  }
}

// ---------- main

async function main() {
  console.log(`target ${BASE}, scenario ${SCENARIO}, concurrency ${CONCURRENCY}`);
  const health = await fetch(`${BASE}/api/health`)
    .then((r) => r.status)
    .catch(() => 0);
  if (health !== 200) throw new Error(`server not reachable at ${BASE}`);

  const t0 = performance.now();
  const strictTables = await seedRestaurant("tables", {
    tables: true,
    strict: true,
    dinnerCovers: 24,
    lunchCovers: 30,
  });
  const strictPacing = await seedRestaurant("pacing", {
    tables: false,
    strict: true,
    dinnerCovers: 16,
    lunchCovers: 20,
  });
  const loose = await seedRestaurant("loose", {
    tables: true,
    strict: false,
    dinnerCovers: 24,
    lunchCovers: 30,
  });
  console.log(`seeded 3 restaurants in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  stats.clear();

  const run = (name: string) => SCENARIO === "all" || SCENARIO === name;
  if (run("rush")) {
    await rush(strictTables);
    await rush(strictPacing);
  }
  if (run("idem")) await idem(strictTables);
  if (run("same-guest")) await sameGuest(strictPacing);
  if (run("reopen")) await reopen(strictTables);
  if (run("tables")) await manualTables(loose);
  if (run("waitlist")) await waitlist(strictPacing);
  if (run("mixed")) await mixed([strictTables, strictPacing, loose]);

  console.log("\n== summary");
  if (failures.length > 0) {
    console.log(`${failures.length} client-side failures, e.g. ${failures[0]}`);
  }
  if (violations.length === 0) console.log("all invariants held");
  else {
    console.log(`${violations.length} invariant violations in total`);
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(2);
});
