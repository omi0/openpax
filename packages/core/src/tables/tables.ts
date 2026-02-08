/**
 * Tables and automatic assignment. Pure functions: the server loads tables
 * and the intervals they are busy for, the engine decides what fits.
 */

export interface TableDef {
  id: string;
  areaId: string | null;
  name: string;
  minCovers: number;
  maxCovers: number;
  /** May be pushed together with another joinable table of the same area. */
  joinable: boolean;
  active?: boolean;
  sortOrder?: number;
}

/** A table taken by an active booking during [startsAt, endsAt). */
export interface TableLoad {
  tableId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface TableRequest {
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  /** Restrict to one area (guest preference); null = anywhere. */
  areaId?: string | null;
}

/** Staff order the list; ties keep the given order (stable sort). */
const byPreference = (a: TableDef, b: TableDef) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

/** Active tables with no busy interval overlapping the request, in the requested area. */
export function freeTables(
  tables: readonly TableDef[],
  loads: readonly TableLoad[],
  req: TableRequest,
): TableDef[] {
  const s = req.startsAt.getTime();
  const e = req.endsAt.getTime();
  const busy = new Set<string>();
  for (const l of loads) {
    if (l.startsAt.getTime() < e && l.endsAt.getTime() > s) busy.add(l.tableId);
  }
  return tables
    .filter((t) => t.active !== false)
    .filter((t) => !busy.has(t.id))
    .filter((t) => !req.areaId || t.areaId === req.areaId)
    .sort(byPreference);
}

/**
 * Pick the table(s) for a party: the single free table that wastes the
 * fewest seats, else the pair of joinable tables in the same area that does.
 * Returns null when nothing fits.
 */
export function findTableAssignment(
  tables: readonly TableDef[],
  loads: readonly TableLoad[],
  req: TableRequest,
): TableDef[] | null {
  const free = freeTables(tables, loads, req);
  const n = req.partySize;

  let single: TableDef | null = null;
  for (const t of free) {
    if (n < t.minCovers || n > t.maxCovers) continue;
    if (!single || t.maxCovers < single.maxCovers) single = t;
  }
  if (single) return [single];

  let pair: [TableDef, TableDef] | null = null;
  let pairMax = Number.POSITIVE_INFINITY;
  const joinable = free.filter((t) => t.joinable);
  for (let i = 0; i < joinable.length; i += 1) {
    for (let j = i + 1; j < joinable.length; j += 1) {
      const a = joinable[i];
      const b = joinable[j];
      if (!a || !b || a.areaId !== b.areaId) continue;
      const max = a.maxCovers + b.maxCovers;
      const min = a.minCovers + b.minCovers;
      if (n > max || n < min) continue;
      if (max < pairMax) {
        pair = [a, b];
        pairMax = max;
      }
    }
  }
  return pair;
}

/** True when the restaurant has tables and none can host the party at that time. */
export function tablesExhausted(
  tables: readonly TableDef[],
  loads: readonly TableLoad[],
  req: TableRequest,
): boolean {
  if (tables.filter((t) => t.active !== false).length === 0) return false;
  return findTableAssignment(tables, loads, req) === null;
}
