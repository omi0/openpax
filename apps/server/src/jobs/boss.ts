import { PgBoss } from "pg-boss";
import type { AppContext } from "../context.js";
import type { Logger } from "../logger.js";
import type { AnyJobDef, JobQueue, SendOptions } from "./queue.js";

export class PgBossQueue implements JobQueue {
  constructor(private readonly boss: PgBoss) {}

  async send(name: string, data: Record<string, unknown>, options: SendOptions = {}) {
    await this.boss.send(name, data, {
      ...(options.startAfter ? { startAfter: options.startAfter } : {}),
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
    });
  }
}

export async function createBoss(connectionString: string, logger: Logger): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: "pgboss", max: 5 });
  boss.on("error", (error) => logger.error({ err: error }, "pg-boss error"));
  await boss.start();
  return boss;
}

/** Create queues for every job and, when `work` is true, start consuming them. */
export async function registerJobs(
  boss: PgBoss,
  jobs: AnyJobDef[],
  ctx: AppContext,
  work: boolean,
) {
  for (const job of jobs) {
    await boss.createQueue(job.name, {
      retryLimit: job.retryLimit ?? 3,
      retryDelay: job.retryDelaySeconds ?? 30,
      retryBackoff: true,
      expireInSeconds: 120,
    });
    if (!work) continue;
    // one job per fetch so a failure only retries that job
    await boss.work(job.name, { pollingIntervalSeconds: 1, batchSize: 1 }, async (batch) => {
      for (const item of batch) {
        try {
          await job.handler(item.data as never, ctx);
        } catch (error) {
          ctx.logger.error({ err: error, job: job.name, id: item.id }, "job failed");
          throw error;
        }
      }
    });
  }
}
