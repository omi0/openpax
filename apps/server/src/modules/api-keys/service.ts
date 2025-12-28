import { apikey } from "@sitli/db";
import type { ApiKeyDto, CreateApiKeyInput, CreatedApiKeyDto } from "@sitli/shared";
import { and, desc, eq } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { callAuth } from "../../lib/auth-call.js";
import { ApiError } from "../../lib/errors.js";

type KeyRow = typeof apikey.$inferSelect;

const toDto = (row: {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean | null;
  expiresAt: Date | null;
  lastRequest: Date | null;
  requestCount: number | null;
  createdAt: Date;
}): ApiKeyDto => ({
  id: row.id,
  name: row.name,
  start: row.start,
  enabled: row.enabled ?? true,
  expiresAt: row.expiresAt?.toISOString() ?? null,
  lastUsedAt: row.lastRequest?.toISOString() ?? null,
  requestCount: row.requestCount ?? 0,
  createdAt: row.createdAt.toISOString(),
});

export async function listApiKeys(ctx: AppContext, r: RestaurantRow): Promise<ApiKeyDto[]> {
  const rows: KeyRow[] = await ctx.db
    .select()
    .from(apikey)
    .where(eq(apikey.referenceId, r.organizationId))
    .orderBy(desc(apikey.createdAt));
  return rows.map(toDto);
}

export async function createApiKey(
  ctx: AppContext,
  r: RestaurantRow,
  input: CreateApiKeyInput,
  actor: Actor,
  headers: Headers,
): Promise<CreatedApiKeyDto> {
  if (actor.type !== "user")
    throw ApiError.forbidden("API keys are managed from the dashboard by signed-in users");
  const created = await callAuth(() =>
    ctx.auth.api.createApiKey({
      body: {
        name: input.name,
        organizationId: r.organizationId,
        prefix: "sitli_",
        expiresIn: input.expiresInDays ? input.expiresInDays * 24 * 60 * 60 : null,
        metadata: { createdFromRestaurantId: r.id },
      },
      headers,
    }),
  );
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "api_key.created",
    entityType: "api_key",
    entityId: created.id,
    data: { name: input.name, expiresAt: created.expiresAt ?? null },
  });
  return {
    ...toDto({
      id: created.id,
      name: created.name,
      start: created.start,
      enabled: created.enabled,
      expiresAt: created.expiresAt ? new Date(created.expiresAt) : null,
      lastRequest: null,
      requestCount: 0,
      createdAt: new Date(created.createdAt),
    }),
    key: created.key,
  };
}

export async function deleteApiKey(
  ctx: AppContext,
  r: RestaurantRow,
  keyId: string,
  actor: Actor,
  headers: Headers,
): Promise<void> {
  if (actor.type !== "user")
    throw ApiError.forbidden("API keys are managed from the dashboard by signed-in users");
  const [row] = await ctx.db
    .select({ id: apikey.id, name: apikey.name })
    .from(apikey)
    .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, r.organizationId)))
    .limit(1);
  if (!row) throw ApiError.notFound("API key");
  await callAuth(() => ctx.auth.api.deleteApiKey({ body: { keyId }, headers }));
  await writeAudit(ctx.db, {
    restaurantId: r.id,
    organizationId: r.organizationId,
    actor,
    action: "api_key.deleted",
    entityType: "api_key",
    entityId: keyId,
    data: { name: row.name },
  });
}
