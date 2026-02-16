import { expect, test } from "@playwright/test";
import { onboardOwner } from "./helpers.js";

/** Settings → Payments: keys are stored masked and the deposit policy is saved. */
test("owner configures Stripe keys and a deposit policy", async ({ page }) => {
  const owner = await onboardOwner(page, "Caparra E2E");
  await page.goto(`/r/${owner.restaurantId}/settings/payments`);
  await expect(page.getByRole("heading", { name: "Stripe" })).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();
  await expect(page.getByLabel("Webhook URL")).toHaveValue(
    new RegExp(`/api/public/v1/payments/stripe/webhook/${owner.restaurantId}$`),
  );

  await page.getByLabel("Secret key").fill("sk_test_e2e_1234");
  await page.getByLabel("What to ask guests").selectOption("deposit");
  await page.getByLabel(/Amount per guest/).fill("15");
  await page.getByLabel("Only from party size").fill("6");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Set (ends in 1234)")).toBeVisible();

  const cfg = (await (
    await page.request.get(`/api/v1/restaurants/${owner.restaurantId}/payments/config`)
  ).json()) as { mode: string; amountCents: number; minPartySize: number | null };
  expect(cfg).toMatchObject({ mode: "deposit", amountCents: 1500, minPartySize: 6 });
});
