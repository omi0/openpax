import { formatWhen, renderBookingEmail } from "@sitli/emails";
import type { Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";
import { renderSms } from "@sitli/shared/sms";
import type { AppContext } from "../../context.js";
import type { EmailMessage, SmsMessage } from "../../notifications/provider.js";
import type { BookingBundle } from "./dispatch.js";

const asLocale = (v: string | null | undefined, fallback: Locale): Locale =>
  v === "it" || v === "en" ? v : fallback;

export function buildEmail(
  ctx: AppContext,
  bundle: BookingBundle,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): EmailMessage {
  const restaurantLocale = asLocale(bundle.restaurant.locale, "en");
  const locale =
    audience === "guest" ? asLocale(bundle.booking.locale, restaurantLocale) : restaurantLocale;
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
    },
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

export function buildSms(
  ctx: AppContext,
  bundle: BookingBundle,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): SmsMessage {
  const restaurantLocale = asLocale(bundle.restaurant.locale, "en");
  const locale =
    audience === "guest" ? asLocale(bundle.booking.locale, restaurantLocale) : restaurantLocale;
  const body = renderSms(event, locale, {
    restaurantName: bundle.restaurant.name,
    guestName: bundle.customer.name,
    when: formatWhen(bundle.booking.startsAt, bundle.restaurant.timezone, locale),
    partySize: bundle.booking.partySize,
    confirmationCode: bundle.booking.confirmationCode,
    manageUrl:
      audience === "guest"
        ? `${ctx.env.PUBLIC_URL}/book/${bundle.restaurant.slug}/manage/${bundle.booking.manageToken}`
        : undefined,
  });
  return { to, body };
}
