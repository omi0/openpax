import type { Locale, NotificationAudience, NotificationEvent } from "@openpax/shared";
import {
  defaultTemplates,
  type EmailTemplate,
  fillTemplate,
  type TemplateVars,
} from "@openpax/shared";

export interface EmailCopy {
  subject: (v: CopyVars) => string;
  heading: (v: CopyVars) => string;
  /** Plain text; blank lines separate paragraphs. */
  intro: (v: CopyVars) => string;
  button?: string;
  labels: {
    when: string;
    party: string;
    code: string;
    guest: string;
    phone: string;
    email: string;
    notes: string;
    service: string;
  };
  footer: (v: CopyVars) => string;
}

export type CopyVars = TemplateVars & {
  restaurantName: string;
  guestName: string;
  when: string;
  partySize: number;
  confirmationCode: string;
  serviceName: string;
};

const labelsIt = {
  when: "Quando",
  party: "Persone",
  code: "Codice prenotazione",
  guest: "Ospite",
  phone: "Telefono",
  email: "Email",
  notes: "Note",
  service: "Servizio",
};
const labelsEn = {
  when: "When",
  party: "Guests",
  code: "Booking code",
  guest: "Guest",
  phone: "Phone",
  email: "Email",
  notes: "Notes",
  service: "Service",
};
const footerIt = (v: CopyVars) =>
  `Hai ricevuto questa email perché hai prenotato da ${v.restaurantName}.`;
const footerEn = (v: CopyVars) =>
  `You received this email because you booked at ${v.restaurantName}.`;
const staffFooterIt = (v: CopyVars) => `Notifica automatica di OpenPax per ${v.restaurantName}.`;
const staffFooterEn = (v: CopyVars) =>
  `Automatic notification from OpenPax for ${v.restaurantName}.`;

const buttonLabels: Record<Locale, Partial<Record<NotificationEvent, string>>> = {
  it: {
    "booking.confirmed": "Gestisci prenotazione",
    "booking.pending": "Vedi richiesta",
    "booking.modified": "Gestisci prenotazione",
    "booking.reminder": "Gestisci prenotazione",
    "waitlist.joined": "Vedi la tua richiesta",
    "waitlist.offered": "Conferma il tavolo",
    "booking.payment_required": "Paga la caparra",
    "booking.feedback_request": "Racconta com'è andata",
  },
  en: {
    "booking.confirmed": "Manage booking",
    "booking.pending": "View request",
    "booking.modified": "Manage booking",
    "booking.reminder": "Manage booking",
    "waitlist.joined": "View your request",
    "waitlist.offered": "Confirm the table",
    "booking.payment_required": "Pay the deposit",
    "booking.feedback_request": "Rate your visit",
  },
};

/**
 * Copy for one email, built from the default template of the event or from
 * the restaurant's own template when one was saved.
 */
export function getCopy(
  locale: Locale,
  audience: NotificationAudience,
  event: NotificationEvent,
  override?: EmailTemplate | null,
): EmailCopy {
  const isIt = locale === "it";
  const template = override ?? defaultTemplates(locale, audience, event).email;
  return {
    subject: (v) => fillTemplate(template.subject, v),
    heading: (v) => fillTemplate(template.heading, v),
    intro: (v) => fillTemplate(template.body, v),
    button: audience === "guest" ? (buttonLabels[locale] ?? buttonLabels.en)[event] : undefined,
    labels: isIt ? labelsIt : labelsEn,
    footer:
      audience === "guest" ? (isIt ? footerIt : footerEn) : isIt ? staffFooterIt : staffFooterEn,
  };
}
