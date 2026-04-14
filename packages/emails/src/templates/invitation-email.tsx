/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { Locale } from "@openpax/shared";
import { Button, Layout } from "../components/layout.js";

export interface InvitationEmailProps {
  locale: Locale;
  organizationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  /** Already formatted for the locale. */
  expiresOn: string;
  primaryColor: string;
  logoUrl?: string | null;
}

const roleLabels: Record<Locale, Record<string, string>> = {
  it: { owner: "titolare", manager: "manager", staff: "staff" },
  en: { owner: "owner", manager: "manager", staff: "staff" },
};

export function invitationCopy(p: InvitationEmailProps) {
  const role = roleLabels[p.locale]?.[p.role] ?? p.role;
  if (p.locale === "it") {
    return {
      subject: `${p.inviterName} ti ha invitato a gestire ${p.organizationName} su OpenPax`,
      heading: "Sei stato invitato",
      intro: `${p.inviterName} ti ha invitato a unirti al team di ${p.organizationName} come ${role}. Accetta l'invito per vedere le prenotazioni e gestire il ristorante.`,
      button: "Accetta l'invito",
      expires: `L'invito scade il ${p.expiresOn}.`,
      footer: "Se non ti aspettavi questa email puoi ignorarla: nessun accesso verrà creato.",
    };
  }
  return {
    subject: `${p.inviterName} invited you to manage ${p.organizationName} on OpenPax`,
    heading: "You have been invited",
    intro: `${p.inviterName} invited you to join the team of ${p.organizationName} as ${role}. Accept the invitation to see bookings and manage the restaurant.`,
    button: "Accept invitation",
    expires: `The invitation expires on ${p.expiresOn}.`,
    footer: "If you were not expecting this email you can ignore it: no access will be created.",
  };
}

export function InvitationEmail(p: InvitationEmailProps) {
  const copy = invitationCopy(p);
  return (
    <Layout
      title={copy.subject}
      preheader={copy.intro}
      primaryColor={p.primaryColor}
      restaurantName={p.organizationName}
      logoUrl={p.logoUrl}
      footer={copy.footer}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>{copy.heading}</h1>
      <p style={{ margin: "0 0 8px" }}>{copy.intro}</p>
      <Button href={p.acceptUrl} label={copy.button} color={p.primaryColor} />
      <p style={{ margin: "12px 0 0", color: "#52525b", fontSize: 14 }}>{copy.expires}</p>
      <p style={{ margin: "12px 0 0", color: "#71717a", fontSize: 12, wordBreak: "break-all" }}>
        {p.acceptUrl}
      </p>
    </Layout>
  );
}

export function invitationEmailText(p: InvitationEmailProps): string {
  const copy = invitationCopy(p);
  return [
    copy.heading,
    "",
    copy.intro,
    "",
    p.acceptUrl,
    "",
    copy.expires,
    "",
    "--",
    copy.footer,
  ].join("\n");
}
