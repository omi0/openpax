import { notificationTemplate, widgetConfig } from "@sitli/db";
import { formatWhen, renderBookingEmail } from "@sitli/emails";
import {
  defaultTemplates,
  type EmailTemplate,
  type Locale,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationTemplateDto,
  type NotificationTemplatePreview,
  type TemplateVars,
  templateEvents,
  type UpsertNotificationTemplateInput,
  unknownPlaceholders,
} from "@sitli/shared";
import { renderSms } from "@sitli/shared/sms";
import { and, eq } from "drizzle-orm";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";

export interface TemplateKey {
  event: NotificationEvent;
  channel: NotificationChannel;
  audience: NotificationAudience;
  locale: Locale;
}

type Row = typeof notificationTemplate.$inferSelect;

export async function getTemplateOverride(
  ctx: AppContext,
  restaurantId: string,
  key: TemplateKey,
): Promise<Row | null> {
  const [row] = await ctx.db
    .select()
    .from(notificationTemplate)
    .where(
      and(
        eq(notificationTemplate.restaurantId, restaurantId),
        eq(notificationTemplate.event, key.event),
        eq(notificationTemplate.channel, key.channel),
        eq(notificationTemplate.audience, key.audience),
        eq(notificationTemplate.locale, key.locale),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The email template in effect: the restaurant's own text, defaults filling any gap. */
export function effectiveEmailTemplate(key: TemplateKey, row: Row | null): EmailTemplate {
  const base = defaultTemplates(key.locale, key.audience, key.event).email;
  if (!row) return base;
  return {
    subject: row.subject ?? base.subject,
    heading: row.heading ?? base.heading,
    body: row.body,
  };
}

function toDto(key: TemplateKey, row: Row | null): NotificationTemplateDto {
  const defaults = defaultTemplates(key.locale, key.audience, key.event);
  if (key.channel === "email") {
    const t = effectiveEmailTemplate(key, row);
    return {
      ...key,
      subject: t.subject,
      heading: t.heading,
      body: t.body,
      custom: !!row,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
  return {
    ...key,
    subject: null,
    heading: null,
    body: row?.body ?? defaults.sms.body,
    custom: !!row,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function listTemplates(
  ctx: AppContext,
  restaurantId: string,
  locale: Locale,
): Promise<NotificationTemplateDto[]> {
  const rows = await ctx.db
    .select()
    .from(notificationTemplate)
    .where(
      and(
        eq(notificationTemplate.restaurantId, restaurantId),
        eq(notificationTemplate.locale, locale),
      ),
    );
  const byKey = new Map(rows.map((r) => [`${r.event}|${r.channel}|${r.audience}`, r]));
  const out: NotificationTemplateDto[] = [];
  for (const audience of NOTIFICATION_AUDIENCES) {
    for (const event of templateEvents(audience)) {
      for (const channel of NOTIFICATION_CHANNELS) {
        const key = { event, channel, audience, locale };
        out.push(toDto(key, byKey.get(`${event}|${channel}|${audience}`) ?? null));
      }
    }
  }
  return out;
}

function validate(input: UpsertNotificationTemplateInput) {
  if (!templateEvents(input.audience).includes(input.event))
    throw ApiError.badRequest("unknown_template", "No such message for this audience");
  const texts = [input.body, input.subject ?? "", input.heading ?? ""];
  const unknown = texts.flatMap(unknownPlaceholders);
  if (unknown.length > 0)
    throw ApiError.badRequest(
      "unknown_placeholder",
      `Unknown placeholder: ${[...new Set(unknown)].map((n) => `{{${n}}}`).join(", ")}`,
      { placeholders: [...new Set(unknown)] },
    );
}

export async function upsertTemplate(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertNotificationTemplateInput,
  actor: Actor,
): Promise<NotificationTemplateDto> {
  validate(input);
  const key: TemplateKey = {
    event: input.event,
    channel: input.channel,
    audience: input.audience,
    locale: input.locale,
  };
  const values = {
    restaurantId: r.id,
    ...key,
    subject: input.channel === "email" ? input.subject || null : null,
    heading: input.channel === "email" ? input.heading || null : null,
    body: input.body,
    updatedByUserId: actor.type === "user" ? actor.id : null,
  };
  const row = await ctx.db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(notificationTemplate)
      .values(values)
      .onConflictDoUpdate({
        target: [
          notificationTemplate.restaurantId,
          notificationTemplate.event,
          notificationTemplate.channel,
          notificationTemplate.audience,
          notificationTemplate.locale,
        ],
        set: {
          subject: values.subject,
          heading: values.heading,
          body: values.body,
          updatedByUserId: values.updatedByUserId,
        },
      })
      .returning();
    await writeAudit(tx, {
      restaurantId: r.id,
      actor,
      action: "notifications.template_updated",
      entityType: "notification_template",
      entityId: saved?.id ?? null,
      data: { ...key },
    });
    return saved ?? null;
  });
  return toDto(key, row);
}

export async function resetTemplate(
  ctx: AppContext,
  r: RestaurantRow,
  key: TemplateKey,
  actor: Actor,
): Promise<NotificationTemplateDto> {
  const [removed] = await ctx.db
    .delete(notificationTemplate)
    .where(
      and(
        eq(notificationTemplate.restaurantId, r.id),
        eq(notificationTemplate.event, key.event),
        eq(notificationTemplate.channel, key.channel),
        eq(notificationTemplate.audience, key.audience),
        eq(notificationTemplate.locale, key.locale),
      ),
    )
    .returning({ id: notificationTemplate.id });
  if (removed) {
    await writeAudit(ctx.db, {
      restaurantId: r.id,
      actor,
      action: "notifications.template_reset",
      entityType: "notification_template",
      entityId: removed.id,
      data: { ...key },
    });
  }
  return toDto(key, null);
}

/** Sample values used by the editor preview. */
export function sampleVars(
  ctx: AppContext,
  r: RestaurantRow,
  locale: Locale,
  event?: NotificationEvent,
): TemplateVars & {
  startsAt: Date;
} {
  const startsAt = new Date(ctx.now().getTime() + 24 * 60 * 60 * 1000);
  startsAt.setUTCMinutes(0, 0, 0);
  const waitlist = event?.startsWith("waitlist.") ?? false;
  return {
    startsAt,
    restaurantName: r.name,
    guestName: "Mario Rossi",
    when: formatWhen(startsAt, r.timezone, locale),
    partySize: 4,
    // waitlist messages go out before a booking (and its code) exists
    confirmationCode: waitlist ? "" : "AB12CD",
    serviceName: locale === "it" ? "Cena" : "Dinner",
    manageUrl: waitlist
      ? `${ctx.env.PUBLIC_URL}/book/${r.slug}/waitlist/example`
      : `${ctx.env.PUBLIC_URL}/book/${r.slug}/manage/example`,
    guestPhone: "+39 333 1234567",
    guestEmail: "mario@example.com",
    notes:
      locale === "it" ? "Tavolo vicino alla finestra, se possibile" : "Window table if possible",
    address: r.address ?? "",
    cancellationReason: "",
    paymentUrl: `${ctx.env.PUBLIC_URL}/book/${r.slug}/manage/example?payment=1`,
    depositAmount: locale === "it" ? "40,00 €" : "€40.00",
    feedbackUrl: `${ctx.env.PUBLIC_URL}/book/${r.slug}/feedback/example`,
    rating: "5",
    feedbackComment: locale === "it" ? "Tutto perfetto, torneremo!" : "Everything was perfect!",
  };
}

export async function previewTemplate(
  ctx: AppContext,
  r: RestaurantRow,
  input: UpsertNotificationTemplateInput,
): Promise<NotificationTemplatePreview> {
  validate(input);
  const vars = sampleVars(ctx, r, input.locale, input.event);
  if (input.channel === "sms") {
    return {
      subject: null,
      html: null,
      text: renderSms(input.event, input.locale, input.audience, vars, { body: input.body }),
    };
  }
  const [widget] = await ctx.db
    .select()
    .from(widgetConfig)
    .where(eq(widgetConfig.restaurantId, r.id))
    .limit(1);
  const base = defaultTemplates(input.locale, input.audience, input.event).email;
  const rendered = renderBookingEmail({
    event: input.event,
    audience: input.audience,
    locale: input.locale,
    restaurant: {
      name: r.name,
      timezone: r.timezone,
      address: r.address,
      primaryColor: widget?.primaryColor ?? "#1f6f5f",
      logoUrl: widget?.logoUrl ?? null,
    },
    booking: {
      startsAt: vars.startsAt,
      partySize: 4,
      confirmationCode: String(vars.confirmationCode),
      serviceName: String(vars.serviceName),
      notes: String(vars.notes),
      cancellationReason: null,
    },
    guest: { name: "Mario Rossi", email: "mario@example.com", phone: "+39 333 1234567" },
    manageUrl:
      input.event === "booking.payment_required"
        ? String(vars.paymentUrl)
        : input.event === "booking.feedback_request"
          ? String(vars.feedbackUrl)
          : String(vars.manageUrl),
    payment: { paymentUrl: String(vars.paymentUrl), depositAmount: String(vars.depositAmount) },
    feedback: {
      feedbackUrl: String(vars.feedbackUrl),
      rating: String(vars.rating),
      feedbackComment: String(vars.feedbackComment),
    },
    dashboardUrl: `${ctx.env.PUBLIC_URL}/r/${r.id}/today`,
    template: {
      subject: input.subject || base.subject,
      heading: input.heading || base.heading,
      body: input.body,
    },
  });
  return { subject: rendered.subject, html: rendered.html, text: rendered.text };
}
