import {
  invitation,
  notificationLog,
  organization,
  restaurant,
  user,
  widgetConfig,
} from "@openpax/db";
import { renderInvitationEmail } from "@openpax/emails";
import { asc, eq, sql } from "drizzle-orm";
import { defineEventHandler } from "../../events/dispatch.js";
import { defineJob } from "../../jobs/queue.js";
import type { NotificationProvider } from "../../notifications/provider.js";
import { resolveProvider } from "./service.js";

export const invitationCreatedHandler = defineEventHandler({
  type: "team.invitation_created",
  handle: async (event, ctx) => {
    await ctx.jobs.send("notify.invitation", {
      invitationId: event.payload.invitationId,
      dedupeKey: `invitation:${event.id}`,
    });
  },
});

/**
 * Team invitations are organization-level, so the email goes out through the
 * provider of the organization's first restaurant (restaurant → organization
 * → instance fallback) and is logged against that restaurant.
 */
export const invitationEmailJob = defineJob<{ invitationId: string; dedupeKey: string }>({
  name: "notify.invitation",
  retryLimit: 3,
  retryDelaySeconds: 60,
  handler: async ({ invitationId, dedupeKey }, ctx) => {
    const [row] = await ctx.db
      .select({ invitation, organization, inviter: user })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .innerJoin(user, eq(user.id, invitation.inviterId))
      .where(eq(invitation.id, invitationId))
      .limit(1);
    if (row?.invitation.status !== "pending") return;

    const [home] = await ctx.db
      .select({ restaurant, widget: widgetConfig })
      .from(restaurant)
      .leftJoin(widgetConfig, eq(widgetConfig.restaurantId, restaurant.id))
      .where(eq(restaurant.organizationId, row.organization.id))
      .orderBy(asc(restaurant.createdAt))
      .limit(1);
    const acceptUrl = `${ctx.env.PUBLIC_URL}/invitations/${row.invitation.id}`;
    if (!home) {
      ctx.logger.warn({ email: row.invitation.email, acceptUrl }, "invitation without restaurant");
      return;
    }

    await ctx.db
      .insert(notificationLog)
      .values({
        restaurantId: home.restaurant.id,
        bookingId: null,
        event: "team.invitation",
        channel: "email",
        audience: "restaurant",
        dedupeKey,
        recipient: row.invitation.email,
        status: "queued",
      })
      .onConflictDoNothing({ target: notificationLog.dedupeKey });
    const [log] = await ctx.db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.dedupeKey, dedupeKey))
      .limit(1);
    if (!log || log.status === "sent" || log.status === "skipped") return;

    const resolved = await resolveProvider(ctx, home.restaurant, "email");
    if (!resolved) {
      await ctx.db
        .update(notificationLog)
        .set({ status: "skipped", error: "no email provider configured" })
        .where(eq(notificationLog.id, log.id));
      ctx.logger.warn(
        { email: row.invitation.email, acceptUrl },
        "invitation created but no email provider is configured; share the link manually",
      );
      return;
    }

    const locale = home.restaurant.locale === "it" ? "it" : "en";
    const rendered = renderInvitationEmail({
      locale,
      organizationName: row.organization.name,
      inviterName: row.inviter.name,
      role: row.invitation.role ?? "staff",
      acceptUrl,
      expiresAt: row.invitation.expiresAt,
      timezone: home.restaurant.timezone,
      primaryColor: home.widget?.primaryColor ?? "#1f6f5f",
      logoUrl: home.widget?.logoUrl ?? null,
    });
    try {
      const result = await (resolved.provider as NotificationProvider<"email">).send(
        {
          to: row.invitation.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          replyTo: row.inviter.email,
        },
        resolved.config,
      );
      await ctx.db
        .update(notificationLog)
        .set({
          status: "sent",
          providerId: resolved.provider.id,
          providerMessageId: result.providerMessageId ?? null,
          error: null,
          sentAt: ctx.now(),
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, log.id));
    } catch (error) {
      await ctx.db
        .update(notificationLog)
        .set({
          status: "failed",
          providerId: resolved.provider.id,
          error: error instanceof Error ? error.message : String(error),
          attempts: sql`${notificationLog.attempts} + 1`,
        })
        .where(eq(notificationLog.id, log.id));
      throw error;
    }
  },
});
