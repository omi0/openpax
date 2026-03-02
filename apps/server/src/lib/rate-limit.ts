import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.js";

/**
 * Fixed-window counters in process memory. Good enough for a single
 * instance (the deployment Sitli targets); a second replica would keep its
 * own counters, so limits become "per replica" rather than global.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { resetAt: number; count: number }>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Count one hit; returns whether it is still within `limit` per `windowMs`, and when the window resets. */
  hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
    const t = this.now();
    if (t - this.lastSweep > windowMs) this.sweep(t);
    const w = this.windows.get(key);
    if (!w || w.resetAt <= t) {
      this.windows.set(key, { resetAt: t + windowMs, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    w.count += 1;
    return { allowed: w.count <= limit, retryAfterMs: w.resetAt - t };
  }

  private sweep(t: number) {
    this.lastSweep = t;
    for (const [key, w] of this.windows) if (w.resetAt <= t) this.windows.delete(key);
  }
}

export interface RateLimitRule {
  /** Distinct name so different routes keep separate counters. */
  name: string;
  limit: number;
  windowMs: number;
  /** Defaults to the client IP. */
  keyOf?: (c: Context<AppEnv>) => string;
  /** Skip counting, e.g. only limit writes. */
  skip?: (c: Context<AppEnv>) => boolean;
}

/** Client address: first `X-Forwarded-For` hop behind a trusted proxy, else the socket peer. */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // no socket (tests call app.request directly)
    return "unknown";
  }
}

export function rateLimit(
  limiter: RateLimiter,
  rule: RateLimitRule,
  options: { enabled: boolean; trustProxy: boolean },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!options.enabled || rule.skip?.(c)) return next();
    const key = `${rule.name}:${rule.keyOf ? rule.keyOf(c) : clientIp(c, options.trustProxy)}`;
    const verdict = limiter.hit(key, rule.limit, rule.windowMs);
    if (!verdict.allowed) {
      const seconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
      c.header("Retry-After", String(seconds));
      return c.json(
        {
          code: "rate_limited",
          message: "Too many requests, slow down",
          retryAfterSeconds: seconds,
        },
        429,
      );
    }
    await next();
  };
}
