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
import { area, booking, customer, service } from "@openpax/db";
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
      roomName: area.name,
      tables: sql<string>`coalesce((
        select string_agg(dt.name, ' + ' order by dt.sort_order, dt.name)
        from booking_table bt join dining_table dt on dt.id = bt.table_id
        where bt.booking_id = ${booking.id}), '')`,
    })
    .from(booking)
    .innerJoin(customer, eq(customer.id, booking.customerId))
    .innerJoin(service, eq(service.id, booking.serviceId))
    .leftJoin(area, eq(area.id, booking.areaId))
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
      room: x.roomName ?? "",
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
interface Note {
  line: number;
  message: string;
}
interface Report {
  created: number;
  updated: number;
  skipped: number;
  errors: Note[];
  /** Rows that went in with something left out (an unreadable phone, an unknown room). */
  warnings: Note[];
}

/** Accept a few header spellings (English, Italian, the export's own). */
const ALIASES: Record<string, string[]> = {
  name: ["name", "nome", "guest", "ospite", "nome_cliente", "cliente"],
  email: ["email", "e_mail", "mail"],
  phone: ["phone", "telefono", "tel", "phone_number", "cellulare"],
  tags: ["tags", "tag", "etichette"],
  notes: ["notes", "note", "notes_", "richieste"],
  locale: ["locale", "lingua", "language"],
  marketing_consent: ["marketing_consent", "marketing", "consenso_marketing", "newsletter"],
  date: ["date", "data", "service_date", "giorno"],
  time: ["time", "ora", "orario", "start_time"],
  guests: ["guests", "party_size", "persone", "coperti", "covers", "pax"],
  service: ["service", "servizio"],
  status: ["status", "stato"],
  source: ["source", "origine", "canale"],
  room: ["room", "sala", "area", "stanza"],
  created_at: ["created_at", "created", "creata_il", "data_creazione", "inserita_il"],
  /** The row's id in the system it comes from: re-importing the file skips what is already in. */
  reference: ["reference", "ref", "external_id", "id", "riferimento"],
};

/** Status spellings an export from another system (or a spreadsheet) may use. */
const STATUS_ALIASES: Record<string, BookingStatus> = {
  in_attesa: "pending",
  attesa: "pending",
  confermato: "confirmed",
  confermata: "confirmed",
  arrivato: "seated",
  arrivata: "seated",
  seduto: "seated",
  al_tavolo: "seated",
  completato: "completed",
  completata: "completed",
  concluso: "completed",
  conclusa: "completed",
  canceled: "cancelled",
  cancellato: "cancelled",
  cancellata: "cancelled",
  annullato: "cancelled",
  annullata: "cancelled",
  noshow: "no_show",
  non_arrivato: "no_show",
  non_arrivata: "no_show",
  non_presentato: "no_show",
  assente: "no_show",
};

const SOURCE_ALIASES: Record<string, BookingSource> = {
  web: "widget",
  online: "widget",
  sito: "widget",
  telefono: "phone",
  walkin: "walk_in",
  walk: "walk_in",
  passaggio: "walk_in",
  manuale: "manual",
  staff: "manual",
  assistente: "assistant",
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

const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");

/**
 * A timestamp from another system: ISO with an offset is taken as is, a bare
 * "YYYY-MM-DD HH:mm[:ss]" is read as the restaurant's local time.
 */
function parseInstant(raw: string, timezone: string): Date | null {
  const local = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (local?.[1] && local[2] && isLocalDate(local[1]) && isLocalTime(local[2])) {
    const instant = localToInstant(local[1], parseLocalTime(local[2]), timezone);
    return new Date(instant.getTime() + Number(local[3] ?? 0) * 1000);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A room by name, exact first, then "sopra" for "Sala sopra". */
function findRoom<T extends { id: string; name: string }>(rooms: T[], raw: string): T | undefined {
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    rooms.find((a) => a.name.toLowerCase() === wanted) ??
    rooms.find(
      (a) => a.name.toLowerCase().includes(wanted) || wanted.includes(a.name.toLowerCase()),
    )
  );
}

/**
 * The phone of a row: normalised when it can be read; otherwise the booking
 * (or guest) still goes in without it and the raw value is kept in the notes,
 * so a number typed wrong is not lost and a placeholder costs nothing.
 */
function readPhone(
  raw: string | null,
  locale: string,
  notes: string | null,
  warn: (message: string) => void,
): { phone: string | null; notes: string | null } {
  const phone = normalizePhone(raw, locale);
  if (!raw || phone) return { phone, notes };
  warn(`phone "${raw}" could not be read; kept in the notes`);
  const line = `Tel. ${raw}`;
  return { phone: null, notes: notes?.includes(line) ? notes : notes ? `${notes}\n${line}` : line };
}

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
  const report: Report = { created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const name = pick(row, "name");
    if (!name) {
      report.errors.push({ line, message: "name is required" });
      report.skipped += 1;
      continue;
    }
    const email = pick(row, "email").toLowerCase() || null;
    const { phone, notes } = readPhone(
      pick(row, "phone") || null,
      r.locale,
      pick(row, "notes") || null,
      (message) => report.warnings.push({ line, message }),
    );
    const localeRaw = pick(row, "locale").toLowerCase();
    const locale = localeRaw === "it" || localeRaw === "en" ? localeRaw : null;
    const tags = pick(row, "tags")
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter((t) => t !== "")
      .slice(0, 20);
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
    // nothing to match on but the name: re-importing the file must not add the guest again
    if (!existing && !email && !phone)
      [existing] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.restaurantId, r.id), ilike(customer.name, name)))
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
  return {
    total: rows.length,
    ...report,
    dryRun,
    errors: report.errors.slice(0, 200),
    warnings: report.warnings.slice(0, 200),
  };
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
  const rooms = await ctx.db
    .select({ id: area.id, name: area.name })
    .from(area)
    .where(eq(area.restaurantId, r.id));
  const now = ctx.now();
  const report: Report = { created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };

  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const fail = (message: string) => {
      report.errors.push({ line, message });
      report.skipped += 1;
    };
    const warn = (message: string) => report.warnings.push({ line, message });
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
    const past = startsAt.getTime() < now.getTime();
    const statusKey = slug(pick(row, "status"));
    let status = (STATUS_ALIASES[statusKey] ?? statusKey) as BookingStatus;
    if (statusKey && !(BOOKING_STATUSES as readonly string[]).includes(status)) {
      fail(`unknown status "${pick(row, "status")}"`);
      continue;
    }
    // what was still open on a past date is history now: the guest came, as far as anyone knows
    if (
      !statusKey ||
      (past && (status === "confirmed" || status === "seated" || status === "pending"))
    )
      status = past ? "completed" : "confirmed";
    const sourceKey = slug(pick(row, "source"));
    const source = (SOURCE_ALIASES[sourceKey] ?? (sourceKey || "manual")) as BookingSource;
    if (!(BOOKING_SOURCES as readonly string[]).includes(source)) {
      fail(`unknown source "${pick(row, "source")}"`);
      continue;
    }
    const email = pick(row, "email").toLowerCase() || null;
    const { phone, notes } = readPhone(
      pick(row, "phone") || null,
      r.locale,
      pick(row, "notes") || null,
      warn,
    );
    const roomRaw = pick(row, "room");
    const room = findRoom(rooms, roomRaw);
    if (roomRaw && !room) warn(`unknown room "${roomRaw}"; imported without a room`);
    const createdRaw = pick(row, "created_at");
    const createdAt = createdRaw ? parseInstant(createdRaw, r.timezone) : null;
    if (createdRaw && !createdAt) warn(`created_at "${createdRaw}" could not be read; ignored`);
    const consentRaw = pick(row, "marketing_consent");
    const reference = pick(row, "reference");
    const idempotencyKey = reference ? `import:${reference}` : null;

    if (idempotencyKey) {
      // the file carries its own ids: what came in before is skipped, whatever changed since
      const [done] = await ctx.db
        .select({ id: booking.id })
        .from(booking)
        .where(and(eq(booking.restaurantId, r.id), eq(booking.idempotencyKey, idempotencyKey)))
        .limit(1);
      if (done) {
        report.skipped += 1;
        continue;
      }
    } else {
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
    }
    report.created += 1;
    if (dryRun) continue;
    try {
      await createBooking(ctx, r, {
        serviceId: svc.id,
        startsAt,
        partySize: guests,
        areaId: room?.id ?? null,
        guest: { name, email, phone },
        notes,
        marketingConsent: consentRaw ? truthy(consentRaw) : undefined,
        idempotencyKey,
        source,
        actor,
        ignoreCapacity: true,
        imported: { status, ...(createdAt ? { createdAt } : {}) },
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
  return {
    total: rows.length,
    ...report,
    dryRun,
    errors: report.errors.slice(0, 200),
    warnings: report.warnings.slice(0, 200),
  };
}
