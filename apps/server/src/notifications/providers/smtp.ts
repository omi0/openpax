import nodemailer from "nodemailer";
import { defineProvider, type ProviderConfig } from "../provider.js";

function transportFor(config: ProviderConfig) {
  return nodemailer.createTransport({
    host: String(config.host),
    port: Number(config.port ?? 587),
    secure: config.secure === true,
    ...(config.username
      ? { auth: { user: String(config.username), pass: String(config.password ?? "") } }
      : {}),
  });
}

export const smtpProvider = defineProvider({
  id: "smtp",
  channel: "email",
  label: "SMTP",
  description:
    "Any SMTP server: your hosting provider, Gmail, Postmark, Brevo, Mailpit for development…",
  fields: [
    {
      key: "host",
      label: "Host",
      type: "text",
      required: true,
      secret: false,
      placeholder: "smtp.example.com",
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      required: true,
      secret: false,
      placeholder: "587",
    },
    {
      key: "secure",
      label: "Use TLS (port 465)",
      type: "boolean",
      required: false,
      secret: false,
      help: "Leave off for STARTTLS on 587.",
    },
    { key: "username", label: "Username", type: "text", required: false, secret: false },
    { key: "password", label: "Password", type: "password", required: false, secret: true },
    {
      key: "from",
      label: "From",
      type: "email",
      required: true,
      secret: false,
      placeholder: "Trattoria Roma <prenotazioni@example.com>",
    },
  ],
  async send(message, config) {
    const info = await transportFor(config).sendMail({
      from: String(config.from),
      to: message.toName ? { name: message.toName, address: message.to } : message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return { providerMessageId: info.messageId };
  },
  async verify(config) {
    await transportFor(config).verify();
  },
});

/** Instance-wide fallback built from SMTP_URL / SMTP_FROM. */
export function smtpConfigFromUrl(url: string, from: string): ProviderConfig {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || (u.protocol === "smtps:" ? 465 : 587)),
    secure: u.protocol === "smtps:",
    username: u.username ? decodeURIComponent(u.username) : null,
    password: u.password ? decodeURIComponent(u.password) : null,
    from,
  };
}
