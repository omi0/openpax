import { describe, expect, it } from "vitest";
import { defaultTemplates, fillTemplate, unknownPlaceholders } from "../index.js";

describe("templates", () => {
  it("fills known placeholders and blanks missing ones", () => {
    expect(
      fillTemplate("Ciao {{guestName}}, {{ partySize }} persone{{manageUrl}}", {
        guestName: "Mario",
        partySize: 4,
      }),
    ).toBe("Ciao Mario, 4 persone");
  });
  it("reports unknown placeholders", () => {
    expect(unknownPlaceholders("{{guestName}} {{tableNumber}} {{foo}}")).toEqual([
      "tableNumber",
      "foo",
    ]);
  });
  it("falls back to English for unknown locales", () => {
    expect(defaultTemplates("fr" as never, "guest", "booking.confirmed").email.heading).toBe(
      "Booking confirmed",
    );
  });
});
