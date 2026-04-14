/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { Locale } from "@openpax/shared";
import { Button, Layout } from "../components/layout.js";

export interface PasswordResetEmailProps {
  locale: Locale;
  name: string;
  resetUrl: string;
  expiresMinutes: number;
  brandName: string;
  primaryColor: string;
  logoUrl?: string | null;
}

export function passwordResetCopy(p: PasswordResetEmailProps) {
  if (p.locale === "it") {
    return {
      subject: `Reimposta la password del tuo account ${p.brandName}`,
      heading: "Reimposta la password",
      intro: `Ciao ${p.name}, abbiamo ricevuto una richiesta di reimpostare la password del tuo account. Premi il pulsante per sceglierne una nuova.`,
      button: "Scegli una nuova password",
      expires: `Il link vale ${p.expiresMinutes} minuti.`,
      footer:
        "Se non hai richiesto tu la reimpostazione puoi ignorare questa email: la password resta invariata.",
    };
  }
  return {
    subject: `Reset the password of your ${p.brandName} account`,
    heading: "Reset your password",
    intro: `Hi ${p.name}, we received a request to reset the password of your account. Press the button to choose a new one.`,
    button: "Choose a new password",
    expires: `The link is valid for ${p.expiresMinutes} minutes.`,
    footer:
      "If you did not ask for a reset you can ignore this email: your password stays the same.",
  };
}

export function PasswordResetEmail(p: PasswordResetEmailProps) {
  const copy = passwordResetCopy(p);
  return (
    <Layout
      title={copy.subject}
      preheader={copy.intro}
      primaryColor={p.primaryColor}
      restaurantName={p.brandName}
      logoUrl={p.logoUrl}
      footer={copy.footer}
    >
      <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>{copy.heading}</h1>
      <p style={{ margin: "0 0 8px" }}>{copy.intro}</p>
      <Button href={p.resetUrl} label={copy.button} color={p.primaryColor} />
      <p style={{ margin: "12px 0 0", color: "#52525b", fontSize: 14 }}>{copy.expires}</p>
      <p style={{ margin: "12px 0 0", color: "#71717a", fontSize: 12, wordBreak: "break-all" }}>
        {p.resetUrl}
      </p>
    </Layout>
  );
}

export function passwordResetEmailText(p: PasswordResetEmailProps): string {
  const copy = passwordResetCopy(p);
  return [
    copy.heading,
    "",
    copy.intro,
    "",
    p.resetUrl,
    "",
    copy.expires,
    "",
    "--",
    copy.footer,
  ].join("\n");
}
