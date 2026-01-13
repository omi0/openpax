import { member, notificationLog, restaurant, widgetConfig } from "@sitli/db";
import { renderPasswordResetEmail } from "@sitli/emails";
import { asc, eq, sql } from "drizzle-orm";
import { RESET_PASSWORD_TTL_SECONDS } from "../../auth/create-auth.js";
import { defineJob } from "../../jobs/queue.js";
import type { NotificationProvider } from "../../notifications/provider.js";
import { resolveProviderFor } from "./service.js";

/**
 * Account emails have no restaurant of their own: use the provider of the
 * user's first restaurant (restaurant → organization → instance SMTP), or the
 * instance SMTP fallback alone for users who have not created one yet.
 */
export const passwordResetJob = defineJob<{
  userId: string;
  email: string;
  name: string;
  url: string;
  requestId: string;
}>({
  name: "notify.password_reset",
  retryLimit: 3,
  retryDelaySeconds: 30,
  handler: async ({ userId, email, name, url, requestId }, ctx) => {
    const [home] = await ctx.db
      .select({ restaurant, widget: widgetConfig })
      .from(member)
      .innerJoin(restaurant, eq(restaurant.organizationId, member.organizationId))
      .leftJoin(widgetConfig, eq(widgetConfig.restaurantId, restaurant.id))
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt), asc(restaurant.createdAt))
      .limit(1);

    const dedupeKey = `password_reset:${requestId}`;
    if (home) {
      await ctx.db
        .insert(notificationLog)
        .values({
          restaurantId: home.restaurant.id,
          bookingId: null,
          event: "account.password_reset",
          channel: "email",
          audience: "restaurant",
          dedupeKey,
          recipient: email,
          status: "queued",
        })
        .onConflictDoNothing({ target: notificationLog.dedupeKey });
      const [log] = await ctx.db
        .select({ status: notificationLog.status })
        .from(notificationLog)
        .where(eq(notificationLog.dedupeKey, dedupeKey))
        .limit(1);
      if (log?.status === "sent" || log?.status === "skipped") return;
    }

    const resolved = await resolveProviderFor(
      ctx,
      {
        restaurantId: home?.restaurant.id ?? null,
        organizationId: home?.restaurant.organizationId ?? null,
      },
      "email",
    );
    const mark = async (patch: Partial<typeof notificationLog.$inferInsert>) => {
      if (!home) return;
      await ctx.db
        .update(notificationLog)
        .set({ ...patch, attempts: sql`${notificationLog.attempts} + 1` })
        .where(eq(notificationLog.dedupeKey, dedupeKey));
    };
    if (!resolved) {
      await mark({ status: "skipped", error: "no email provider configured" });
      ctx.logger.warn(
        { email },
        "password reset requested but no email provider is configured (set SMTP_URL)",
      );
      return;
    }

    const rendered = renderPasswordResetEmail({
      locale: home?.restaurant.locale === "it" ? "it" : "en",
      name,
      resetUrl: url,
      expiresMinutes: RESET_PASSWORD_TTL_SECONDS / 60,
      brandName: home?.restaurant.name ?? "Sitli",
      primaryColor: home?.widget?.primaryColor ?? "#1f6f5f",
      logoUrl: home?.widget?.logoUrl ?? null,
    });
    try {
      const result = await (resolved.provider as NotificationProvider<"email">).send(
        {
          to: email,
          toName: name,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        },
        resolved.config,
      );
      await mark({
        status: "sent",
        providerId: resolved.provider.id,
        providerMessageId: result.providerMessageId ?? null,
        error: null,
        sentAt: ctx.now(),
      });
    } catch (error) {
      await mark({
        status: "failed",
        providerId: resolved.provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
