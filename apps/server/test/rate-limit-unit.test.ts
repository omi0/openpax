import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/lib/rate-limit.js";

describe("RateLimiter", () => {
  it("allows `limit` hits per window, then refuses until the window resets", () => {
    let now = 1_000_000;
    const limiter = new RateLimiter(() => now);
    for (let i = 0; i < 3; i += 1) expect(limiter.hit("a", 3, 60_000).allowed).toBe(true);
    const refused = limiter.hit("a", 3, 60_000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBe(60_000);
    // other keys are independent
    expect(limiter.hit("b", 3, 60_000).allowed).toBe(true);
    now += 60_000;
    expect(limiter.hit("a", 3, 60_000).allowed).toBe(true);
  });
});
