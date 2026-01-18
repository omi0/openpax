import type { Locale } from "../schemas/common.js";
import type { NotificationAudience, NotificationEvent } from "../schemas/notifications.js";

/** Placeholders available in every template, as `{{name}}`. */
export const TEMPLATE_VARIABLES = [
  "restaurantName",
  "guestName",
  "when",
  "partySize",
  "confirmationCode",
  "serviceName",
  "manageUrl",
  "guestPhone",
  "guestEmail",
  "notes",
  "address",
  "cancellationReason",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string | number | null | undefined>>;

export interface EmailTemplate {
  subject: string;
  heading: string;
  /** Plain text; blank lines separate paragraphs. */
  body: string;
}
export interface SmsTemplate {
  body: string;
}
export interface EventTemplates {
  email: EmailTemplate;
  sms: SmsTemplate;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Replace `{{name}}` with its value; unknown or empty values become "". */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => {
    const v = vars[name as TemplateVariable];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Placeholders used by a template that are not in TEMPLATE_VARIABLES. */
export function unknownPlaceholders(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) {
    const name = m[1] ?? "";
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) out.add(name);
  }
  return [...out];
}

type Table = Record<
  Locale,
  Record<NotificationAudience, Partial<Record<NotificationEvent, EventTemplates>>>
>;

export const DEFAULT_TEMPLATES: Table = {
  it: {
    guest: {
      "booking.confirmed": {
        email: {
          subject: "Prenotazione confermata da {{restaurantName}}",
          heading: "Prenotazione confermata",
          body: "Ciao {{guestName}}, ti aspettiamo! Ecco i dettagli della tua prenotazione.\n\nSe cambi programma, puoi modificare o annullare la prenotazione dal link qui sotto.",
        },
        sms: {
          body: "{{restaurantName}}: prenotazione confermata per {{partySize}} il {{when}}. Codice {{confirmationCode}}. Gestisci: {{manageUrl}}",
        },
      },
      "booking.pending": {
        email: {
          subject: "Richiesta di prenotazione ricevuta da {{restaurantName}}",
          heading: "Richiesta ricevuta",
          body: "Ciao {{guestName}}, abbiamo ricevuto la tua richiesta. Ti confermeremo al più presto.",
        },
        sms: {
          body: "{{restaurantName}}: richiesta ricevuta per {{partySize}} il {{when}}. Ti confermeremo a breve. Codice {{confirmationCode}}.",
        },
      },
      "booking.cancelled": {
        email: {
          subject: "Prenotazione annullata da {{restaurantName}}",
          heading: "Prenotazione annullata",
          body: "Ciao {{guestName}}, la tua prenotazione è stata annullata.\n\nSperiamo di vederti presto: puoi prenotare di nuovo quando vuoi.",
        },
        sms: {
          body: "{{restaurantName}}: la prenotazione {{confirmationCode}} del {{when}} è stata annullata.",
        },
      },
      "booking.modified": {
        email: {
          subject: "Prenotazione aggiornata da {{restaurantName}}",
          heading: "Prenotazione aggiornata",
          body: "Ciao {{guestName}}, la tua prenotazione è stata aggiornata. Ecco i nuovi dettagli.",
        },
        sms: {
          body: "{{restaurantName}}: prenotazione aggiornata: {{partySize}} persone il {{when}}. Codice {{confirmationCode}}.",
        },
      },
      "booking.reminder": {
        email: {
          subject: "Promemoria: ti aspettiamo da {{restaurantName}}",
          heading: "Ti aspettiamo",
          body: "Ciao {{guestName}}, un promemoria della tua prenotazione.\n\nSe non puoi venire, ti chiediamo di annullare dal link qui sotto.",
        },
        sms: {
          body: "{{restaurantName}}: ti aspettiamo il {{when}} ({{partySize}} persone). Modifica: {{manageUrl}}",
        },
      },
    },
    restaurant: {
      "booking.confirmed": {
        email: {
          subject: "Nuova prenotazione: {{guestName}}, {{partySize}} persone, {{when}}",
          heading: "Nuova prenotazione",
          body: "È arrivata una nuova prenotazione.",
        },
        sms: {
          body: "{{restaurantName}}: nuova prenotazione {{guestName}}, {{partySize}} persone, {{when}}. Codice {{confirmationCode}}.",
        },
      },
      "booking.pending": {
        email: {
          subject: "Richiesta da confermare: {{guestName}}, {{partySize}} persone, {{when}}",
          heading: "Richiesta da confermare",
          body: "Una nuova richiesta di prenotazione attende la tua conferma.",
        },
        sms: {
          body: "{{restaurantName}}: richiesta da confermare {{guestName}}, {{partySize}} persone, {{when}}.",
        },
      },
      "booking.cancelled": {
        email: {
          subject: "Annullata: {{guestName}}, {{partySize}} persone, {{when}}",
          heading: "Prenotazione annullata",
          body: "Una prenotazione è stata annullata.",
        },
        sms: {
          body: "{{restaurantName}}: annullata la prenotazione di {{guestName}}, {{partySize}} persone, {{when}}.",
        },
      },
      "booking.modified": {
        email: {
          subject: "Modificata: {{guestName}}, {{partySize}} persone, {{when}}",
          heading: "Prenotazione modificata",
          body: "Una prenotazione è stata modificata.",
        },
        sms: {
          body: "{{restaurantName}}: modificata la prenotazione di {{guestName}}: {{partySize}} persone, {{when}}.",
        },
      },
    },
  },
  en: {
    guest: {
      "booking.confirmed": {
        email: {
          subject: "Booking confirmed at {{restaurantName}}",
          heading: "Booking confirmed",
          body: "Hi {{guestName}}, we look forward to seeing you. Here are your booking details.\n\nPlans changed? You can modify or cancel your booking with the link below.",
        },
        sms: {
          body: "{{restaurantName}}: booking confirmed for {{partySize}} on {{when}}. Code {{confirmationCode}}. Manage: {{manageUrl}}",
        },
      },
      "booking.pending": {
        email: {
          subject: "Booking request received by {{restaurantName}}",
          heading: "Request received",
          body: "Hi {{guestName}}, we received your request and will confirm it shortly.",
        },
        sms: {
          body: "{{restaurantName}}: request received for {{partySize}} on {{when}}. We'll confirm shortly. Code {{confirmationCode}}.",
        },
      },
      "booking.cancelled": {
        email: {
          subject: "Your booking at {{restaurantName}} was cancelled",
          heading: "Booking cancelled",
          body: "Hi {{guestName}}, your booking has been cancelled.\n\nWe hope to see you soon. You can book again any time.",
        },
        sms: {
          body: "{{restaurantName}}: booking {{confirmationCode}} on {{when}} has been cancelled.",
        },
      },
      "booking.modified": {
        email: {
          subject: "Your booking at {{restaurantName}} was updated",
          heading: "Booking updated",
          body: "Hi {{guestName}}, your booking has been updated. Here are the new details.",
        },
        sms: {
          body: "{{restaurantName}}: booking updated: {{partySize}} guests on {{when}}. Code {{confirmationCode}}.",
        },
      },
      "booking.reminder": {
        email: {
          subject: "Reminder: your table at {{restaurantName}}",
          heading: "See you soon",
          body: "Hi {{guestName}}, a quick reminder of your booking.\n\nIf you can't make it, please cancel using the link below.",
        },
        sms: {
          body: "{{restaurantName}}: see you on {{when}} ({{partySize}} guests). Change: {{manageUrl}}",
        },
      },
    },
    restaurant: {
      "booking.confirmed": {
        email: {
          subject: "New booking: {{guestName}}, {{partySize}} guests, {{when}}",
          heading: "New booking",
          body: "A new booking has arrived.",
        },
        sms: {
          body: "{{restaurantName}}: new booking {{guestName}}, {{partySize}} guests, {{when}}. Code {{confirmationCode}}.",
        },
      },
      "booking.pending": {
        email: {
          subject: "Request to confirm: {{guestName}}, {{partySize}} guests, {{when}}",
          heading: "Request awaiting confirmation",
          body: "A new booking request is waiting for your confirmation.",
        },
        sms: {
          body: "{{restaurantName}}: request to confirm {{guestName}}, {{partySize}} guests, {{when}}.",
        },
      },
      "booking.cancelled": {
        email: {
          subject: "Cancelled: {{guestName}}, {{partySize}} guests, {{when}}",
          heading: "Booking cancelled",
          body: "A booking has been cancelled.",
        },
        sms: {
          body: "{{restaurantName}}: cancelled booking of {{guestName}}, {{partySize}} guests, {{when}}.",
        },
      },
      "booking.modified": {
        email: {
          subject: "Updated: {{guestName}}, {{partySize}} guests, {{when}}",
          heading: "Booking updated",
          body: "A booking has been updated.",
        },
        sms: {
          body: "{{restaurantName}}: updated booking of {{guestName}}: {{partySize}} guests, {{when}}.",
        },
      },
    },
  },
};

/** Default templates for a locale/audience/event, falling back to English, then to the guest confirmation. */
export function defaultTemplates(
  locale: Locale,
  audience: NotificationAudience,
  event: NotificationEvent,
): EventTemplates {
  const fallback = DEFAULT_TEMPLATES.en.guest["booking.confirmed"] as EventTemplates;
  return (
    DEFAULT_TEMPLATES[locale]?.[audience]?.[event] ??
    DEFAULT_TEMPLATES.en[audience][event] ??
    fallback
  );
}

/** Events that have a template for an audience (reminders only go to guests). */
export function templateEvents(audience: NotificationAudience): NotificationEvent[] {
  return Object.keys(DEFAULT_TEMPLATES.en[audience]) as NotificationEvent[];
}
