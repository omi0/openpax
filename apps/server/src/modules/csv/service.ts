import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  type BookingSource,
  type BookingStatus,
  instantToLocal,
  isLocalDate,
  isLocalTime,
  localToInstant,
  parseLocalTime,
} from "@openpax/core";
import { booking, customer, service } from "@openpax/db";
import {
  BOOKING_CSV_COLUMNS,
  CUSTOMER_CSV_COLUMNS,
  type ExportBookingsQuery,
  type ExportCustomersQuery,
  type ImportResultDto,
} from "@openpax/shared";
import { and, asc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { parseCsv, toCsv } from "../../lib/csv.js";
import { upsertCustomer } from "../../lib/customers.js";
import { ApiError } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import { createBooking } from "../bookings/index.js";

const EXPORT_LIMIT = 20_000;
const IMPORT_LIMIT = 5_000;

function localTime(instant: Date, timezone: string): string {
  const local = instantToLocal(instant, timezone);
  const h = Math.floor(local.minutesOfDay / 60);
  const m = local.minutesOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------- export

export async function exportBookings(
  ctx: AppContext,
  r: RestaurantRow,
  q: ExportBookingsQuery,
): Promise<string> {
  const conditions = [eq(booking.restaurantId, r.id)];
  if (q.from) conditions.push(gte(booking.serviceDate, q.from));
  if (q.to) conditions.push(lte(booking.serviceDate, q.to));
  if (q.status && q.status.length > 0) conditions.push(inArray(booking.status, q.status));
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(
      ilike(customer.name, term),
      ilike(customer.email, term),
      ilike(customer.phone, term),
      ilike(booking.confirmationCode, term),
    );
    if (match) conditions.push(match);
  }
  const rows = await ctx.db
    .select({
      booking,
      customer,
      serviceName: service.name,
      tables: sql<string>`coalesce((
        select string_agg(dt.name, ' + ' order by dt.sort_order, dt.name)
        from booking_table bt join dining_table dt on dt.id = bt.table_id
        where bt.booking_id = ${booking.id}), '')`,
    })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .where(and(...conditions))
    .orderBy(asc(booking.startsAt))
    .limit(EXPORT_LIMIT);
  return toCsv(
    [...BOOKING_CSV_COLUMNS],
    rows.map((x) => ({
      date: x.booking.serviceDate,
      time: localTime(x.booking.startsAt, r.timezone),
      guests: x.booking.partySize,
      name: x.customer.name,
      email: x.customer.email,
      phone: x.customer.phone,
      service: x.serviceName,
      status: x.booking.status,
      source: x.booking.source,
      code: x.booking.confirmationCode,
      tables: x.tables,
      notes: x.booking.notes,
      created_at: x.booking.createdAt.toISOString(),
    })),
  );
}

export async function exportCustomers(
  ctx: AppContext,
  r: RestaurantRow,
  q: ExportCustomersQuery,
): Promise<string> {
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
  const rows = await ctx.db
    .select()
    .from(customer)
    .where(and(...conditions))
    .orderBy(asc(customer.name))
    .limit(EXPORT_LIMIT);
  return toCsv(
    [...CUSTOMER_CSV_COLUMNS],
    rows.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      locale: c.locale,
      tags: c.tags.join(", "),
      notes: c.notes,
      visits: c.visitCount,
      no_shows: c.noShowCount,
      cancellations: c.cancelCount,
      marketing_consent: c.marketingConsent,
      last_visit: c.lastVisitAt?.toISOString() ?? "",
      created_at: c.createdAt.toISOString(),
    })),
  );
}

// ---------- import

type Row = Record<string, string>;
interface Report {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
}

/** Accept a few header spellings (English, Italian, the export's own). */
const ALIASES: Record<string, string[]> = {
  name: ["name", "nome", "guest", "ospite", "nome_cliente", "cliente"],
  email: ["email", "e_mail", "mail"],
  phone: ["phone", "telefono", "tel", "phone_number", "cellulare"],
  tags: ["tags", "tag", "etichette"],
  notes: ["notes", "note", "notes_"],
  locale: ["locale", "lingua", "language"],
  marketing_consent: ["marketing_consent", "marketing", "consenso_marketing", "newsletter"],
  date: ["date", "data", "service_date", "giorno"],
  time: ["time", "ora", "orario", "start_time"],
  guests: ["guests", "party_size", "persone", "coperti", "covers", "pax"],
  service: ["service", "servizio"],
  status: ["status", "stato"],
  source: ["source", "origine", "canale"],
};

function pick(row: Row, field: string): string {
  for (const key of ALIASES[field] ?? [field]) {
    const v = row[key];
    if (v !== undefined && v !== "") return v.trim();
  }
  return "";
}

const truthy = (v: string) =>
  ["1", "true", "yes", "y", "si", "sì", "ok", "x"].includes(v.toLowerCase());

function parseRows(text: string): { rows: Row[]; header: string[] } {
  const parsed = parseCsv(text);
  if (parsed.header.length === 0)
    throw ApiError.badRequest("empty_csv", "The file has no header row");
  if (parsed.rows.length > IMPORT_LIMIT)
    throw ApiError.badRequest("too_many_rows", `At most ${IMPORT_LIMIT} rows per import`);
  return { rows: parsed.rows, header: parsed.header };
}

function requireColumns(header: string[], fields: string[]) {
  const missing = fields.filter((f) => !(ALIASES[f] ?? [f]).some((a) => header.includes(a)));
  if (missing.length > 0)
    throw ApiError.badRequest("missing_columns", `Missing columns: ${missing.join(", ")}`, {
      missing,
    });
}

export async function importCustomers(
  ctx: AppContext,
  r: RestaurantRow,
  text: string,
  dryRun: boolean,
  actor: Actor,
): Promise<ImportResultDto> {
  const { rows, header } = parseRows(text);
  requireColumns(header, ["name"]);
  const report: Report = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const name = pick(row, "name");
    if (!name) {
      report.errors.push({ line, message: "name is required" });
      report.skipped += 1;
      continue;
    }
    const email = pick(row, "email").toLowerCase() || null;
    const rawPhone = pick(row, "phone") || null;
    const phone = normalizePhone(rawPhone, r.locale);
    if (rawPhone && !phone) {
      report.errors.push({ line, message: `invalid phone "${rawPhone}"` });
      report.skipped += 1;
      continue;
    }
    const localeRaw = pick(row, "locale").toLowerCase();
    const locale = localeRaw === "it" || localeRaw === "en" ? localeRaw : null;
    const tags = pick(row, "tags")
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter((t) => t !== "")
      .slice(0, 20);
    const notes = pick(row, "notes") || null;
    const consentRaw = pick(row, "marketing_consent");

    // does the guest exist? (email first, then phone)
    let existing: typeof customer.$inferSelect | undefined;
    if (email)
      [existing] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.restaurantId, r.id), eq(customer.email, email)))
        .limit(1);
    if (!existing && phone)
      [existing] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.restaurantId, r.id), eq(customer.phone, phone)))
        .limit(1);
    if (existing) report.updated += 1;
    else report.created += 1;
    if (dryRun) continue;

    await ctx.db.transaction(async (tx) => {
      const cust = await upsertCustomer(
        tx,
        r.id,
        { id: existing?.id, name, email, phone, locale },
        phone,
        consentRaw ? truthy(consentRaw) : undefined,
      );
      const merged = [...new Set([...cust.tags, ...tags])];
      await tx
        .update(customer)
        .set({
          tags: merged,
          // re-importing the same file must not pile up the same note
          ...(notes && !cust.notes?.includes(notes)
            ? { notes: cust.notes ? `${cust.notes}\n${notes}` : notes }
            : {}),
          ...(consentRaw && !truthy(consentRaw) ? { marketingConsent: false } : {}),
        })
        .where(eq(customer.id, cust.id));
    });
  }
  if (!dryRun)
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: "customers.imported",
      entityType: "customer",
      data: { created: report.created, updated: report.updated, skipped: report.skipped },
    });
  return { total: rows.length, ...report, dryRun, errors: report.errors.slice(0, 200) };
}

export async function importBookings(
  ctx: AppContext,
  r: RestaurantRow,
  text: string,
  dryRun: boolean,
  actor: Actor,
): Promise<ImportResultDto> {
  const { rows, header } = parseRows(text);
  requireColumns(header, ["date", "time", "guests", "name"]);
  const services = await ctx.db
    .select({ id: service.id, name: service.name, active: service.active })
    .from(service)
    .where(eq(service.restaurantId, r.id))
    .orderBy(asc(service.sortOrder), asc(service.name));
  const fallback = services.find((s) => s.active) ?? services[0];
  if (!fallback) throw ApiError.badRequest("no_service", "Create a service before importing");
  const now = ctx.now();
  const report: Report = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const fail = (message: string) => {
      report.errors.push({ line, message });
      report.skipped += 1;
    };
    const date = pick(row, "date").replace(/\//g, "-");
    const time = pick(row, "time").slice(0, 5);
    const guests = Number(pick(row, "guests"));
    const name = pick(row, "name");
    if (!isLocalDate(date)) {
      fail(`invalid date "${pick(row, "date")}" (use YYYY-MM-DD)`);
      continue;
    }
    if (!isLocalTime(time)) {
      fail(`invalid time "${pick(row, "time")}" (use HH:mm)`);
      continue;
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > 100) {
      fail(`invalid guests "${pick(row, "guests")}"`);
      continue;
    }
    if (!name) {
      fail("name is required");
      continue;
    }
    const serviceName = pick(row, "service");
    const svc = serviceName
      ? services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
      : fallback;
    if (!svc) {
      fail(`unknown service "${serviceName}"`);
      continue;
    }
    const startsAt = localToInstant(date, parseLocalTime(time), r.timezone);
    const statusRaw = pick(row, "status").toLowerCase().replace(/[\s-]/g, "_") as BookingStatus;
    const status: BookingStatus = statusRaw
      ? statusRaw
      : startsAt.getTime() < now.getTime()
        ? "completed"
        : "confirmed";
    if (!(BOOKING_STATUSES as readonly string[]).includes(status)) {
      fail(`unknown status "${pick(row, "status")}"`);
      continue;
    }
    const sourceRaw = pick(row, "source").toLowerCase().replace(/[\s-]/g, "_") as BookingSource;
    const source: BookingSource = sourceRaw || "manual";
    if (!(BOOKING_SOURCES as readonly string[]).includes(source)) {
      fail(`unknown source "${pick(row, "source")}"`);
      continue;
    }
    const email = pick(row, "email").toLowerCase() || null;
    const rawPhone = pick(row, "phone") || null;
    const phone = normalizePhone(rawPhone, r.locale);
    if (rawPhone && !phone) {
      fail(`invalid phone "${rawPhone}"`);
      continue;
    }

    // the same guest at the same time already exists: skip rather than duplicate
    const [dup] = await ctx.db
      .select({ id: booking.id })
      .from(booking)
      .innerJoin(customer, eq(customer.id, booking.customerId))
      .where(
        and(
          eq(booking.restaurantId, r.id),
          eq(booking.startsAt, startsAt),
          email
            ? eq(customer.email, email)
            : phone
              ? eq(customer.phone, phone)
              : ilike(customer.name, name),
        ),
      )
      .limit(1);
    if (dup) {
      report.skipped += 1;
      continue;
    }
    report.created += 1;
    if (dryRun) continue;
    try {
      await createBooking(ctx, r, {
        serviceId: svc.id,
        startsAt,
        partySize: guests,
        guest: { name, email, phone },
        notes: pick(row, "notes") || null,
        source,
        actor,
        ignoreCapacity: true,
        imported: { status },
      });
    } catch (error) {
      report.created -= 1;
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  if (!dryRun)
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: "bookings.imported",
      entityType: "booking",
      data: { created: report.created, skipped: report.skipped },
    });
  return { total: rows.length, ...report, dryRun, errors: report.errors.slice(0, 200) };
}
