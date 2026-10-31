import { describe, expect, it } from "vitest";
import { findTableAssignment, freeTables, type TableDef, tablesExhausted } from "../tables.js";

const table = (id: string, maxCovers: number, extra: Partial<TableDef> = {}): TableDef => ({
  id,
  name: id,
  areaId: "inside",
  minCovers: 1,
  maxCovers,
  joinable: true,
  sortOrder: 0,
  ...extra,
});

const at = (h: number) => new Date(Date.UTC(2026, 5, 12, h));
const req = (partySize: number, extra = {}) => ({
  startsAt: at(18),
  endsAt: at(20),
  partySize,
  ...extra,
});

describe("table assignment", () => {
  const tables = [
    table("T1", 2),
    table("T2", 4),
    table("T3", 4, { minCovers: 3 }),
    table("T6", 6, { joinable: false }),
    table("G1", 4, { areaId: "garden" }),
  ];

  it("ignores tables busy during the requested interval", () => {
    const loads = [
      { tableId: "T2", startsAt: at(17), endsAt: at(19) },
      { tableId: "T1", startsAt: at(20), endsAt: at(22) }, // ends touching: free
    ];
    expect(freeTables(tables, loads, req(2)).map((t) => t.id)).toEqual(["T1", "T3", "T6", "G1"]);
  });

  it("prefers the single table that wastes the fewest seats", () => {
    expect(findTableAssignment(tables, [], req(2))?.map((t) => t.id)).toEqual(["T1"]);
    expect(findTableAssignment(tables, [], req(4))?.map((t) => t.id)).toEqual(["T2"]);
    // T1 and T2 taken, T3 wants at least 3 guests: the garden four-top beats the six-top
    const busy = [
      { tableId: "T1", ...req(0) },
      { tableId: "T2", ...req(0) },
    ];
    expect(findTableAssignment(tables, busy, req(2))?.map((t) => t.id)).toEqual(["G1"]);
  });

  it("joins two joinable tables of the same area when no single one fits", () => {
    // 8 guests: T2 + T3 (4+4) beats T6 (not joinable) and G1 is in another area
    expect(findTableAssignment(tables, [], req(8))?.map((t) => t.id)).toEqual(["T2", "T3"]);
    expect(findTableAssignment(tables, [], req(9))).toBeNull();
  });

  it("respects the requested area", () => {
    expect(findTableAssignment(tables, [], req(4, { areaId: "garden" }))?.map((t) => t.id)).toEqual(
      ["G1"],
    );
    expect(findTableAssignment(tables, [], req(6, { areaId: "garden" }))).toBeNull();
  });

  it("only reports exhaustion when tables exist", () => {
    expect(tablesExhausted([], [], req(2))).toBe(false);
    expect(tablesExhausted(tables, [], req(2))).toBe(false);
    const allBusy = tables.map((t) => ({ tableId: t.id, startsAt: at(17), endsAt: at(21) }));
    expect(tablesExhausted(tables, allBusy, req(2))).toBe(true);
    expect(tablesExhausted([table("X", 2, { active: false })], [], req(2))).toBe(false);
  });
});

describe("linked tables", () => {
  // a row 1-2-3-4 of two-seaters, plus 5-6 on their own; 1 has room for one at its head
  const row = [
    table("1", 2, { joinWith: ["2"], headSeats: 1 }),
    table("2", 2, { joinWith: ["1", "3"] }),
    table("3", 2, { joinWith: ["4"] }),
    table("4", 2, { headSeats: 1 }),
    table("5", 2, { joinWith: ["6"] }),
    table("6", 2),
  ];
  const ids = (r: TableDef[] | null) => r?.map((t) => t.id).sort();

  it("seats a couple at one table, keeping head seats free", () => {
    expect(ids(findTableAssignment(row, [], req(2)))).toEqual(["2"]);
  });

  it("uses a head seat before joining a second table", () => {
    expect(ids(findTableAssignment(row, [], req(3)))).toEqual(["1"]);
  });

  it("joins only linked tables, the fewest that fit", () => {
    expect(ids(findTableAssignment(row, [], req(4)))).toEqual(["2", "3"]);
    expect(ids(findTableAssignment(row, [], req(5)))).toEqual(["1", "2"]);
    expect(ids(findTableAssignment(row, [], req(10)))).toEqual(["1", "2", "3", "4"]);
    expect(findTableAssignment(row, [], req(11))).toBeNull();
  });

  it("skips busy tables and keeps the group connected", () => {
    const busy = [{ tableId: "2", startsAt: at(18), endsAt: at(20) }];
    expect(ids(findTableAssignment(row, busy, req(4)))).toEqual(["5", "6"]);
    expect(ids(findTableAssignment(row, busy, req(5)))).toEqual(["3", "4"]);
    expect(findTableAssignment(row, busy, req(6))).toBeNull();
  });

  it("never joins tables of different rooms", () => {
    const rooms = [table("A", 2, { joinWith: ["B"] }), table("B", 2, { areaId: "garden" })];
    expect(findTableAssignment(rooms, [], req(4))).toBeNull();
  });

  it("joins blocks, not only rows", () => {
    const block = [
      table("7", 2, { joinWith: ["8", "5"] }),
      table("8", 2, { joinWith: ["6"] }),
      table("5", 2, { joinWith: ["6"] }),
      table("6", 2),
    ];
    expect(ids(findTableAssignment(block, [], req(8)))).toEqual(["5", "6", "7", "8"]);
  });

  it("keeps pairing joinable tables in rooms without links", () => {
    const mixed = [
      table("1", 2, { joinWith: ["2"] }),
      table("2", 2),
      table("D1", 2, { areaId: "garden" }),
      table("D2", 2, { areaId: "garden" }),
    ];
    const busy = [
      { tableId: "1", startsAt: at(18), endsAt: at(20) },
      { tableId: "2", startsAt: at(18), endsAt: at(20) },
    ];
    expect(ids(findTableAssignment(mixed, busy, req(4)))).toEqual(["D1", "D2"]);
  });

  it("finds a group on a big, densely linked plan", () => {
    // 6 × 6 grid of two-seaters, each linked to its right and lower neighbour
    const grid: TableDef[] = [];
    for (let r = 0; r < 6; r += 1)
      for (let c = 0; c < 6; c += 1)
        grid.push(
          table(`${r}-${c}`, 2, {
            joinWith: [...(c < 5 ? [`${r}-${c + 1}`] : []), ...(r < 5 ? [`${r + 1}-${c}`] : [])],
          }),
        );
    const group = findTableAssignment(grid, [], req(24));
    expect(group).toHaveLength(12);
    expect(findTableAssignment(grid, [], req(73))).toBeNull();
  });
});

describe("rooms with unusable links", () => {
  it("still joins a pair when the only links cannot be used", () => {
    const tables = [
      table("A", 4, { joinable: false, joinWith: ["B"] }),
      table("B", 4),
      table("C", 4),
      table("G", 4, { areaId: "garden", joinWith: ["B"] }),
    ];
    expect(findTableAssignment(tables, [], req(6))?.map((t) => t.id)).toEqual(["B", "C"]);
  });

  it("keeps a room linked when the table it links to is switched off for now", () => {
    const tables = [table("A", 4, { joinWith: ["OFF"] }), table("C", 4)];
    expect(findTableAssignment(tables, [], req(6))).toBeNull();
  });
});
