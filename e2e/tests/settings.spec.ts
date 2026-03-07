import { expect, test } from "@playwright/test";
import { nextOpenDate, onboardOwner } from "./helpers";

test("closures, capacity rules, areas and the restaurant profile", async ({ page }) => {
  const owner = await onboardOwner(page, "Osteria Impostazioni");
  const date = await nextOpenDate(page, owner.slug);

  await page.goto(`/r/${owner.restaurantId}/settings/closures`);
  await page.getByRole("button", { name: "Add date" }).click();
  await page.getByRole("dialog").getByLabel("Date").fill(date);
  await page.getByLabel("Reason (optional)").fill("Ferragosto");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ferragosto")).toBeVisible();

  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByLabel("Name (optional)").fill("Quiet Mondays");
  await page.getByLabel("When").selectOption("weekday");
  await page.locator(".fixed form select").nth(3).selectOption("mon");
  await page.getByLabel("Max covers").fill("20");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Quiet Mondays")).toBeVisible();

  await page.getByLabel("Area name").fill("Terrace");
  await page.getByRole("button", { name: "Add area" }).click();
  await expect(page.getByText("Terrace", { exact: true })).toBeVisible();

  // the closure is visible on the calendar and removes the day's slots
  await page.goto(`/r/${owner.restaurantId}/calendar?week=${date}`);
  await expect(page.getByText("Closed · Ferragosto")).toBeVisible();
  const avail = await (
    await page.request.get(
      `/api/public/v1/restaurants/${owner.slug}/availability?date=${date}&partySize=2`,
    )
  ).json();
  expect(avail.closed).toBe(true);

  await page.goto(`/r/${owner.restaurantId}/settings/restaurant`);
  await page.getByLabel("Phone").fill("+39 051 555 0000");
  await page.getByLabel("Address").fill("Via Roma 1, Bologna");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const restaurant = await (
    await page.request.get(`/api/v1/restaurants/${owner.restaurantId}`)
  ).json();
  expect(restaurant.address).toBe("Via Roma 1, Bologna");
});
