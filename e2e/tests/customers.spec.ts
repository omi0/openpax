import { expect, test } from "@playwright/test";
import { bookGuests, LUCIA, MARIO, nextOpenDate, onboardOwner } from "./helpers";

test("guest book lists guests, searches them and edits a profile", async ({ page }) => {
  const owner = await onboardOwner(page, "Osteria Clienti");
  const date = await nextOpenDate(page, owner.slug);
  await bookGuests(page, owner.slug, date, [MARIO, LUCIA]);

  await page.goto(`/r/${owner.restaurantId}/customers`);
  await expect(page.getByRole("link", { name: "Lucia Bianchi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mario Rossi" })).toBeVisible();

  await page.getByLabel("Search by name, email or phone").fill("mario");
  await page.waitForURL(/q=mario/);
  await expect(page.getByRole("link", { name: "Lucia Bianchi" })).toHaveCount(0);
  await page.getByRole("link", { name: "Mario Rossi" }).click();

  await expect(page.getByRole("heading", { name: "Mario Rossi" })).toBeVisible();
  await page.getByPlaceholder("Add a tag").fill("vip");
  await page.getByPlaceholder("Add a tag").press("Enter");
  await page.getByLabel("Internal notes").fill("Allergic to nuts");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  // history shows the booking made through the widget API
  await expect(page.getByText("Confirmed")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Internal notes")).toHaveValue("Allergic to nuts");
  await expect(page.getByRole("heading", { name: "Mario Rossi" })).toBeVisible();
  await expect(
    page.locator("h1 + span, h1 ~ span").filter({ hasText: "vip" }).first(),
  ).toBeVisible();
});
