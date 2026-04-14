import { expect, test } from "@playwright/test";
import { nextOpenDate, onboardOwner } from "./helpers";

const GUESTS = [
  { name: "Mario Rossi", email: "mario@example.com", phone: "+39 333 1234567", party: 2 },
  { name: "Lucia Bianchi", email: "lucia@example.com", phone: "+39 340 7654321", party: 4 },
  {
    name: "Giulia Ferrari",
    email: "giulia@example.com",
    phone: "+39 347 2223344",
    party: 3,
    notes: "Birthday, a window table if possible",
  },
  { name: "Andrea Conti", email: "andrea@example.com", phone: "+39 328 9988776", party: 6 },
  { name: "Sara Esposito", email: "sara@example.com", phone: "+39 335 1122334", party: 2 },
  { name: "Luca Romano", email: "luca@example.com", phone: "+39 366 5566778", party: 5 },
];

/** Book each guest on a different slot of the evening through the public API. */
async function bookEvening(page: Parameters<typeof onboardOwner>[0], slug: string, date: string) {
  for (const [i, g] of GUESTS.entries()) {
    const avail = await (
      await page.request.get(
        `/api/public/v1/restaurants/${slug}/availability?date=${date}&partySize=${g.party}`,
      )
    ).json();
    const slots = avail.slots.filter((s: { available: boolean }) => s.available);
    const slot = slots[Math.min(i * 2, slots.length - 1)];
    const res = await page.request.post(`/api/public/v1/restaurants/${slug}/bookings`, {
      data: {
        serviceId: slot.serviceId,
        startsAt: slot.startsAt,
        partySize: g.party,
        guest: { name: g.name, email: g.email, phone: g.phone },
        notes: g.notes,
      },
    });
    expect(res.status(), await res.text()).toBe(201);
  }
}

test("Today lists the evening's bookings and reflects seat and cancel", async ({
  page,
  browser,
}) => {
  const owner = await onboardOwner(page, "Trattoria da Anna");
  const date = await nextOpenDate(page, owner.slug);
  await bookEvening(page, owner.slug, date);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/r/${owner.restaurantId}/today?date=${date}`);
  for (const g of GUESTS) await expect(page.locator("li", { hasText: g.name })).toBeVisible();

  const mario = page.locator("li", { hasText: "Mario Rossi" });
  await mario.getByRole("button", { name: "Seat" }).click();
  await expect(page.getByText("Guest seated", { exact: true })).toBeVisible();
  await expect(mario.getByText("Seated")).toBeVisible();

  const sara = page.locator("li", { hasText: "Sara Esposito" });
  await sara.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Cancel booking" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(sara.getByText("Cancelled")).toBeVisible();

  const dir = process.env.E2E_SCREENSHOT_DIR;
  if (dir) {
    // wait for the toasts to fade so the README screenshot is clean
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
    await page.screenshot({ path: `${dir}/today.png` });
  }

  // the widget on a phone: it opens on the next bookable day with the slots of the evening
  const phone = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { width: 400, height: 780 },
    deviceScaleFactor: 2,
    locale: "en-GB",
  });
  const widget = await phone.newPage();
  await widget.goto(`/book/${owner.slug}`);
  await expect(widget.locator(".slot").first()).toBeVisible();
  if (dir) await widget.screenshot({ path: `${dir}/widget.png` });
  await phone.close();
});
