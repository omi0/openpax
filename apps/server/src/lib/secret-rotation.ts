import { notificationProviderConfig, paymentConfig } from "@openpax/db";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";

/**
 * Re-encrypt every stored secret that still uses a previous key. Idempotent:
 * values already under the current key are left alone. Runs at boot while
 * `APP_ENCRYPTION_KEY_PREVIOUS` is set.
 */
export async function rotateStoredSecrets(
  ctx: AppContext,
): Promise<{ rotated: number; failed: number }> {
  let rotated = 0;
  let failed = 0;

  const rotateConfig = (config: Record<string, unknown>, secretKeys: string[]) => {
    let changed = false;
    const next = { ...config };
    for (const key of secretKeys) {
      const value = next[key];
      if (!ctx.secrets.isEncrypted(value)) continue;
      try {
        const fresh = ctx.secrets.rotate(value);
        if (fresh) {
          next[key] = fresh;
          changed = true;
        }
      } catch (error) {
        failed += 1;
        ctx.logger.error({ err: error, key }, "stored secret does not open with any key");
      }
    }
    return changed ? next : null;
  };

  const providerRows = await ctx.db.select().from(notificationProviderConfig);
  for (const row of providerRows) {
    const provider = ctx.providers.get(row.providerId);
    const secretFields = provider
      ? provider.fields.filter((f) => f.secret).map((f) => f.key)
      : Object.keys(row.config);
    const next = rotateConfig(row.config, secretFields);
    if (!next) continue;
    await ctx.db
      .update(notificationProviderConfig)
      .set({ config: next })
      .where(eq(notificationProviderConfig.id, row.id));
    rotated += 1;
  }

  const paymentRows = await ctx.db.select().from(paymentConfig);
  for (const row of paymentRows) {
    const next = rotateConfig(row.config, ["secretKey", "webhookSecret"]);
    if (!next) continue;
    await ctx.db
      .update(paymentConfig)
      .set({ config: next })
      .where(eq(paymentConfig.restaurantId, row.restaurantId));
    rotated += 1;
  }

  return { rotated, failed };
}
