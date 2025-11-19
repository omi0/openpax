import { defineProvider } from "../provider.js";

/** Development providers: print the message to the server log instead of sending it. */
export const consoleEmailProvider = defineProvider({
  id: "console-email",
  channel: "email",
  label: "Console (log only)",
  description: "Writes emails to the server log. For development and testing.",
  fields: [
    {
      key: "from",
      label: "From",
      type: "email",
      required: false,
      secret: false,
      placeholder: "Sitli <no-reply@localhost>",
    },
  ],
  async send(message) {
    console.log(`[console-email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return { providerMessageId: `console-${Date.now()}` };
  },
});

export const consoleSmsProvider = defineProvider({
  id: "console-sms",
  channel: "sms",
  label: "Console (log only)",
  description: "Writes SMS to the server log. For development and testing.",
  fields: [],
  async send(message) {
    console.log(`[console-sms] to=${message.to}\n${message.body}`);
    return { providerMessageId: `console-${Date.now()}` };
  },
});
