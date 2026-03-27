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

test("counts cancellations and merges a duplicate entry into the guest", async ({ page }) => {
  const owner = await onboardOwner(page, "Osteria Duplicati");
  const date = await nextOpenDate(page, owner.slug);
  const { slot, codes } = await bookGuests(page, owner.slug, date, [MARIO, LUCIA]);
  const base = `/api/v1/restaurants/${owner.restaurantId}`;

  // Staff take a phone booking for Mario with a different number and no email: a second entry.
  const byPhone = await page.request.post(`${base}/bookings`, {
    data: {
      serviceId: slot.serviceId,
      startsAt: slot.startsAt,
      partySize: 2,
      customer: { name: "mario rossi", phone: "+39 333 9998877" },
      source: "phone",
    },
  });
  expect(byPhone.status(), await byPhone.text()).toBe(201);
  // Mario's online booking gets cancelled.
  const day = await (await page.request.get(`${base}/bookings?date=${date}`)).json();
  const online = day.items.find(
    (b: { confirmationCode: string }) => b.confirmationCode === codes[0],
  );
  const cancelled = await page.request.post(`${base}/bookings/${online.id}/actions`, {
    data: { action: "cancel", reason: "Change of plans" },
  });
  expect(cancelled.status(), await cancelled.text()).toBe(200);

  await page.goto(`/r/${owner.restaurantId}/customers`);
  await expect(page.getByRole("link", { name: "mario rossi", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Mario Rossi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mario Rossi" })).toBeVisible();

  // a Stat renders its label and its value as two sibling paragraphs
  const stat = (label: string) =>
    page
      .locator("p", { hasText: new RegExp(`^${label}$`) })
      .locator("xpath=following-sibling::p[1]");
  await expect(stat("Cancellations")).toHaveText("1");
  await expect(stat("Bookings")).toHaveText("1");

  const duplicates = page.locator("section", { hasText: "Possible duplicates" });
  await expect(duplicates.getByRole("link", { name: "mario rossi" })).toBeVisible();
  await expect(duplicates.getByText("In common: name")).toBeVisible();
  await expect(duplicates.getByRole("link", { name: "Lucia Bianchi" })).toHaveCount(0);
  if (process.env.E2E_SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.E2E_SCREENSHOT_DIR}/customer-duplicates.png`,
      fullPage: true,
    });

  await duplicates.getByRole("button", { name: "Merge into this guest" }).click();
  await expect(page.getByRole("dialog")).toContainText("Merge mario rossi into this guest?");
  await page.getByRole("dialog").getByRole("button", { name: "Merge into this guest" }).click();
  await expect(page.getByText("Guests merged", { exact: true })).toBeVisible();

  await expect(stat("Bookings")).toHaveText("2");
  await expect(stat("Cancellations")).toHaveText("1");
  await expect(duplicates.getByText("No other entry looks like this guest.")).toBeVisible();
  // the second phone number is not lost: the entry keeps its own and notes the other
  await expect(page.getByLabel("Internal notes")).toHaveValue(
    /(Other contacts|Altri contatti): \+393339998877/,
  );
  await expect(page.getByLabel("Phone")).toHaveValue("+393331234567");

  await page.goto(`/r/${owner.restaurantId}/customers`);
  await expect(page.getByRole("link", { name: /mario rossi/i })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Lucia Bianchi" })).toBeVisible();
});
