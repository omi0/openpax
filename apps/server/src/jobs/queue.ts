import type { AppContext } from "../context.js";

export interface SendOptions {
  startAfter?: Date;
  /** Only one job with this key may be queued/active at a time. */
  singletonKey?: string;
}

export interface JobQueue {
  send(name: string, data: Record<string, unknown>, options?: SendOptions): Promise<void>;
}

export interface JobDef<T = Record<string, unknown>> {
  name: string;
  /** How many times pg-boss retries a failing job (default 3). */
  retryLimit?: number;
  retryDelaySeconds?: number;
  handler: (data: T, ctx: AppContext) => Promise<void>;
}

/** Any job, regardless of its payload type (handlers are invoked with `never`-typed data). */
export type AnyJobDef = JobDef<never>;

export function defineJob<T extends Record<string, unknown>>(def: JobDef<T>): JobDef<T> {
  return def;
}
