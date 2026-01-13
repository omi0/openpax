import { notificationProviderConfig, notificationSetting } from "@sitli/db";
import {
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationSettingDto,
  type ProviderConfigDto,
  type UpsertProviderConfigInput,
} from "@sitli/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { normalizePhone } from "../../lib/phone.js";
import {
  configSchemaFor,
  type NotificationProvider,
  type ProviderConfig,
} from "../../notifications/provider.js";
import { smtpConfigFromUrl } from "../../notifications/providers/smtp.js";

// ---------- settings (event × channel × audience toggles)

export const DEFAULT_SETTINGS: NotificationSettingDto[] = [
  {
    event: "booking.confirmed",
    channel: "email",
    audience: "guest",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.pending",
    channel: "email",
    audience: "guest",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.cancelled",
    channel: "email",
    audience: "guest",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.modified",
    channel: "email",
    audience: "guest",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.reminder",
    channel: "email",
    audience: "guest",
    enabled: true,
    offsetMinutes: 24 * 60,
  },
  {
    event: "booking.confirmed",
    channel: "email",
    audience: "restaurant",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.pending",
    channel: "email",
    audience: "restaurant",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.cancelled",
    channel: "email",
    audience: "restaurant",
    enabled: true,
    offsetMinutes: null,
  },
  {
    event: "booking.modified",
    channel: "email",
    audience: "restaurant",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.confirmed",
    channel: "sms",
    audience: "guest",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.pending",
    channel: "sms",
    audience: "guest",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.cancelled",
    channel: "sms",
    audience: "guest",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.modified",
    channel: "sms",
    audience: "guest",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.reminder",
    channel: "sms",
    audience: "guest",
    enabled: false,
    offsetMinutes: 3 * 60,
  },
  {
    event: "booking.confirmed",
    channel: "sms",
    audience: "restaurant",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.pending",
    channel: "sms",
    audience: "restaurant",
    enabled: false,
    offsetMinutes: null,
  },
  {
    event: "booking.cancelled",
    channel: "sms",
    audience: "restaurant",
    enabled: false,
    offsetMinutes: null,
  },
];

const settingKey = (s: { event: string; channel: string; audience: string }) =>
  `${s.event}|${s.channel}|${s.audience}`;

/** Defaults overlaid with whatever the restaurant saved, so nothing needs seeding. */
export async function getSettings(
  ctx: AppContext,
  restaurantId: string,
): Promise<NotificationSettingDto[]> {
  const rows = await ctx.db
    .select()
    .from(notificationSetting)
    .where(eq(notificationSetting.restaurantId, restaurantId));
  const saved = new Map(rows.map((r) => [settingKey(r), r]));
  return DEFAULT_SETTINGS.map((d) => {
    const row = saved.get(settingKey(d));
    return row
      ? { ...d, enabled: row.enabled, offsetMinutes: row.offsetMinutes ?? d.offsetMinutes }
      : d;
  });
}

export async function updateSettings(
  ctx: AppContext,
  r: RestaurantRow,
  settings: NotificationSettingDto[],
  actor: Actor,
): Promise<NotificationSettingDto[]> {
  const known = new Set(DEFAULT_SETTINGS.map(settingKey));
  for (const s of settings) {
    if (!known.has(settingKey(s)))
      throw ApiError.badRequest("unknown_setting", `Unsupported notification: ${settingKey(s)}`);
  }
  await ctx.db.transaction(async (tx) => {
    for (const s of settings) {
      await tx
        .insert(notificationSetting)
        .values({
          restaurantId: r.id,
          event: s.event,
          channel: s.channel,
          audience: s.audience,
          enabled: s.enabled,
          offsetMinutes: s.offsetMinutes,
        })
        .onConflictDoUpdate({
          target: [
            notificationSetting.restaurantId,
            notificationSetting.event,
            notificationSetting.channel,
            notificationSetting.audience,
          ],
          set: { enabled: s.enabled, offsetMinutes: s.offsetMinutes },
        });
    }
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "notifications.settings_updated",
      entityType: "notification_setting",
      data: { count: settings.length },
    });
  });
  return getSettings(ctx, r.id);
}

// ---------- provider configuration

export interface ResolvedProvider {
  provider: NotificationProvider;
  config: ProviderConfig;
  scope: "restaurant" | "organization" | "instance";
  row: typeof notificationProviderConfig.$inferSelect | null;
}

function decryptConfig(
  ctx: AppContext,
  provider: NotificationProvider,
  stored: Record<string, unknown>,
): ProviderConfig {
  const out: ProviderConfig = {};
  for (const f of provider.fields) {
    const v = stored[f.key];
    if (v === undefined || v === null) {
      out[f.key] = null;
      continue;
    }
    out[f.key] =
      f.secret && ctx.secrets.isEncrypted(v)
        ? ctx.secrets.decrypt(v)
        : (v as string | number | boolean);
  }
  return out;
}

export interface ProviderScope {
  restaurantId: string | null;
  organizationId: string | null;
}

async function findConfigRow(
  ctx: AppContext,
  ids: ProviderScope,
  channel: NotificationChannel,
  scope: "restaurant" | "organization",
) {
  if (scope === "restaurant" && !ids.restaurantId) return null;
  if (scope === "organization" && !ids.organizationId) return null;
  const where =
    scope === "restaurant"
      ? and(
          eq(notificationProviderConfig.restaurantId, ids.restaurantId ?? ""),
          eq(notificationProviderConfig.channel, channel),
        )
      : and(
          eq(notificationProviderConfig.organizationId, ids.organizationId ?? ""),
          isNull(notificationProviderConfig.restaurantId),
          eq(notificationProviderConfig.channel, channel),
        );
  const [row] = await ctx.db.select().from(notificationProviderConfig).where(where).limit(1);
  return row ?? null;
}

/** Restaurant config → organization default → instance SMTP fallback (email only). */
export async function resolveProvider(
  ctx: AppContext,
  r: RestaurantRow,
  channel: NotificationChannel,
): Promise<ResolvedProvider | null> {
  return resolveProviderFor(ctx, { restaurantId: r.id, organizationId: r.organizationId }, channel);
}

/** Same lookup for callers without a restaurant row (account emails, organization events). */
export async function resolveProviderFor(
  ctx: AppContext,
  ids: ProviderScope,
  channel: NotificationChannel,
): Promise<ResolvedProvider | null> {
  for (const scope of ["restaurant", "organization"] as const) {
    const row = await findConfigRow(ctx, ids, channel, scope);
    if (!row?.enabled) continue;
    const provider = ctx.providers.get(row.providerId);
    if (!provider || provider.channel !== channel) continue;
    return { provider, config: decryptConfig(ctx, provider, row.config), scope, row };
  }
  if (channel === "email" && ctx.env.SMTP_URL) {
    const provider = ctx.providers.get("smtp");
    if (provider) {
      return {
        provider,
        config: smtpConfigFromUrl(
          ctx.env.SMTP_URL,
          ctx.env.SMTP_FROM ?? "Sitli <no-reply@localhost>",
        ),
        scope: "instance",
        row: null,
      };
    }
  }
  return null;
}

function maskConfig(
  ctx: AppContext,
  provider: NotificationProvider,
  stored: Record<string, unknown>,
): ProviderConfigDto["config"] {
  const out: ProviderConfigDto["config"] = {};
  for (const f of provider.fields) {
    const v = stored[f.key];
    if (f.secret) {
      if (v === undefined || v === null || v === "") out[f.key] = { set: false };
      else {
        const plain = ctx.secrets.isEncrypted(v) ? ctx.secrets.decrypt(v) : String(v);
        out[f.key] = { set: true, last4: plain.slice(-4) };
      }
    } else out[f.key] = (v as string | number | boolean | null | undefined) ?? null;
  }
  return out;
}

export async function getProviderConfigDto(
  ctx: AppContext,
  r: RestaurantRow,
  channel: NotificationChannel,
): Promise<ProviderConfigDto> {
  const resolved = await resolveProvider(ctx, r, channel);
  if (!resolved)
    return {
      channel,
      providerId: null,
      enabled: false,
      scope: "none",
      config: {},
      updatedAt: null,
    };
  const stored = resolved.row?.config ?? (resolved.config as Record<string, unknown>);
  return {
    channel,
    providerId: resolved.provider.id,
    enabled: true,
    scope: resolved.scope,
    config: maskConfig(ctx, resolved.provider, stored),
    updatedAt: resolved.row?.updatedAt.toISOString() ?? null,
  };
}

export async function upsertProviderConfig(
  ctx: AppContext,
  r: RestaurantRow,
  channel: NotificationChannel,
  input: UpsertProviderConfigInput,
  actor: Actor,
): Promise<ProviderConfigDto> {
  const provider = ctx.providers.get(input.providerId);
  if (!provider || provider.channel !== channel)
    throw ApiError.badRequest("unknown_provider", `No ${channel} provider "${input.providerId}"`);

  const existing = await findConfigRow(
    ctx,
    { restaurantId: r.id, organizationId: r.organizationId },
    channel,
    input.scope,
  );
  const previous = existing?.providerId === provider.id ? existing.config : {};

  // Omitted secrets keep their stored value; everything else is validated fresh.
  const merged: Record<string, unknown> = { ...input.config };
  for (const f of provider.fields) {
    if (
      f.secret &&
      (merged[f.key] === undefined || merged[f.key] === "") &&
      previous[f.key] !== undefined
    ) {
      const stored = previous[f.key];
      merged[f.key] = ctx.secrets.isEncrypted(stored) ? ctx.secrets.decrypt(stored) : stored;
    }
  }
  const parsed = configSchemaFor(provider).safeParse(merged);
  if (!parsed.success) {
    throw ApiError.badRequest("invalid_provider_config", "Provider configuration is invalid", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const toStore: Record<string, unknown> = {};
  for (const f of provider.fields) {
    const v = parsed.data[f.key];
    toStore[f.key] =
      f.secret && typeof v === "string" && v !== "" ? ctx.secrets.encrypt(v) : (v ?? null);
  }

  const values = {
    organizationId: r.organizationId,
    restaurantId: input.scope === "restaurant" ? r.id : null,
    channel,
    providerId: provider.id,
    config: toStore,
    enabled: input.enabled,
    updatedByUserId: actor.type === "user" ? actor.id : null,
  };
  await ctx.db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(notificationProviderConfig)
        .set(values)
        .where(eq(notificationProviderConfig.id, existing.id));
    } else {
      await tx.insert(notificationProviderConfig).values(values);
    }
    await writeAudit(tx, {
      restaurantId: r.id,
      organizationId: r.organizationId,
      actor,
      action: "notifications.provider_updated",
      entityType: "notification_provider_config",
      data: { channel, providerId: provider.id, scope: input.scope, enabled: input.enabled },
    });
  });
  return getProviderConfigDto(ctx, r, channel);
}

export async function disableProviderConfig(
  ctx: AppContext,
  r: RestaurantRow,
  channel: NotificationChannel,
  scope: "restaurant" | "organization",
  actor: Actor,
): Promise<ProviderConfigDto> {
  const existing = await findConfigRow(
    ctx,
    { restaurantId: r.id, organizationId: r.organizationId },
    channel,
    scope,
  );
  if (existing) {
    await ctx.db
      .delete(notificationProviderConfig)
      .where(eq(notificationProviderConfig.id, existing.id));
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      organizationId: r.organizationId,
      actor,
      action: "notifications.provider_removed",
      entityType: "notification_provider_config",
      data: { channel, scope },
    });
  }
  return getProviderConfigDto(ctx, r, channel);
}

export async function sendTestMessage(
  ctx: AppContext,
  r: RestaurantRow,
  channel: NotificationChannel,
  to: string,
): Promise<{ providerId: string; scope: string }> {
  const resolved = await resolveProvider(ctx, r, channel);
  if (!resolved) throw ApiError.badRequest("no_provider", `No ${channel} provider is configured`);
  const { renderTestEmail } = await import("@sitli/emails");
  if (channel === "email") {
    const email = renderTestEmail({
      locale: r.locale as "it" | "en",
      restaurantName: r.name,
      primaryColor: "#1f6f5f",
      providerLabel: resolved.provider.label,
    });
    await (resolved.provider as NotificationProvider<"email">).send(
      { to, subject: email.subject, html: email.html, text: email.text },
      resolved.config,
    );
  } else {
    const phone = normalizePhone(to, r.locale);
    if (!phone) throw ApiError.badRequest("invalid_phone", "Enter a valid phone number");
    const body =
      r.locale === "it"
        ? `Sitli: SMS di prova da ${r.name}. La configurazione funziona.`
        : `Sitli: test SMS from ${r.name}. Your configuration works.`;
    await (resolved.provider as NotificationProvider<"sms">).send(
      { to: phone, body },
      resolved.config,
    );
  }
  return { providerId: resolved.provider.id, scope: resolved.scope };
}

export const isNotificationEvent = (v: string): v is (typeof NOTIFICATION_EVENTS)[number] =>
  (NOTIFICATION_EVENTS as readonly string[]).includes(v);
