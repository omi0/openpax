import { expect, test } from "@playwright/test";
import { bookGuests, LUCIA, MARIO, nextOpenDate, onboardOwner } from "./helpers";

test("staff edit a booking, cancel with a reason, and find bookings by search", async ({
  page,
}) => {
  const owner = await onboardOwner(page, "Osteria Prenotazioni");
  const date = await nextOpenDate(page, owner.slug);
  const { codes } = await bookGuests(page, owner.slug, date, [MARIO, LUCIA]);

  await page.goto(`/r/${owner.restaurantId}/today?date=${date}`);
  const marioRow = page.locator("li", { hasText: "Mario Rossi" }).first();
  await marioRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit booking" })).toBeVisible();
  await page.getByLabel("Party size").fill("4");
  await page.getByLabel("Notes").fill("window table please");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(marioRow.getByText("window table please")).toBeVisible();
  await expect(marioRow.getByText("4", { exact: true })).toBeVisible();

  const luciaRow = page.locator("li", { hasText: "Lucia Bianchi" }).first();
  await luciaRow.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Cancel booking" })).toBeVisible();
  await page.getByLabel("Reason (optional)").fill("Guest called");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(luciaRow.getByText("Cancelled")).toBeVisible();

  await page.goto(`/r/${owner.restaurantId}/bookings`);
  await expect(page.getByText("2 bookings")).toBeVisible();
  await page.getByLabel("Search by guest, phone, email or code").fill(codes[0] ?? "");
  await page.waitForURL(/q=/);
  await expect(page.getByText("1 bookings")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mario Rossi" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Status").selectOption("cancelled");
  await expect(page.getByRole("link", { name: "Lucia Bianchi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mario Rossi" })).toHaveCount(0);
});
