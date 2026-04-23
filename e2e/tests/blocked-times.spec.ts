import { expect, test } from "@playwright/test";
import { nextOpenDate, onboardOwner } from "./helpers";

// the last step waits for the dashboard's 30-second poll for new bookings
test.setTimeout(120_000);

test("the owner blocks two evening times from Today, books by hand in a room and hears of an online booking", async ({
  page,
}) => {
  const owner = await onboardOwner(page, "Trattoria del Sabato");
  const date = await nextOpenDate(page, owner.slug);
  const areas = (await (
    await page.request.get(`/api/v1/restaurants/${owner.restaurantId}/areas`)
  ).json()) as Array<{ name: string }>;
  const room = areas[0]?.name ?? "";
  expect(room).not.toBe("");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/r/${owner.restaurantId}/today?date=${date}`);

  // --- block the first two times of the evening with one tap each
  await page.getByRole("button", { name: "Block times" }).click();
  const dialog = page.getByRole("dialog");
  const chips = dialog.locator("button[aria-pressed]:not(:disabled)");
  await expect(chips.first()).toBeVisible();
  const first = (await chips.nth(0).textContent())?.trim() ?? "";
  const second = (await chips.nth(1).textContent())?.trim() ?? "";
  await chips.nth(0).click();
  await chips.nth(1).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByText(`Times blocked online: ${first}, ${second}`)).toBeVisible();

  // the widget no longer offers them; the rest of the evening is untouched
  const avail = (await (
    await page.request.get(
      `/api/public/v1/restaurants/${owner.slug}/availability?date=${date}&partySize=2`,
    )
  ).json()) as { slots: Array<{ startLocal: string; available: boolean; reason?: string }> };
  const at = (time: string) => avail.slots.find((s) => s.startLocal === time);
  expect(at(first)).toMatchObject({ available: false, reason: "full" });
  expect(at(second)).toMatchObject({ available: false, reason: "full" });
  expect(avail.slots.some((s) => s.available)).toBe(true);

  // --- a phone booking at a blocked time, by hand, with the room the guest asked for
  // an empty day offers "New booking" twice (header and empty state)
  await page.getByRole("button", { name: "New booking" }).first().click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Guest name").fill("Giulia Neri");
  // exact: the Source select's label also contains its "Phone" option
  await form.getByLabel("Phone", { exact: true }).fill("+39 333 2223334");
  await form.getByLabel("Room").selectOption({ label: room });
  // the blocked time shows as full; the owner overrides the limit
  await form.getByRole("button", { name: new RegExp(`^${first}`) }).click();
  await form.getByLabel("Ignore capacity limits").check();
  await form.getByRole("button", { name: "Create booking" }).click();
  await expect(page.getByText("Booking for Giulia Neri created")).toBeVisible();
  const row = page.locator("li", { hasText: "Giulia Neri" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(room);

  // --- reopen the times: untick both and the banner goes away
  await page.getByRole("button", { name: "Change", exact: true }).click();
  const again = page.getByRole("dialog");
  const blocked = again.locator('button[aria-pressed="true"]');
  await expect(blocked).toHaveCount(2);
  await blocked.nth(1).click();
  await blocked.nth(0).click();
  await again.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Times blocked online")).toHaveCount(0);

  // --- a guest books online while Today is open: the desk hears about it without refreshing
  const free = avail.slots.find(
    (s) => s.available && s.startLocal !== first && s.startLocal !== second,
  );
  expect(free).toBeTruthy();
  const online = await page.request.post(`/api/public/v1/restaurants/${owner.slug}/bookings`, {
    data: {
      serviceId: (free as unknown as { serviceId: string }).serviceId,
      startsAt: (free as unknown as { startsAt: string }).startsAt,
      partySize: 3,
      guest: { name: "Marco Blu", email: "marco@example.com", phone: "+39 333 4445556" },
    },
  });
  expect(online.status(), await online.text()).toBe(201);
  await expect(page.getByText(/New online booking: Marco Blu, 3 guests/)).toBeVisible({
    timeout: 45_000,
  });
});
