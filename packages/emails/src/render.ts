import { TZDate } from "@date-fns/tz";
import type { Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";
import { format } from "date-fns";
import { enGB, it } from "date-fns/locale";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getCopy } from "./i18n/copy.js";
import {
  BookingEmail,
  type BookingEmailProps,
  bookingEmailText,
} from "./templates/booking-email.js";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface BookingEmailInput {
  event: NotificationEvent;
  audience: NotificationAudience;
  locale: Locale;
  restaurant: {
    name: string;
    timezone: string;
    address: string | null;
    primaryColor: string;
    logoUrl: string | null;
  };
  booking: {
    startsAt: Date;
    partySize: number;
    confirmationCode: string;
    serviceName: string;
    notes: string | null;
  };
  guest: { name: string; email: string | null; phone: string | null };
  manageUrl?: string;
  dashboardUrl?: string;
}

const dateLocales = { it, en: enGB } as const;

/** "venerdì 12 giugno 2026, 20:00" in the restaurant's timezone. */
export function formatWhen(startsAt: Date, timezone: string, locale: Locale): string {
  const zoned = new TZDate(startsAt.getTime(), timezone);
  return format(zoned, "EEEE d MMMM yyyy, HH:mm", { locale: dateLocales[locale] ?? enGB });
}

export function renderBookingEmail(input: BookingEmailInput): RenderedEmail {
  const copy = getCopy(input.locale, input.audience, input.event);
  const vars = {
    restaurantName: input.restaurant.name,
    guestName: input.guest.name,
    when: formatWhen(input.booking.startsAt, input.restaurant.timezone, input.locale),
    partySize: input.booking.partySize,
    confirmationCode: input.booking.confirmationCode,
    serviceName: input.booking.serviceName,
  };
  const props: BookingEmailProps = {
    copy,
    vars,
    audience: input.audience,
    primaryColor: input.restaurant.primaryColor,
    logoUrl: input.restaurant.logoUrl,
    manageUrl: input.manageUrl,
    dashboardUrl: input.dashboardUrl,
    guest: input.guest,
    notes: input.booking.notes,
    address: input.restaurant.address,
  };
  return {
    subject: copy.subject(vars),
    html: `<!DOCTYPE html>${renderToStaticMarkup(createElement(BookingEmail, props))}`,
    text: bookingEmailText(props),
  };
}

export interface TestEmailInput {
  locale: Locale;
  restaurantName: string;
  primaryColor: string;
  providerLabel: string;
}

export function renderTestEmail(input: TestEmailInput): RenderedEmail {
  const isIt = input.locale === "it";
  const subject = isIt
    ? `Email di prova da ${input.restaurantName}`
    : `Test email from ${input.restaurantName}`;
  const body = isIt
    ? `Questa è un'email di prova inviata da Sitli tramite ${input.providerLabel}. Se la stai leggendo, la configurazione funziona.`
    : `This is a test email sent by Sitli through ${input.providerLabel}. If you can read this, your configuration works.`;
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px"><h2 style="color:${input.primaryColor}">${subject}</h2><p>${body}</p></body></html>`;
  return { subject, html, text: `${subject}\n\n${body}` };
}
