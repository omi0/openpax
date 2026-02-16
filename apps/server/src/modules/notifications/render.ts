import { formatWhen, formatWhenDate, renderBookingEmail } from "@sitli/emails";
import type { Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";
import { renderSms } from "@sitli/shared/sms";
import type { AppContext } from "../../context.js";
import type { EmailMessage, SmsMessage } from "../../notifications/provider.js";
import { formatAmount } from "../payments/index.js";
import type { MessageSubject } from "./dispatch.js";
import { effectiveEmailTemplate, getTemplateOverride } from "./templates.js";

const asLocale = (v: string | null | undefined, fallback: Locale): Locale =>
  v === "it" || v === "en" ? v : fallback;

function localeFor(subject: MessageSubject, audience: NotificationAudience): Locale {
  const restaurantLocale = asLocale(subject.restaurant.locale, "en");
  return audience === "guest" ? asLocale(subject.locale, restaurantLocale) : restaurantLocale;
}

function paymentVars(subject: MessageSubject, locale: Locale) {
  const p = subject.payment;
  return {
    paymentUrl: p?.checkoutUrl ?? "",
    depositAmount: p ? formatAmount(p.amountCents, p.currency, locale) : "",
  };
}

/** "venerdì 12 giugno 2026, 20:00", or the date alone (plus preferred time) when there is no slot yet. */
export function whenText(subject: MessageSubject, locale: Locale): string {
  return subject.startsAt
    ? formatWhen(subject.startsAt, subject.restaurant.timezone, locale)
    : formatWhenDate(subject.serviceDate, locale, subject.preferredTime);
}

export async function buildEmail(
  ctx: AppContext,
  subject: MessageSubject,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): Promise<EmailMessage> {
  const locale = localeFor(subject, audience);
  const key = { event, channel: "email" as const, audience, locale };
  const override = await getTemplateOverride(ctx, subject.restaurant.id, key);
  const pay = paymentVars(subject, locale);
  const rendered = renderBookingEmail({
    event,
    audience,
    locale,
    restaurant: {
      name: subject.restaurant.name,
      timezone: subject.restaurant.timezone,
      address: subject.restaurant.address,
      primaryColor: subject.widget?.primaryColor ?? "#1f6f5f",
      logoUrl: subject.widget?.logoUrl ?? null,
    },
    booking: {
      startsAt: subject.startsAt ?? new Date(),
      when: whenText(subject, locale),
      partySize: subject.partySize,
      confirmationCode: subject.confirmationCode,
      serviceName: subject.serviceName,
      notes: subject.notes,
      cancellationReason: subject.cancellationReason,
    },
    template: override ? effectiveEmailTemplate(key, override) : null,
    guest: {
      name: subject.customer.name,
      email: subject.customer.email,
      phone: subject.customer.phone,
    },
    // the "pay" email's button goes straight to checkout
    manageUrl:
      event === "booking.payment_required" && pay.paymentUrl ? pay.paymentUrl : subject.manageUrl,
    dashboardUrl: subject.dashboardUrl,
    payment: pay,
  });
  return {
    to,
    toName: audience === "guest" ? subject.customer.name : subject.restaurant.name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(audience === "guest" && subject.restaurant.email
      ? { replyTo: subject.restaurant.email }
      : {}),
  };
}

export async function buildSms(
  ctx: AppContext,
  subject: MessageSubject,
  event: NotificationEvent,
  audience: NotificationAudience,
  to: string,
): Promise<SmsMessage> {
  const locale = localeFor(subject, audience);
  const override = await getTemplateOverride(ctx, subject.restaurant.id, {
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
      restaurantName: subject.restaurant.name,
      guestName: subject.customer.name,
      when: whenText(subject, locale),
      partySize: subject.partySize,
      confirmationCode: subject.confirmationCode,
      serviceName: subject.serviceName,
      manageUrl: audience === "guest" ? subject.manageUrl : "",
      guestPhone: subject.customer.phone ?? "",
      guestEmail: subject.customer.email ?? "",
      notes: subject.notes ?? "",
      address: subject.restaurant.address ?? "",
      cancellationReason: subject.cancellationReason ?? "",
      ...paymentVars(subject, locale),
    },
    override ? { body: override.body } : null,
  );
  return { to, body };
}
