import { formatWhen, renderBookingEmail } from "@sitli/emails";
import type { Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";
import { renderSms } from "@sitli/shared/sms";
import type { AppContext } from "../../context.js";
import type { EmailMessage, SmsMessage } from "../../notifications/provider.js";
import type { BookingBundle } from "./dispatch.js";
import { effectiveEmailTemplate, getTemplateOverride } from "./templates.js";

const asLocale = (v: string | null | undefined, fallback: Locale): Locale =>
  v === "it" || v === "en" ? v : fallback;

export async function buildEmail(
  ctx: AppContext,
  bundle: BookingBundle,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): Promise<EmailMessage> {
  const restaurantLocale = asLocale(bundle.restaurant.locale, "en");
  const locale =
    audience === "guest" ? asLocale(bundle.booking.locale, restaurantLocale) : restaurantLocale;
  const key = { event, channel: "email" as const, audience, locale };
  const override = await getTemplateOverride(ctx, bundle.restaurant.id, key);
  const rendered = renderBookingEmail({
    event,
    audience,
    locale,
    restaurant: {
      name: bundle.restaurant.name,
      timezone: bundle.restaurant.timezone,
      address: bundle.restaurant.address,
      primaryColor: bundle.widget?.primaryColor ?? "#1f6f5f",
      logoUrl: bundle.widget?.logoUrl ?? null,
    },
    booking: {
      startsAt: bundle.booking.startsAt,
      partySize: bundle.booking.partySize,
      confirmationCode: bundle.booking.confirmationCode,
      serviceName: bundle.serviceName,
      notes: bundle.booking.notes,
      cancellationReason: bundle.booking.cancellationReason,
    },
    template: override ? effectiveEmailTemplate(key, override) : null,
    guest: {
      name: bundle.customer.name,
      email: bundle.customer.email,
      phone: bundle.customer.phone,
    },
    manageUrl: `${ctx.env.PUBLIC_URL}/book/${bundle.restaurant.slug}/manage/${bundle.booking.manageToken}`,
    dashboardUrl: `${ctx.env.PUBLIC_URL}/r/${bundle.restaurant.id}/today?date=${bundle.booking.serviceDate}`,
  });
  return {
    to,
    toName: audience === "guest" ? bundle.customer.name : bundle.restaurant.name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(audience === "guest" && bundle.restaurant.email
      ? { replyTo: bundle.restaurant.email }
      : {}),
  };
}

export async function buildSms(
  ctx: AppContext,
  bundle: BookingBundle,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): Promise<SmsMessage> {
  const restaurantLocale = asLocale(bundle.restaurant.locale, "en");
  const locale =
    audience === "guest" ? asLocale(bundle.booking.locale, restaurantLocale) : restaurantLocale;
  const override = await getTemplateOverride(ctx, bundle.restaurant.id, {
    event,
    channel: "sms",
    audience,
    locale,
  });
  const body = renderSms(
    event,
    locale,
    audience,
    {
      restaurantName: bundle.restaurant.name,
      guestName: bundle.customer.name,
      when: formatWhen(bundle.booking.startsAt, bundle.restaurant.timezone, locale),
      partySize: bundle.booking.partySize,
      confirmationCode: bundle.booking.confirmationCode,
      serviceName: bundle.serviceName,
      manageUrl:
        audience === "guest"
          ? `${ctx.env.PUBLIC_URL}/book/${bundle.restaurant.slug}/manage/${bundle.booking.manageToken}`
          : "",
      guestPhone: bundle.customer.phone ?? "",
      guestEmail: bundle.customer.email ?? "",
      notes: bundle.booking.notes ?? "",
      address: bundle.restaurant.address ?? "",
      cancellationReason: bundle.booking.cancellationReason ?? "",
    },
    override ? { body: override.body } : null,
  );
  return { to, body };
}
