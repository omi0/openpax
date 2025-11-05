import { describe, expect, it } from "vitest";
import { generateConfirmationCode } from "../confirmation-code.js";
import { canTransition, isActiveStatus, TransitionError, transition } from "../state-machine.js";

describe("booking state machine", () => {
  it("follows the happy path", () => {
    expect(transition("pending", "confirm")).toBe("confirmed");
    expect(transition("confirmed", "seat")).toBe("seated");
    expect(transition("seated", "complete")).toBe("completed");
  });

  it("supports cancellation, no-show and reopening", () => {
    expect(transition("pending", "cancel")).toBe("cancelled");
    expect(transition("confirmed", "cancel")).toBe("cancelled");
    expect(transition("confirmed", "no_show")).toBe("no_show");
    expect(transition("cancelled", "reopen")).toBe("confirmed");
    expect(transition("no_show", "reopen")).toBe("confirmed");
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("completed", "cancel")).toBe(false);
    expect(() => transition("completed", "cancel")).toThrow(TransitionError);
    try {
      transition("pending", "seat");
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionError);
      expect((error as TransitionError).code).toBe("invalid_transition");
    }
  });

  it("knows which statuses occupy capacity", () => {
    expect(isActiveStatus("confirmed")).toBe(true);
    expect(isActiveStatus("seated")).toBe(true);
    expect(isActiveStatus("completed")).toBe(false);
    expect(isActiveStatus("cancelled")).toBe(false);
  });
});

describe("confirmation codes", () => {
  it("uses only unambiguous characters", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const code = generateConfirmationCode(random);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(generateConfirmationCode(() => 0, 4)).toBe("2222");
  });
});
