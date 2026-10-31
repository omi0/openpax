import { expect, test } from "@playwright/test";
import { bookGuests, LUCIA, MARIO, nextOpenDate, onboardOwner } from "./helpers.js";

/**
 * Tables: the owner adds two tables in settings, guests get seated
 * automatically, the Today page shows the table chips and the floor view,
 * and staff can move a booking to another table by hand.
 */
test("bookings are seated on tables and staff can reassign from Today", async ({ page }) => {
  // web bookings made below pop up at the desk on the next visit; these flows are about the rest
  await page.addLocatorHandler(
    page.getByRole("dialog", { name: "New booking from the website" }),
    (alert) => alert.getByRole("button", { name: "Seen" }).click(),
    { noWaitAfter: true }, // one popup can follow another
  );
  const owner = await onboardOwner(page, "Tavoli E2E");

  // --- add tables from the settings page
  await page.goto(`/r/${owner.restaurantId}/settings/tables`);
  await expect(page.getByRole("heading", { name: "Rooms & tables" })).toBeVisible();
  for (const [name, max] of [
    ["T1", "2"],
    ["T2", "4"],
  ] as const) {
    await page.getByRole("button", { name: "Add table" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Max guests").fill(max);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.locator("svg text", { hasText: /^T1$/ })).toBeVisible();
  await expect(page.locator("svg text", { hasText: /^T2$/ })).toBeVisible();

  // --- two guests book: the two-top and the four-top get taken
  const date = await nextOpenDate(page, owner.slug);
  await bookGuests(page, owner.slug, date, [MARIO]);
  const avail = await (
    await page.request.get(
      `/api/public/v1/restaurants/${owner.slug}/availability?date=${date}&partySize=2`,
    )
  ).json();
  const slot = avail.slots.find((s: { available: boolean }) => s.available);
  const lucia = await page.request.post(`/api/public/v1/restaurants/${owner.slug}/bookings`, {
    data: { serviceId: slot.serviceId, startsAt: slot.startsAt, partySize: 2, guest: LUCIA },
  });
  expect(lucia.status(), await lucia.text()).toBe(201);

  // --- Today lists the chips and the floor view shows both tables taken
  await page.goto(`/r/${owner.restaurantId}/today?date=${date}`);
  const marioRow = page.locator("li", { hasText: MARIO.name }).first();
  await expect(marioRow.getByRole("button", { name: "T1" })).toBeVisible();
  const luciaRow = page.locator("li", { hasText: LUCIA.name }).first();
  await expect(luciaRow.getByRole("button", { name: "T2" })).toBeVisible();

  await page.getByRole("button", { name: "Floor plan" }).click();
  const { timezone } = (await (
    await page.request.get(`/api/v1/restaurants/${owner.restaurantId}`)
  ).json()) as { timezone: string };
  const time = new Date(slot.startsAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  await page.getByLabel("Time").fill(time);
  await expect(page.locator("svg text", { hasText: MARIO.name.split(" ")[0] ?? "" })).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();

  // --- move Lucia onto T1: taken by Mario, so it needs "seat anyway"
  await luciaRow.getByRole("button", { name: "T2" }).click();
  const dialog = page.getByRole("dialog");
  // tables are picked on the floor plan: tap T2 off, tap T1 on
  const t2 = dialog.getByRole("button", { name: /^T2\b/ });
  const t1 = dialog.getByRole("button", { name: /^T1\b/ });
  await t2.click();
  await expect(t2).toHaveAttribute("aria-pressed", "false");
  await expect(t1).toHaveAccessibleName(new RegExp(`taken by ${MARIO.name}`));
  await t1.click();
  await expect(t1).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("One of the chosen tables is taken at that time")).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Seat here anyway/ }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(luciaRow.getByRole("button", { name: "T1" })).toBeVisible();
});
