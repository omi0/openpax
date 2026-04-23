import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAddress } from "../src/notifications/providers/address.js";
import { postmarkProvider } from "../src/notifications/providers/postmark.js";
import { sendgridProvider } from "../src/notifications/providers/sendgrid.js";
import { sesProvider, signV4 } from "../src/notifications/providers/ses.js";
import { smsGatewayApiProvider } from "../src/notifications/providers/smsgatewayapi.js";
import { vonageProvider } from "../src/notifications/providers/vonage.js";

const email = {
  to: "mario@example.com",
  toName: "Mario Rossi",
  subject: "Prenotazione confermata",
  html: "<p>ciao</p>",
  text: "ciao",
  replyTo: "info@example.com",
};

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("email providers", () => {
  it("parses display names out of From addresses", () => {
    expect(parseAddress("Trattoria Roma <info@example.com>")).toEqual({
      email: "info@example.com",
      name: "Trattoria Roma",
    });
    expect(parseAddress("info@example.com")).toEqual({ email: "info@example.com" });
  });

  it("sends through SendGrid and reads the message id header", async () => {
    const calls = mockFetch(202, "", { "x-message-id": "sg-1" });
    const result = await sendgridProvider.send(email, {
      apiKey: "SG.key",
      from: "Trattoria <info@example.com>",
    });
    expect(result.providerMessageId).toBe("sg-1");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.from).toEqual({ email: "info@example.com", name: "Trattoria" });
    expect(body.personalizations[0].to[0]).toEqual({ email: email.to, name: "Mario Rossi" });
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer SG.key");
  });

  it("sends through Postmark with the server token", async () => {
    const calls = mockFetch(200, { MessageID: "pm-1" });
    const result = await postmarkProvider.send(email, {
      serverToken: "token",
      from: "info@example.com",
      messageStream: "outbound",
    });
    expect(result.providerMessageId).toBe("pm-1");
    expect(new Headers(calls[0]?.init.headers).get("x-postmark-server-token")).toBe("token");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      To: "Mario Rossi <mario@example.com>",
      MessageStream: "outbound",
      ReplyTo: "info@example.com",
    });
  });

  it("surfaces provider errors", async () => {
    mockFetch(422, { errors: [{ message: "bad from" }] });
    await expect(
      sendgridProvider.send(email, { apiKey: "k", from: "info@example.com" }),
    ).rejects.toThrow(/SendGrid responded 422/);
  });

  it("signs SES requests with SigV4 (AWS documented test vector shape)", () => {
    const headers = signV4({
      method: "POST",
      url: new URL("https://email.eu-south-1.amazonaws.com/v2/email/outbound-emails"),
      body: '{"a":1}',
      region: "eu-south-1",
      service: "ses",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      now: new Date("2026-06-10T10:00:00Z"),
    });
    expect(headers["x-amz-date"]).toBe("20260610T100000Z");
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260610\/eu-south-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    // deterministic for the same input
    const again = signV4({
      method: "POST",
      url: new URL("https://email.eu-south-1.amazonaws.com/v2/email/outbound-emails"),
      body: '{"a":1}',
      region: "eu-south-1",
      service: "ses",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      now: new Date("2026-06-10T10:00:00Z"),
    });
    expect(again.authorization).toBe(headers.authorization);
  });

  it("sends through SES v2 and reads MessageId", async () => {
    const calls = mockFetch(200, { MessageId: "ses-1" });
    const result = await sesProvider.send(email, {
      region: "eu-south-1",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      from: "Trattoria <info@example.com>",
    });
    expect(result.providerMessageId).toBe("ses-1");
    expect(calls[0]?.url).toBe("https://email.eu-south-1.amazonaws.com/v2/email/outbound-emails");
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
    expect(JSON.parse(String(calls[0]?.init.body)).Content.Simple.Subject.Data).toBe(email.subject);
  });
});

describe("sms providers", () => {
  it("sends through Vonage and rejects non-zero statuses", async () => {
    const calls = mockFetch(200, { messages: [{ status: "0", "message-id": "vg-1" }] });
    const ok = await vonageProvider.send(
      { to: "+393331234567", body: "ciao" },
      { apiKey: "k", apiSecret: "s", from: "Trattoria" },
    );
    expect(ok.providerMessageId).toBe("vg-1");
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      to: "393331234567",
      from: "Trattoria",
    });

    mockFetch(200, { messages: [{ status: "4", "error-text": "Bad Credentials" }] });
    await expect(
      vonageProvider.send(
        { to: "+393331234567", body: "ciao" },
        { apiKey: "k", apiSecret: "s", from: "Trattoria" },
      ),
    ).rejects.toThrow(/Bad Credentials/);
  });

  it("sends through SMS Gateway API with the client headers and reports its errors", async () => {
    const config = { clientId: "id-1", clientSecret: "secret-1", sender: "Trattoria" };
    const calls = mockFetch(200, { messageid: "sg-1" });
    const ok = await smsGatewayApiProvider.send({ to: "+393331234567", body: "ciao" }, config);
    expect(ok.providerMessageId).toBe("sg-1");
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-client-id")).toBe("id-1");
    expect(headers.get("x-client-secret")).toBe("secret-1");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      message: "ciao",
      to: "393331234567",
      sender: "Trattoria",
    });

    mockFetch(400, { error: 102, errorMsg: "Not enough credits." });
    await expect(
      smsGatewayApiProvider.send({ to: "+393331234567", body: "ciao" }, config),
    ).rejects.toThrow(/400: Not enough credits/);
  });
});
