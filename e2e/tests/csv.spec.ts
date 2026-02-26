import { expect, test } from "@playwright/test";
import { onboardOwner } from "./helpers.js";

/** Guests are imported from a CSV file through the dialog and exported back. */
test("owner imports guests from CSV and exports the guest book", async ({ page }) => {
  const owner = await onboardOwner(page, "CSV E2E");
  await page.goto(`/r/${owner.restaurantId}/customers`);
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("CSV file").setInputFiles({
    name: "guests.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,email,phone,tags\nMario Rossi,mario@example.com,+39 333 1234567,vip\nLucia Bianchi,lucia@example.com,,\n",
    ),
  });
  await dialog.getByRole("button", { name: "Preview only (do not save)" }).click();
  await expect(dialog.getByText("2 created, 0 updated, 0 skipped")).toBeVisible();
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByText("Import complete")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(page.getByText("Mario Rossi")).toBeVisible();
  await expect(page.getByText("Lucia Bianchi")).toBeVisible();

  const exported = await page.request.get(
    `/api/v1/restaurants/${owner.restaurantId}/customers/export`,
  );
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toContain("text/csv");
  const text = await exported.text();
  expect(text).toContain("Lucia Bianchi,lucia@example.com");
  expect(text).toContain("Mario Rossi,mario@example.com,+393331234567");
});
