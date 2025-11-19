import type { AppContext } from "../context.js";
import type { AnyJobDef, JobQueue, SendOptions } from "./queue.js";

interface Pending {
  name: string;
  data: Record<string, unknown>;
  options: SendOptions;
}

/** In-process queue for tests: nothing runs until `flush()` is called. */
export class MemoryJobQueue implements JobQueue {
  readonly sent: Pending[] = [];
  private pending: Pending[] = [];
  private handlers = new Map<string, AnyJobDef["handler"]>();

  register(jobs: AnyJobDef[]) {
    for (const job of jobs) this.handlers.set(job.name, job.handler);
  }

  async send(name: string, data: Record<string, unknown>, options: SendOptions = {}) {
    const key = options.singletonKey;
    if (key && this.pending.some((p) => p.options.singletonKey === key)) return;
    const entry = { name, data, options };
    this.sent.push(entry);
    this.pending.push(entry);
  }

  /** Run every pending job (delayed ones included unless `now` is given). */
  async flush(ctx: AppContext, now?: Date): Promise<number> {
    let ran = 0;
    for (let guard = 0; guard < 20 && this.pending.length > 0; guard += 1) {
      const batch = this.pending;
      const later: Pending[] = [];
      this.pending = [];
      for (const job of batch) {
        if (now && job.options.startAfter && job.options.startAfter > now) {
          later.push(job);
          continue;
        }
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`No handler for job ${job.name}`);
        await handler(job.data as never, ctx);
        ran += 1;
      }
      this.pending.push(...later);
      if (later.length === batch.length) break;
    }
    return ran;
  }
}
