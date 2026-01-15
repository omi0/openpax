import { defineProvider } from "../provider.js";
import { errorText } from "./address.js";

export const postmarkProvider = defineProvider({
  id: "postmark",
  channel: "email",
  label: "Postmark",
  description: "Postmark transactional email. Uses the server token of a transactional stream.",
  fields: [
    { key: "serverToken", label: "Server token", type: "password", required: true, secret: true },
    {
      key: "from",
      label: "From",
      type: "email",
      required: true,
      secret: false,
      placeholder: "Trattoria Roma <prenotazioni@example.com>",
    },
    {
      key: "messageStream",
      label: "Message stream",
      type: "text",
      required: false,
      secret: false,
      placeholder: "outbound",
      help: "Leave empty for the default transactional stream.",
    },
  ],
  async send(message, config) {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "x-postmark-server-token": String(config.serverToken),
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        From: config.from,
        To: message.toName ? `${message.toName} <${message.to}>` : message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        ...(message.replyTo ? { ReplyTo: message.replyTo } : {}),
        ...(config.messageStream ? { MessageStream: config.messageStream } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Postmark responded ${res.status}: ${await errorText(res)}`);
    const body = (await res.json()) as { MessageID?: string };
    return { providerMessageId: body.MessageID };
  },
});
