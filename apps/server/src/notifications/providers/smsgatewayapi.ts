import { defineProvider } from "../provider.js";
import { errorText } from "./address.js";

/** smsgatewayapi.com: client id and secret as headers, one JSON call per message. */
export const smsGatewayApiProvider = defineProvider({
  id: "smsgatewayapi",
  channel: "sms",
  label: "SMS Gateway API",
  description: "SMS via smsgatewayapi.com, with the client id and secret of your account.",
  fields: [
    { key: "clientId", label: "Client ID", type: "text", required: true, secret: false },
    {
      key: "clientSecret",
      label: "Client secret",
      type: "password",
      required: true,
      secret: true,
    },
    {
      key: "sender",
      label: "Sender",
      type: "text",
      required: true,
      secret: false,
      help: "Alphanumeric sender ID (max 11 characters) or a phone number.",
      placeholder: "Trattoria",
    },
  ],
  async send(message, config) {
    const res = await fetch("https://api.smsgatewayapi.com/v1/message/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-client-id": String(config.clientId ?? ""),
        "x-client-secret": String(config.clientSecret ?? ""),
      },
      body: JSON.stringify({
        message: message.body,
        to: message.to.replace(/^\+/, ""),
        sender: config.sender,
      }),
    });
    if (!res.ok) {
      // errors come back as {"error":102,"errorMsg":"Not enough credits."}
      const text = await errorText(res);
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { errorMsg?: string };
        if (parsed.errorMsg) detail = parsed.errorMsg;
      } catch {}
      throw new Error(`SMS Gateway API responded ${res.status}: ${detail}`);
    }
    const body = (await res.json()) as { messageid?: string; error?: number; errorMsg?: string };
    if (body.error)
      throw new Error(`SMS Gateway API rejected the message: ${body.errorMsg ?? body.error}`);
    return { providerMessageId: body.messageid };
  },
});
