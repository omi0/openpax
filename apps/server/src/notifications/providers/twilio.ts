import { defineProvider } from "../provider.js";

export const twilioProvider = defineProvider({
  id: "twilio",
  channel: "sms",
  label: "Twilio",
  description:
    "SMS via Twilio Programmable Messaging. Use a purchased number or a registered alphanumeric sender.",
  fields: [
    {
      key: "accountSid",
      label: "Account SID",
      type: "text",
      required: true,
      secret: false,
      placeholder: "AC...",
    },
    { key: "authToken", label: "Auth token", type: "password", required: true, secret: true },
    {
      key: "from",
      label: "From",
      type: "text",
      required: true,
      secret: false,
      help: "E.164 number (+39...) or alphanumeric sender ID.",
      placeholder: "+3912345678",
    },
  ],
  async send(message, config) {
    const sid = String(config.accountSid);
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${sid}:${config.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: String(config.from),
          To: message.to,
          Body: message.body,
        }),
      },
    );
    if (!res.ok)
      throw new Error(`Twilio responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { sid?: string };
    return { providerMessageId: body.sid };
  },
});
