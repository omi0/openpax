import { type CalendarInvite, calendarAttachment, defineProvider } from "../provider.js";

function resendAttachment(invite: CalendarInvite) {
  const a = calendarAttachment(invite);
  return { filename: a.filename, content: a.base64, content_type: a.contentType };
}

export const resendProvider = defineProvider({
  id: "resend",
  channel: "email",
  label: "Resend",
  description: "Transactional email API (resend.com). Requires a verified sending domain.",
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      required: true,
      secret: true,
      placeholder: "re_...",
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.calendar ? { attachments: [resendAttachment(message.calendar)] } : {}),
      }),
    });
    if (!res.ok)
      throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { id?: string };
    return { providerMessageId: body.id };
  },
});
