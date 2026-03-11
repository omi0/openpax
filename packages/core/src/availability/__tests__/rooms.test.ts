import { describe, expect, it } from "vitest";
import { usableTables } from "../../tables/tables.js";
import { evaluateRooms, totalSeats } from "../capacity.js";
import { computeAvailability } from "../compute-availability.js";
import type { RoomDef } from "../types.js";
import { at, baseInput, booking, dinner, FRIDAY } from "./fixtures.js";

const sala: RoomDef = { id: "sala", name: "Sala", seats: 30, active: true };
const terrazza: RoomDef = { id: "terrazza", name: "Terrazza", seats: 20, active: true };

describe("totalSeats", () => {
  it("adds up the open rooms and ignores closed ones", () => {
    expect(totalSeats([sala, terrazza])).toBe(50);
    expect(totalSeats([sala, { ...terrazza, active: false }])).toBe(30);
  });
  it("is unknown when an open room has no seat count, and zero when every room is closed", () => {
    expect(totalSeats([sala, { ...terrazza, seats: null }])).toBeNull();
    expect(totalSeats([{ ...sala, active: false }])).toBe(0);
    expect(totalSeats([])).toBeNull();
  });
});

describe("evaluateRooms", () => {
  const visit = { startsAt: at(FRIDAY, "20:00"), endsAt: at(FRIDAY, "22:00") };
  it("caps everyone by the seats of the open rooms, counting overlapping visits", () => {
    const existing = [
      booking("dinner", FRIDAY, "19:00", 30, 120), // leaves at 21:00
      booking("dinner", FRIDAY, "19:30", 16, 120),
    ];
    const v = evaluateRooms([sala, terrazza], existing, visit, 4, null);
    expect(v).toEqual({ ok: true, remainingCovers: 4 });
    expect(evaluateRooms([sala, terrazza], existing, visit, 5, null).reason).toBe("full");
    // once the terrace closes only 30 seats remain and 46 are already taken
    expect(evaluateRooms([sala, { ...terrazza, active: false }], existing, visit, 1, null)).toEqual(
      { ok: false, reason: "full", remainingCovers: 0 },
    );
  });
  it("rejects a request for a closed or unknown room", () => {
    expect(evaluateRooms([sala, { ...terrazza, active: false }], [], visit, 2, "terrazza")).toEqual(
      { ok: false, reason: "room_closed", remainingCovers: 0 },
    );
    expect(evaluateRooms([sala], [], visit, 2, "garden").reason).toBe("room_closed");
  });
  it("applies the requested room's own seats on top of the total", () => {
    const existing = [booking("dinner", FRIDAY, "20:00", 18, 120, "terrazza")];
    expect(evaluateRooms([sala, terrazza], existing, visit, 2, "terrazza")).toEqual({
      ok: true,
      remainingCovers: 2,
    });
    expect(evaluateRooms([sala, terrazza], existing, visit, 3, "terrazza").reason).toBe("full");
    // the same party fits in the house as a whole
    expect(evaluateRooms([sala, terrazza], existing, visit, 3, null).ok).toBe(true);
  });
  it("does not enforce a total while some open room has no seat count", () => {
    const existing = [booking("dinner", FRIDAY, "20:00", 100, 120)];
    expect(evaluateRooms([sala, { ...terrazza, seats: null }], existing, visit, 4, null)).toEqual({
      ok: true,
      remainingCovers: null,
    });
  });
});

describe("rooms inside computeAvailability", () => {
  it("marks slots full once the house is at capacity, without any capacity rule", () => {
    const existing = [
      booking("dinner", FRIDAY, "19:00", 20, 120),
      booking("dinner", FRIDAY, "19:30", 20, 120),
      booking("dinner", FRIDAY, "20:00", 10, 120),
    ];
    const result = computeAvailability(
      baseInput({
        services: [dinner],
        rooms: [sala, terrazza],
        existingBookings: existing,
        partySize: 2,
      }),
    );
    const byTime = Object.fromEntries(
      result.slots.map((s) => [s.startLocal, [s.available, s.reason ?? null]]),
    );
    expect(byTime["20:30"]).toEqual([false, "full"]); // 50 seated, none left
    expect(byTime["21:00"]).toEqual([true, null]); // the 19:00 party has left
  });
  it("ignores tables of a closed room", () => {
    const tables = [
      { id: "t1", areaId: "terrazza", name: "T1", minCovers: 1, maxCovers: 4, joinable: false },
      { id: "t2", areaId: "sala", name: "T2", minCovers: 1, maxCovers: 2, joinable: false },
    ];
    expect(usableTables(tables, [sala, { ...terrazza, active: false }]).map((t) => t.id)).toEqual([
      "t2",
    ]);
    const result = computeAvailability(
      baseInput({
        services: [dinner],
        rooms: [sala, { ...terrazza, active: false }],
        tables,
        tableLoads: [],
        partySize: 4,
      }),
    );
    expect(result.slots.every((s) => s.reason === "no_table")).toBe(true);
  });
});
