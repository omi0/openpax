import { defineProvider } from "../provider.js";
import { errorText } from "./address.js";

export const vonageProvider = defineProvider({
  id: "vonage",
  channel: "sms",
  label: "Vonage",
  description: "SMS via the Vonage (Nexmo) SMS API.",
  fields: [
    { key: "apiKey", label: "API key", type: "text", required: true, secret: false },
    { key: "apiSecret", label: "API secret", type: "password", required: true, secret: true },
    {
      key: "from",
      label: "From",
      type: "text",
      required: true,
      secret: false,
      help: "E.164 number or alphanumeric sender ID (max 11 characters).",
      placeholder: "Trattoria",
    },
  ],
  async send(message, config) {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        from: config.from,
        to: message.to.replace(/^\+/, ""),
        text: message.body,
        type: "unicode",
      }),
    });
    if (!res.ok) throw new Error(`Vonage responded ${res.status}: ${await errorText(res)}`);
    const body = (await res.json()) as {
      messages?: Array<{ status: string; "message-id"?: string; "error-text"?: string }>;
    };
    const first = body.messages?.[0];
    if (first?.status !== "0")
      throw new Error(`Vonage rejected the message: ${first?.["error-text"] ?? "unknown error"}`);
    return { providerMessageId: first["message-id"] };
  },
});
