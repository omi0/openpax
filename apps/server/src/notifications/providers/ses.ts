import { createHash, createHmac } from "node:crypto";
import { defineProvider } from "../provider.js";
import { errorText } from "./address.js";

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

export interface SigV4Input {
  method: string;
  url: URL;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now?: Date;
}

/** AWS Signature Version 4 for a JSON request; enough for SES without the SDK. */
export function signV4(input: SigV4Input): Record<string, string> {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = input.url.host;
  const payloadHash = sha256(input.body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]?.trim()}\n`)
    .join("");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    input.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  const { host: _host, ...rest } = headers;
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export const sesProvider = defineProvider({
  id: "ses",
  channel: "email",
  label: "Amazon SES",
  description:
    "Amazon Simple Email Service (API v2). Needs an IAM key with ses:SendEmail and a verified identity.",
  fields: [
    {
      key: "region",
      label: "Region",
      type: "text",
      required: true,
      secret: false,
      placeholder: "eu-south-1",
    },
    { key: "accessKeyId", label: "Access key ID", type: "text", required: true, secret: false },
    {
      key: "secretAccessKey",
      label: "Secret access key",
      type: "password",
      required: true,
      secret: true,
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
    const region = String(config.region).trim();
    const url = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
    const body = JSON.stringify({
      FromEmailAddress: config.from,
      Destination: { ToAddresses: [message.to] },
      ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: message.html, Charset: "UTF-8" },
            Text: { Data: message.text, Charset: "UTF-8" },
          },
        },
      },
    });
    const headers = signV4({
      method: "POST",
      url,
      body,
      region,
      service: "ses",
      accessKeyId: String(config.accessKeyId),
      secretAccessKey: String(config.secretAccessKey),
    });
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) throw new Error(`SES responded ${res.status}: ${await errorText(res)}`);
    const parsed = (await res.json()) as { MessageId?: string };
    return { providerMessageId: parsed.MessageId };
  },
});
