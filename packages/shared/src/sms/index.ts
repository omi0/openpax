import type { Locale } from "../schemas/common.js";
import type { NotificationEvent } from "../schemas/notifications.js";

export interface SmsTemplateVars {
  restaurantName: string;
  guestName: string;
  /** Pre-formatted in the restaurant locale, e.g. "ven 12 giu, 20:00". */
  when: string;
  partySize: number;
  confirmationCode: string;
  manageUrl?: string;
}

type Template = (v: SmsTemplateVars) => string;

const templates: Record<Locale, Record<NotificationEvent, Template>> = {
  it: {
    "booking.confirmed": (v) =>
      `${v.restaurantName}: prenotazione confermata per ${v.partySize} il ${v.when}. Codice ${v.confirmationCode}.${v.manageUrl ? ` Gestisci: ${v.manageUrl}` : ""}`,
    "booking.pending": (v) =>
      `${v.restaurantName}: richiesta ricevuta per ${v.partySize} il ${v.when}. Ti confermeremo a breve. Codice ${v.confirmationCode}.`,
    "booking.cancelled": (v) =>
      `${v.restaurantName}: la prenotazione ${v.confirmationCode} del ${v.when} è stata annullata.`,
    "booking.modified": (v) =>
      `${v.restaurantName}: prenotazione aggiornata: ${v.partySize} persone il ${v.when}. Codice ${v.confirmationCode}.`,
    "booking.reminder": (v) =>
      `${v.restaurantName}: ti aspettiamo il ${v.when} (${v.partySize} persone).${v.manageUrl ? ` Modifica: ${v.manageUrl}` : ""}`,
  },
  en: {
    "booking.confirmed": (v) =>
      `${v.restaurantName}: booking confirmed for ${v.partySize} on ${v.when}. Code ${v.confirmationCode}.${v.manageUrl ? ` Manage: ${v.manageUrl}` : ""}`,
    "booking.pending": (v) =>
      `${v.restaurantName}: request received for ${v.partySize} on ${v.when}. We'll confirm shortly. Code ${v.confirmationCode}.`,
    "booking.cancelled": (v) =>
      `${v.restaurantName}: booking ${v.confirmationCode} on ${v.when} has been cancelled.`,
    "booking.modified": (v) =>
      `${v.restaurantName}: booking updated: ${v.partySize} guests on ${v.when}. Code ${v.confirmationCode}.`,
    "booking.reminder": (v) =>
      `${v.restaurantName}: see you on ${v.when} (${v.partySize} guests).${v.manageUrl ? ` Change: ${v.manageUrl}` : ""}`,
  },
};

export function renderSms(event: NotificationEvent, locale: Locale, vars: SmsTemplateVars): string {
  const table = templates[locale] ?? templates.en;
  return table[event](vars);
}
