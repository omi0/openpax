import { describe, expect, it } from "vitest";
import { instantToLocal, isValidTimeZone, localToInstant, todayIn } from "../zoned.js";

describe("zoned conversions", () => {
  it("converts wall-clock times in summer and winter", () => {
    expect(localToInstant("2026-06-12", 19 * 60, "Europe/Rome").toISOString()).toBe(
      "2026-06-12T17:00:00.000Z",
    );
    expect(localToInstant("2026-01-12", 19 * 60, "Europe/Rome").toISOString()).toBe(
      "2026-01-12T18:00:00.000Z",
    );
    expect(localToInstant("2026-01-15", 20 * 60, "America/New_York").toISOString()).toBe(
      "2026-01-16T01:00:00.000Z",
    );
  });

  it("treats minutes beyond 1440 as the next calendar day", () => {
    expect(localToInstant("2026-06-12", 1440 + 30, "Europe/Rome").toISOString()).toBe(
      "2026-06-12T22:30:00.000Z",
    );
  });

  it("resolves the spring-forward gap forward", () => {
    // 02:30 does not exist on 2026-03-29 in Rome; it becomes 03:30 (+02:00)
    expect(localToInstant("2026-03-29", 150, "Europe/Rome").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
  });

  it("round-trips instants to local", () => {
    const local = instantToLocal(new Date("2026-06-12T22:30:00Z"), "Europe/Rome");
    expect(local).toEqual({ date: "2026-06-13", minutesOfDay: 30 });
    expect(todayIn("Europe/Rome", new Date("2026-06-12T22:30:00Z"))).toBe("2026-06-13");
    expect(todayIn("America/New_York", new Date("2026-06-12T22:30:00Z"))).toBe("2026-06-12");
  });

  it("validates timezones", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
