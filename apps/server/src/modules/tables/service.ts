import { ACTIVE_BOOKING_STATUSES } from "@openpax/core";
import { area, booking, bookingTable, diningTable } from "@openpax/db";
import type {
  AssignTablesInput,
  TableDto,
  UpdateTablePositionsInput,
  UpsertTableInput,
} from "@openpax/shared";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { lockServiceDates } from "../../lib/locks.js";

type Row = typeof diningTable.$inferSelect;

export const toTableDto = (row: Row): TableDto => ({
  id: row.id,
  restaurantId: row.restaurantId,
  areaId: row.areaId,
  name: row.name,
  minCovers: row.minCovers,
  maxCovers: row.maxCovers,
  shape: row.shape as TableDto["shape"],
  x: row.x,
  y: row.y,
  width: row.width,
  height: row.height,
  joinable: row.joinable,
  active: row.active,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listTables(ctx: AppContext, restaurantId: string): Promise<TableDto[]> {
  const rows = await ctx.db
    .select()
    .from(diningTable)
    .where(eq(diningTable.restaurantId, restaurantId))
    .orderBy(asc(diningTable.sortOrder), asc(diningTable.name));
  return rows.map(toTableDto);
}

async function assertArea(ctx: AppContext, restaurantId: string, areaId: string | null) {
  if (!areaId) return;
  const [row] = await ctx.db
    .select({ id: area.id })
    .from(area)
    .where(and(eq(area.id, areaId), eq(area.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw ApiError.notFound("Area");
}

export async function createTable(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertTableInput,
  actor: Actor,
): Promise<TableDto> {
  await assertArea(ctx, r.id, input.areaId);
  const [row] = await ctx.db
    .insert(diningTable)
    .values({ ...input, restaurantId: r.id })
    .returning();
  if (!row) throw new Error("table insert failed");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "table.created",
    entityType: "dining_table",
    entityId: row.id,
    data: { name: row.name, maxCovers: row.maxCovers },
  });
  return toTableDto(row);
}

export async function updateTable(
  ctx: AppContext,
  r: RestaurantRow,
  id: string,
  input: UpsertTableInput,
  actor: Actor,
): Promise<TableDto> {
  await assertArea(ctx, r.id, input.areaId);
  const [row] = await ctx.db
    .update(diningTable)
    .set(input)
    .where(and(eq(diningTable.id, id), eq(diningTable.restaurantId, r.id)))
    .returning();
  if (!row) throw ApiError.notFound("Table");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "table.updated",
    entityType: "dining_table",
    entityId: row.id,
    data: { name: row.name, maxCovers: row.maxCovers, active: row.active },
  });
  return toTableDto(row);
}

export async function deleteTable(ctx: AppContext, r: RestaurantRow, id: string, actor: Actor) {
  const [row] = await ctx.db
    .delete(diningTable)
    .where(and(eq(diningTable.id, id), eq(diningTable.restaurantId, r.id)))
    .returning({ id: diningTable.id, name: diningTable.name });
  if (!row) throw ApiError.notFound("Table");
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    actor,
    action: "table.deleted",
    entityType: "dining_table",
    entityId: row.id,
    data: { name: row.name },
  });
}

/** Drag-and-drop: save every moved table in one transaction. */
export async function updatePositions(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpdateTablePositionsInput,
): Promise<TableDto[]> {
  await ctx.db.transaction(async (tx) => {
    for (const p of input.positions) {
      await tx
        .update(diningTable)
        .set({
          x: p.x,
          y: p.y,
          ...(p.width !== undefined ? { width: p.width } : {}),
          ...(p.height !== undefined ? { height: p.height } : {}),
        })
        .where(and(eq(diningTable.id, p.id), eq(diningTable.restaurantId, r.id)));
    }
  });
  return listTables(ctx, r.id);
}

/**
 * Staff choose the tables of a booking by hand. Unless forced, a table that
 * another active booking occupies during the visit is refused.
 */
export async function assignTables(
  ctx: AppContext,
  r: RestaurantRow,
  bookingId: string,
  input: AssignTablesInput,
  actor: Actor,
): Promise<Array<{ id: string; name: string }>> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: booking.id,
        serviceDate: booking.serviceDate,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status,
      })
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.restaurantId, r.id)))
      .for("update");
    if (!row) throw ApiError.notFound("Booking");
    // same lock as booking creation: nobody else seats a party on that date meanwhile
    await lockServiceDates(tx, r.id, [row.serviceDate]);

    const ids = [...new Set(input.tableIds)];
    const tables =
      ids.length === 0
        ? []
        : await tx
            .select({ id: diningTable.id, name: diningTable.name })
            .from(diningTable)
            .where(and(eq(diningTable.restaurantId, r.id), inArray(diningTable.id, ids)));
    if (tables.length !== ids.length) throw ApiError.notFound("Table");

    if (ids.length > 0 && !input.force) {
      const clashes = await tx
        .select({ tableId: bookingTable.tableId, name: diningTable.name })
        .from(bookingTable)
        .innerJoin(booking, eq(booking.id, bookingTable.bookingId))
        .innerJoin(diningTable, eq(diningTable.id, bookingTable.tableId))
        .where(
          and(
            inArray(bookingTable.tableId, ids),
            ne(booking.id, row.id),
            inArray(booking.status, [...ACTIVE_BOOKING_STATUSES]),
            sql`${booking.startsAt} < ${row.endsAt.toISOString()}::timestamptz`,
            sql`${booking.endsAt} > ${row.startsAt.toISOString()}::timestamptz`,
          ),
        );
      if (clashes.length > 0)
        throw ApiError.conflict("table_taken", "A chosen table is taken at that time", {
          tables: clashes.map((c) => c.name),
        });
    }

    await tx.delete(bookingTable).where(eq(bookingTable.bookingId, row.id));
    if (ids.length > 0)
      await tx.insert(bookingTable).values(ids.map((tableId) => ({ bookingId: row.id, tableId })));
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "booking.tables_assigned",
      entityType: "booking",
      entityId: row.id,
      data: { tables: tables.map((t) => t.name), force: input.force },
    });
    return tables;
  });
}
