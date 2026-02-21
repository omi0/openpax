import { TZDate } from "@date-fns/tz";
import type { EmailTemplate, Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";
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
import {
  InvitationEmail,
  type InvitationEmailProps,
  invitationCopy,
  invitationEmailText,
} from "./templates/invitation-email.js";
import {
  PasswordResetEmail,
  type PasswordResetEmailProps,
  passwordResetCopy,
  passwordResetEmailText,
} from "./templates/password-reset-email.js";

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
    /** Replaces the formatted `startsAt` (waitlist entries only know a date). */
    when?: string;
    partySize: number;
    confirmationCode: string;
    serviceName: string;
    notes: string | null;
    cancellationReason?: string | null;
  };
  guest: { name: string; email: string | null; phone: string | null };
  manageUrl?: string;
  dashboardUrl?: string;
  /** Deposit link and formatted amount for the "pay to confirm" email. */
  payment?: { paymentUrl: string; depositAmount: string };
  /** Feedback link (guest) and the answer (restaurant copy). */
  feedback?: { feedbackUrl: string; rating: string; feedbackComment: string };
  /** Restaurant-specific template replacing the default copy. */
  template?: EmailTemplate | null;
}

const dateLocales = { it, en: enGB } as const;

/** "venerdì 12 giugno 2026, 20:00" in the restaurant's timezone. */
export function formatWhen(startsAt: Date, timezone: string, locale: Locale): string {
  const zoned = new TZDate(startsAt.getTime(), timezone);
  return format(zoned, "EEEE d MMMM yyyy, HH:mm", { locale: dateLocales[locale] ?? enGB });
}

/** "venerdì 12 giugno 2026" for a calendar date, with an optional preferred time appended. */
export function formatWhenDate(date: string, locale: Locale, time?: string | null): string {
  const [y, m, d] = date.split("-").map(Number);
  const text = format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1), "EEEE d MMMM yyyy", {
    locale: dateLocales[locale] ?? enGB,
  });
  return time ? `${text}, ${time}` : text;
}

export function renderBookingEmail(input: BookingEmailInput): RenderedEmail {
  const copy = getCopy(input.locale, input.audience, input.event, input.template);
  const vars = {
    restaurantName: input.restaurant.name,
    guestName: input.guest.name,
    when:
      input.booking.when ??
      formatWhen(input.booking.startsAt, input.restaurant.timezone, input.locale),
    partySize: input.booking.partySize,
    confirmationCode: input.booking.confirmationCode,
    serviceName: input.booking.serviceName,
    manageUrl: input.manageUrl ?? "",
    guestPhone: input.guest.phone ?? "",
    guestEmail: input.guest.email ?? "",
    notes: input.booking.notes ?? "",
    address: input.restaurant.address ?? "",
    cancellationReason: input.booking.cancellationReason ?? "",
    paymentUrl: input.payment?.paymentUrl ?? "",
    depositAmount: input.payment?.depositAmount ?? "",
    feedbackUrl: input.feedback?.feedbackUrl ?? "",
    rating: input.feedback?.rating ?? "",
    feedbackComment: input.feedback?.feedbackComment ?? "",
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

export interface InvitationEmailInput {
  locale: Locale;
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
  timezone: string;
  primaryColor: string;
  logoUrl?: string | null;
}

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const zoned = new TZDate(input.expiresAt.getTime(), input.timezone);
  const props: InvitationEmailProps = {
    locale: input.locale,
    organizationName: input.organizationName,
    inviterName: input.inviterName,
    role: input.role,
    acceptUrl: input.acceptUrl,
    expiresOn: format(zoned, "d MMMM yyyy, HH:mm", { locale: dateLocales[input.locale] ?? enGB }),
    primaryColor: input.primaryColor,
    logoUrl: input.logoUrl,
  };
  return {
    subject: invitationCopy(props).subject,
    html: `<!DOCTYPE html>${renderToStaticMarkup(createElement(InvitationEmail, props))}`,
    text: invitationEmailText(props),
  };
}

export function renderPasswordResetEmail(props: PasswordResetEmailProps): RenderedEmail {
  return {
    subject: passwordResetCopy(props).subject,
    html: `<!DOCTYPE html>${renderToStaticMarkup(createElement(PasswordResetEmail, props))}`,
    text: passwordResetEmailText(props),
  };
}
