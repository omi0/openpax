import { expect, test } from "@playwright/test";
import { onboardOwner } from "./helpers";

test("a phone-first trattoria: guests book with a number only and tick the privacy box", async ({
  page,
}) => {
  const owner = await onboardOwner(page, "Pizzeria Telefono");

  // --- the owner makes the email optional and asks for the privacy checkbox
  await page.goto(`/r/${owner.restaurantId}/settings/widget`);
  await page.getByRole("switch", { name: "Require email address" }).click();
  await page.getByRole("switch", { name: "Privacy checkbox" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const cfg = (await (
    await page.request.get(`/api/public/v1/restaurants/${owner.slug}/widget-config`)
  ).json()) as { widget: { requireEmail: boolean; requirePrivacyConsent: boolean } };
  expect(cfg.widget).toMatchObject({ requireEmail: false, requirePrivacyConsent: true });

  // --- a guest books through the hosted page with a phone number only
  const guest = await page.context().newPage();
  await guest.goto(`/book/${owner.slug}?lang=en`);
  const days = guest.locator(".cal button.open:not(:disabled)");
  await expect(days.first()).toBeVisible();
  const count = await days.count();
  await days.nth(Math.min(1, count - 1)).click();
  const slot = guest.locator(".slot:not(:disabled)").first();
  await expect(slot).toBeVisible();
  await slot.click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("textbox", { name: "Full name" }).fill("Teresa Solo");
  await expect(guest.getByRole("textbox", { name: "Email (optional)" })).toBeVisible();
  await guest.getByRole("textbox", { name: "Phone" }).fill("+39 333 5556667");
  // the form does not go through without the privacy box
  await guest.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.getByRole("heading", { name: "Booking confirmed" })).toHaveCount(0);
  await guest.getByRole("checkbox", { name: /privacy policy/ }).check();
  await guest.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  await expect(guest.getByText("We sent you a confirmation text message.")).toBeVisible();

  // --- the dashboard has the guest with a phone and no email
  const list = (await (
    await page.request.get(`/api/v1/restaurants/${owner.restaurantId}/bookings?pageSize=10`)
  ).json()) as {
    items: Array<{ customer: { name: string; email: string | null; phone: string | null } }>;
  };
  const booking = list.items.find((b) => b.customer.name === "Teresa Solo");
  expect(booking?.customer).toMatchObject({ email: null, phone: "+393335556667" });
});
