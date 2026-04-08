import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { onboardOwner } from "./helpers";

/**
 * An assistant connects through the browser: it registers itself, sends the
 * owner to Sitli, the owner approves on the consent page and lands back on
 * the assistant's callback with a code. The settings page lists the
 * connection and disconnects it.
 */
test("an assistant connects with OAuth and can be disconnected from Settings", async ({
  page,
  request,
  baseURL,
}) => {
  const owner = await onboardOwner(page, "Osteria Assistente");
  const callback = "http://127.0.0.1:6274/oauth/callback";

  // what Claude does behind the scenes: dynamic client registration
  const registered = await request.post("/api/auth/oauth2/register", {
    data: {
      client_name: "Claude",
      client_uri: "https://claude.ai",
      redirect_uris: [callback],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: "native",
    },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const { client_id: clientId } = (await registered.json()) as { client_id: string };

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URL("/api/auth/oauth2/authorize", baseURL);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "read write",
    state: "e2e-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${baseURL}/mcp`,
  }).toString();

  // the browser is signed in already, so the consent page comes straight away
  await page.goto(authorize.toString());
  await expect(page.getByRole("heading", { name: "Connect an assistant" })).toBeVisible();
  await expect(page.getByText("Claude wants to use Sitli as")).toBeVisible();
  await expect(page.getByText("Osteria Assistente")).toBeVisible();
  await expect(page.getByLabel("Allow it to make changes")).toBeChecked();

  // nothing listens on the callback address: answer it from the test so the
  // browser lands there and the URL (state + code) can be read back
  await page.route(`${callback}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>connected</p>" }),
  );
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL((url) => url.href.startsWith(callback), { timeout: 15_000 });
  const landing = new URL(page.url());
  expect(`${landing.origin}${landing.pathname}`).toBe(callback);
  expect(landing.searchParams.get("state")).toBe("e2e-state");
  const code = landing.searchParams.get("code");
  expect(code).toBeTruthy();

  // the code buys a token that opens the MCP server
  const token = await request.post("/api/auth/oauth2/token", {
    form: {
      grant_type: "authorization_code",
      code: code ?? "",
      redirect_uri: callback,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${baseURL}/mcp`,
    },
  });
  expect(token.status(), await token.text()).toBe(200);
  const { access_token: accessToken } = (await token.json()) as { access_token: string };
  const tools = await request.post("/mcp", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(tools.status(), await tools.text()).toBe(200);
  const listed = (await tools.json()) as { result: { tools: Array<{ name: string }> } };
  expect(listed.result.tools.map((t) => t.name)).toContain("create_booking");

  await page.goto(`/r/${owner.restaurantId}/settings/assistants`);
  await expect(page.getByText("Address to give the assistant")).toBeVisible();
  await expect(page.locator("code").first()).toHaveText(`${baseURL}/mcp`);
  // the "how to connect" list mentions Claude too: look inside the connections card
  const connection = page
    .locator("section", { hasText: "Connected assistants" })
    .getByRole("listitem")
    .filter({ hasText: "Claude" });
  await expect(connection).toBeVisible();
  await expect(connection.getByText("Can make changes")).toBeVisible();

  await connection.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("No assistant is connected yet.")).toBeVisible();
  const afterRevoke = await request.post("/mcp", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  expect(afterRevoke.status()).toBe(401);
});
