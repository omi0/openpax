import type { Locale, NotificationAudience, NotificationEvent } from "@sitli/shared";

export interface EmailCopy {
  subject: (v: CopyVars) => string;
  heading: (v: CopyVars) => string;
  intro: (v: CopyVars) => string;
  outro?: (v: CopyVars) => string;
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

export interface CopyVars {
  restaurantName: string;
  guestName: string;
  when: string;
  partySize: number;
  confirmationCode: string;
  serviceName: string;
}

type Copy = Record<
  Locale,
  Record<NotificationAudience, Partial<Record<NotificationEvent, EmailCopy>>>
>;

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
const staffFooterIt = (v: CopyVars) => `Notifica automatica di Sitli per ${v.restaurantName}.`;
const staffFooterEn = (v: CopyVars) => `Automatic notification from Sitli for ${v.restaurantName}.`;

export const copy: Copy = {
  it: {
    guest: {
      "booking.confirmed": {
        subject: (v) => `Prenotazione confermata da ${v.restaurantName}`,
        heading: () => "Prenotazione confermata",
        intro: (v) => `Ciao ${v.guestName}, ti aspettiamo! Ecco i dettagli della tua prenotazione.`,
        outro: () =>
          "Se cambi programma, puoi modificare o annullare la prenotazione dal link qui sotto.",
        button: "Gestisci prenotazione",
        labels: labelsIt,
        footer: footerIt,
      },
      "booking.pending": {
        subject: (v) => `Richiesta di prenotazione ricevuta da ${v.restaurantName}`,
        heading: () => "Richiesta ricevuta",
        intro: (v) =>
          `Ciao ${v.guestName}, abbiamo ricevuto la tua richiesta. Ti confermeremo al più presto.`,
        button: "Vedi richiesta",
        labels: labelsIt,
        footer: footerIt,
      },
      "booking.cancelled": {
        subject: (v) => `Prenotazione annullata da ${v.restaurantName}`,
        heading: () => "Prenotazione annullata",
        intro: (v) => `Ciao ${v.guestName}, la tua prenotazione è stata annullata.`,
        outro: () => "Speriamo di vederti presto: puoi prenotare di nuovo quando vuoi.",
        labels: labelsIt,
        footer: footerIt,
      },
      "booking.modified": {
        subject: (v) => `Prenotazione aggiornata da ${v.restaurantName}`,
        heading: () => "Prenotazione aggiornata",
        intro: (v) =>
          `Ciao ${v.guestName}, la tua prenotazione è stata aggiornata. Ecco i nuovi dettagli.`,
        button: "Gestisci prenotazione",
        labels: labelsIt,
        footer: footerIt,
      },
      "booking.reminder": {
        subject: (v) => `Promemoria: ti aspettiamo da ${v.restaurantName}`,
        heading: () => "Ti aspettiamo",
        intro: (v) => `Ciao ${v.guestName}, un promemoria della tua prenotazione.`,
        outro: () => "Se non puoi venire, ti chiediamo di annullare dal link qui sotto.",
        button: "Gestisci prenotazione",
        labels: labelsIt,
        footer: footerIt,
      },
    },
    restaurant: {
      "booking.confirmed": {
        subject: (v) => `Nuova prenotazione: ${v.guestName}, ${v.partySize} persone, ${v.when}`,
        heading: () => "Nuova prenotazione",
        intro: () => "È arrivata una nuova prenotazione.",
        labels: labelsIt,
        footer: staffFooterIt,
      },
      "booking.pending": {
        subject: (v) =>
          `Richiesta da confermare: ${v.guestName}, ${v.partySize} persone, ${v.when}`,
        heading: () => "Richiesta da confermare",
        intro: () => "Una nuova richiesta di prenotazione attende la tua conferma.",
        labels: labelsIt,
        footer: staffFooterIt,
      },
      "booking.cancelled": {
        subject: (v) => `Annullata: ${v.guestName}, ${v.partySize} persone, ${v.when}`,
        heading: () => "Prenotazione annullata",
        intro: () => "Una prenotazione è stata annullata.",
        labels: labelsIt,
        footer: staffFooterIt,
      },
      "booking.modified": {
        subject: (v) => `Modificata: ${v.guestName}, ${v.partySize} persone, ${v.when}`,
        heading: () => "Prenotazione modificata",
        intro: () => "Una prenotazione è stata modificata.",
        labels: labelsIt,
        footer: staffFooterIt,
      },
    },
  },
  en: {
    guest: {
      "booking.confirmed": {
        subject: (v) => `Your booking at ${v.restaurantName} is confirmed`,
        heading: () => "Booking confirmed",
        intro: (v) =>
          `Hi ${v.guestName}, we look forward to seeing you. Here are your booking details.`,
        outro: () => "Plans changed? You can modify or cancel your booking with the link below.",
        button: "Manage booking",
        labels: labelsEn,
        footer: footerEn,
      },
      "booking.pending": {
        subject: (v) => `Booking request received by ${v.restaurantName}`,
        heading: () => "Request received",
        intro: (v) => `Hi ${v.guestName}, we received your request and will confirm it shortly.`,
        button: "View request",
        labels: labelsEn,
        footer: footerEn,
      },
      "booking.cancelled": {
        subject: (v) => `Your booking at ${v.restaurantName} was cancelled`,
        heading: () => "Booking cancelled",
        intro: (v) => `Hi ${v.guestName}, your booking has been cancelled.`,
        outro: () => "We hope to see you soon. You can book again any time.",
        labels: labelsEn,
        footer: footerEn,
      },
      "booking.modified": {
        subject: (v) => `Your booking at ${v.restaurantName} was updated`,
        heading: () => "Booking updated",
        intro: (v) => `Hi ${v.guestName}, your booking has been updated. Here are the new details.`,
        button: "Manage booking",
        labels: labelsEn,
        footer: footerEn,
      },
      "booking.reminder": {
        subject: (v) => `Reminder: your table at ${v.restaurantName}`,
        heading: () => "See you soon",
        intro: (v) => `Hi ${v.guestName}, a quick reminder of your booking.`,
        outro: () => "If you can't make it, please cancel using the link below.",
        button: "Manage booking",
        labels: labelsEn,
        footer: footerEn,
      },
    },
    restaurant: {
      "booking.confirmed": {
        subject: (v) => `New booking: ${v.guestName}, ${v.partySize} guests, ${v.when}`,
        heading: () => "New booking",
        intro: () => "A new booking has arrived.",
        labels: labelsEn,
        footer: staffFooterEn,
      },
      "booking.pending": {
        subject: (v) => `Request to confirm: ${v.guestName}, ${v.partySize} guests, ${v.when}`,
        heading: () => "Request awaiting confirmation",
        intro: () => "A new booking request is waiting for your confirmation.",
        labels: labelsEn,
        footer: staffFooterEn,
      },
      "booking.cancelled": {
        subject: (v) => `Cancelled: ${v.guestName}, ${v.partySize} guests, ${v.when}`,
        heading: () => "Booking cancelled",
        intro: () => "A booking has been cancelled.",
        labels: labelsEn,
        footer: staffFooterEn,
      },
      "booking.modified": {
        subject: (v) => `Updated: ${v.guestName}, ${v.partySize} guests, ${v.when}`,
        heading: () => "Booking updated",
        intro: () => "A booking has been updated.",
        labels: labelsEn,
        footer: staffFooterEn,
      },
    },
  },
};

export function getCopy(
  locale: Locale,
  audience: NotificationAudience,
  event: NotificationEvent,
): EmailCopy {
  const fallback = copy.en.guest["booking.confirmed"] as EmailCopy;
  return copy[locale]?.[audience]?.[event] ?? copy.en[audience][event] ?? fallback;
}
