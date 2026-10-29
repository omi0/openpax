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
  /**
   * Tables it can be pushed against. When any table lists some, only linked
   * tables are joined, in chains or blocks of any length.
   */
  joinWith?: readonly string[];
  /** Extra guests at the head when the table is alone or ends a joined row. */
  headSeats?: number;
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

/** Tables that can be used now: active, and not in a closed room. */
export function usableTables(
  tables: readonly TableDef[],
  rooms: readonly { id: string; active: boolean }[] | undefined,
): TableDef[] {
  const closed = new Set((rooms ?? []).filter((r) => !r.active).map((r) => r.id));
  return tables.filter((t) => t.active !== false && (t.areaId === null || !closed.has(t.areaId)));
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

/** Most tables one party can be spread over. */
const MAX_JOINED = 12;
/** Bound on the sets looked at per request, so availability stays fast. */
const MAX_SETS = 20_000;

/**
 * Pick the table(s) for a party: the single free table that wastes the
 * fewest seats, else the pair of joinable tables in the same area that does.
 * When the floor plan says which tables touch (joinWith), the fewest linked
 * tables that fit are joined instead, wasting the fewest seats.
 * Returns null when nothing fits.
 */
export function findTableAssignment(
  tables: readonly TableDef[],
  loads: readonly TableLoad[],
  req: TableRequest,
): TableDef[] | null {
  const free = freeTables(tables, loads, req);
  const n = req.partySize;
  if (tables.some((t) => (t.joinWith?.length ?? 0) > 0)) return findLinkedAssignment(free, n);

  let single: TableDef | null = null;
  for (const t of free) {
    if (n < t.minCovers || n > t.maxCovers + (t.headSeats ?? 0)) continue;
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

/**
 * Guests a group of joined tables seats: every table's covers, plus the head
 * seats of the tables at its ends (linked to at most one other in the group).
 */
export function joinedCapacity(
  group: readonly TableDef[],
  links: (a: TableDef, b: TableDef) => boolean,
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const t of group) {
    min += t.minCovers;
    max += t.maxCovers;
    const touching = group.filter((o) => o !== t && links(t, o)).length;
    if (touching <= 1) max += t.headSeats ?? 0;
  }
  return { min, max };
}

/** Undirected links between joinable tables of the same area. */
export function tableLinks(tables: readonly TableDef[]): (a: TableDef, b: TableDef) => boolean {
  const pairs = new Set<string>();
  const byId = new Map(tables.map((t) => [t.id, t]));
  for (const t of tables) {
    for (const id of t.joinWith ?? []) {
      const o = byId.get(id);
      if (!o || o.id === t.id || o.areaId !== t.areaId || !t.joinable || !o.joinable) continue;
      pairs.add(`${t.id}|${o.id}`);
      pairs.add(`${o.id}|${t.id}`);
    }
  }
  return (a, b) => pairs.has(`${a.id}|${b.id}`);
}

/**
 * Smallest connected group of free linked tables that seats the party, with
 * the fewest empty seats; ties keep the staff's table order. Groups are
 * enumerated once each (ESU algorithm), size by size.
 */
function findLinkedAssignment(free: readonly TableDef[], n: number): TableDef[] | null {
  const linked = tableLinks(free);
  const neighbours = new Map(free.map((t) => [t.id, free.filter((o) => linked(t, o))]));
  const index = new Map(free.map((t, i) => [t.id, i]));
  const idx = (t: TableDef) => index.get(t.id) ?? 0;
  let visited = 0;

  for (let size = 1; size <= MAX_JOINED; size += 1) {
    let best: TableDef[] | null = null;
    let bestWaste = Number.POSITIVE_INFINITY;
    const consider = (group: TableDef[]) => {
      visited += 1;
      const { min, max } = joinedCapacity(group, linked);
      if (n < min || n > max || max - n >= bestWaste) return;
      best = [...group];
      bestWaste = max - n;
    };
    const extend = (group: TableDef[], ext: TableDef[], root: TableDef) => {
      if (visited > MAX_SETS) return;
      if (group.length === size) return consider(group);
      const rest = [...ext];
      while (rest.length > 0) {
        const w = rest.shift() as TableDef;
        const next = [...rest];
        for (const u of neighbours.get(w.id) ?? []) {
          if (idx(u) <= idx(root) || group.includes(u) || next.includes(u)) continue;
          if (group.some((g) => linked(g, u))) continue; // reachable earlier: counted there
          next.push(u);
        }
        extend([...group, w], next, root);
      }
    };
    for (const root of free) {
      extend(
        [root],
        (neighbours.get(root.id) ?? []).filter((u) => idx(u) > idx(root)),
        root,
      );
    }
    if (best) return best;
    if (visited > MAX_SETS) return null;
  }
  return null;
}

/**
 * True when the restaurant has a floor plan (at least one active table) and
 * no usable table can host the party at that time. Tables in closed rooms
 * count as part of the plan but cannot be used.
 */
export function tablesExhausted(
  tables: readonly TableDef[],
  loads: readonly TableLoad[],
  req: TableRequest,
  rooms?: readonly { id: string; active: boolean }[],
): boolean {
  if (tables.filter((t) => t.active !== false).length === 0) return false;
  return findTableAssignment(usableTables(tables, rooms), loads, req) === null;
}
