import { expect, test } from "@playwright/test";
import { nextOpenDate, onboardOwner } from "./helpers";

test("API keys authenticate the staff API until revoked", async ({ page, request }) => {
  const owner = await onboardOwner(page, "Osteria API");
  const date = await nextOpenDate(page, owner.slug);

  await page.goto(`/r/${owner.restaurantId}/settings/api-keys`);
  await page.getByLabel("Name").fill("POS");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("Copy your new key now")).toBeVisible();
  const key = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(key).toMatch(/^sitli_/);

  // `request` has no session cookie: the key alone must authenticate
  const url = `/api/v1/restaurants/${owner.restaurantId}/bookings?date=${date}`;
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.get(url, { headers: { "x-api-key": key } })).status()).toBe(200);

  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("No API keys yet.")).toBeVisible();
  expect((await request.get(url, { headers: { "x-api-key": key } })).status()).toBe(401);
});
