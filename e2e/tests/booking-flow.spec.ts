import { expect, test } from "@playwright/test";

/**
 * The full vertical slice: owner signs up, walks through the setup guide
 * (restaurant, hours, rooms, rules, email provider), a guest books through the hosted widget page,
 * the booking shows up in the Today view, and the confirmation email was logged.
 */
test("owner onboards, guest books through the widget, booking appears on Today", async ({
  page,
  baseURL,
}) => {
  const email = `owner-${Date.now()}@example.com`;

  // --- sign up
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Anna Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password-1234");
  await page.getByRole("button", { name: "Create account" }).click();

  // --- onboarding step 1
  await expect(page.getByRole("heading", { name: "Set up your restaurant" })).toBeVisible();
  await page.getByLabel("Restaurant name").fill("Osteria E2E");
  await page.getByLabel("How many guests can you seat at once?").fill("40");
  await page.getByLabel("Email for notifications").fill("staff@example.com");
  await page.getByRole("button", { name: "Continue" }).click();

  // --- the setup guide takes over: the starter dinner service is prefilled (every day but Monday)
  await expect(page.getByRole("heading", { name: "When can guests book?" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // --- rooms: the seats given in step 1 became the first room
  await expect(page.getByRole("heading", { name: "Rooms and seats" })).toBeVisible();
  await expect(page.getByText("40 seats")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // --- booking rules keep their defaults
  await expect(page.getByRole("heading", { name: "Booking rules" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();

  // --- notifications: configure the console email provider so messages are "sent"
  await expect(page.getByRole("heading", { name: "Emails to guests and to you" })).toBeVisible();
  const emailCard = page.locator("section", { hasText: "Email" }).first();
  await emailCard.getByLabel("Choose a provider").selectOption("console-email");
  await emailCard.getByRole("button", { name: "Save" }).click();
  // the form reloads with the stored configuration; the scope badge confirms the save
  await expect(
    emailCard.locator("span.rounded-full", { hasText: "This restaurant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // --- the team can wait
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  // --- go live: the embed snippet, then finish the guide and land on Today
  await expect(page.getByRole("heading", { name: "Go live", exact: true })).toBeVisible();
  const snippet = await page.locator("pre").first().textContent();
  expect(snippet).toContain('data-restaurant="osteria-e2e"');
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  // --- guest books through the hosted widget page
  const guest = await page.context().newPage();
  await guest.goto(`${baseURL}/book/osteria-e2e?lang=en`);
  await expect(guest.getByRole("heading", { name: "Osteria E2E" })).toBeVisible();
  // pick the first enabled day that is not today (today may be past the last seating)
  const days = guest.locator(".cal button.open:not(:disabled)");
  await expect(days.first()).toBeVisible();
  const count = await days.count();
  await days.nth(Math.min(1, count - 1)).click();
  const slot = guest.locator(".slot:not(:disabled)").first();
  await expect(slot).toBeVisible();
  const slotTime = (await slot.textContent())?.trim() ?? "";
  await slot.click();
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("textbox", { name: "Full name" }).fill("Mario Guest");
  await guest.getByRole("textbox", { name: "Email" }).fill("mario@example.com");
  await guest.getByRole("textbox", { name: "Phone" }).fill("+39 333 1234567");
  await guest.getByRole("button", { name: "Confirm booking" }).click();
  await expect(guest.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  const code = (await guest.locator(".code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // --- the booking shows up in the dashboard on that date
  const me = await page.request.get(`${baseURL}/api/v1/me`);
  const restaurantId = (await me.json()).restaurants[0].id as string;
  const list = await page.request.get(
    `${baseURL}/api/v1/restaurants/${restaurantId}/bookings?pageSize=10`,
  );
  const bookings = (await list.json()).items as Array<{
    serviceDate: string;
    confirmationCode: string;
    status: string;
  }>;
  const booking = bookings.find((b) => b.confirmationCode === code);
  expect(booking?.status).toBe("confirmed");

  await page.goto(`/r/${restaurantId}/today?date=${booking?.serviceDate}`);
  await expect(page.getByText("Mario Guest")).toBeVisible();
  await expect(page.getByText(slotTime, { exact: true })).toBeVisible();

  // --- the booking sheet shows the confirmation email as sent (may take a relay tick)
  await page.getByText("Mario Guest").click();
  await expect(page.getByText("sent").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  // --- staff seats the guest from the row
  await page.getByRole("button", { name: "Seat" }).first().click();
  await expect(page.getByText("Seated", { exact: true })).toBeVisible();
});
