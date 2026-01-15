import { defineProvider } from "../provider.js";
import { errorText, parseAddress } from "./address.js";

export const sendgridProvider = defineProvider({
  id: "sendgrid",
  channel: "email",
  label: "SendGrid",
  description: "Twilio SendGrid Mail Send API. Requires a verified sender or domain.",
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      required: true,
      secret: true,
      placeholder: "SG....",
    },
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
    const from = parseAddress(String(config.from));
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: message.to, ...(message.toName ? { name: message.toName } : {}) }] },
        ],
        from,
        ...(message.replyTo ? { reply_to: parseAddress(message.replyTo) } : {}),
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid responded ${res.status}: ${await errorText(res)}`);
    return { providerMessageId: res.headers.get("x-message-id") ?? undefined };
  },
});
