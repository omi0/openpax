import { expect, test } from "@playwright/test";
import { MARIO, nextOpenDate, onboardOwner } from "./helpers.js";

/** The guest rates a past visit from their link; the rating shows up on the Feedback page. */
test("guest leaves feedback after the visit and staff see it", async ({ page, baseURL }) => {
  const owner = await onboardOwner(page, "Feedback E2E");
  const api = `${baseURL}/api/v1/restaurants/${owner.restaurantId}`;

  // book online, then move the visit into the past so feedback opens
  const date = await nextOpenDate(page, owner.slug);
  const avail = await (
    await page.request.get(
      `/api/public/v1/restaurants/${owner.slug}/availability?date=${date}&partySize=2`,
    )
  ).json();
  const slot = avail.slots.find((s: { available: boolean }) => s.available);
  const created = await page.request.post(`/api/public/v1/restaurants/${owner.slug}/bookings`, {
    data: { serviceId: slot.serviceId, startsAt: slot.startsAt, partySize: 2, guest: MARIO },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id, manageUrl } = (await created.json()) as { id: string; manageUrl: string };
  const token = manageUrl.split("/").pop() ?? "";
  const lastWeek = new Date(new Date(slot.startsAt).getTime() - 14 * 24 * 60 * 60 * 1000);
  const moved = await page.request.patch(`${api}/bookings/${id}`, {
    data: { startsAt: lastWeek.toISOString(), ignoreCapacity: true },
  });
  expect(moved.status(), await moved.text()).toBe(200);

  const guest = await page.context().newPage();
  await guest.goto(`${baseURL}/book/${owner.slug}/feedback/${token}?lang=en`);
  await expect(guest.getByRole("heading", { name: "Feedback E2E" })).toBeVisible();
  await guest.getByRole("button", { name: "4 stars" }).click();
  await guest.getByLabel("Comment (optional)").fill("Great pasta, slow dessert.");
  await guest.getByRole("button", { name: "Send" }).click();
  await expect(guest.getByRole("heading", { name: "Thank you!" })).toBeVisible();

  await page.goto(`/r/${owner.restaurantId}/feedback`);
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await expect(page.getByText("Great pasta, slow dessert.")).toBeVisible();
  await expect(page.getByLabel("4/5").first()).toBeVisible();
});
