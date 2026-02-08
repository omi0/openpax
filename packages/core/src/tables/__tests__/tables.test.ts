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
