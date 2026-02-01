import { expect, test } from "@playwright/test";
import { LUCIA, MARIO, nextOpenDate, onboardOwner } from "./helpers.js";

/**
 * A full date: the guest joins the waitlist from the widget, a cancellation
 * frees a table, the auto-offer reaches the guest's link and they confirm it
 * into a booking that shows up in the dashboard.
 */
test("guest joins the waitlist on a full date and confirms the auto-offered table", async ({
  page,
  baseURL,
}) => {
  const owner = await onboardOwner(page, "Waitlist E2E");
  const api = `${baseURL}/api/v1/restaurants/${owner.restaurantId}`;

  // two covers per slot: one booking of two fills each arrival slot
  const services = (await (await page.request.get(`${api}/services`)).json()) as Array<
    Record<string, unknown> & { id: string }
  >;
  const svc = services[0];
  if (!svc) throw new Error("starter service missing");
  const updated = await page.request.put(`${api}/services/${svc.id}`, {
    data: { ...svc, maxCoversPerSlot: 2 },
  });
  expect(updated.status(), await updated.text()).toBe(200);
  const policy = await page.request.put(`${api}/policy`, { data: { waitlistEnabled: true } });
  expect(policy.status(), await policy.text()).toBe(200);

  // fill every slot of the date
  const date = await nextOpenDate(page, owner.slug);
  const avail = (await (
    await page.request.get(
      `${baseURL}/api/public/v1/restaurants/${owner.slug}/availability?date=${date}&partySize=2`,
    )
  ).json()) as { slots: Array<{ serviceId: string; startsAt: string }> };
  for (const [i, slot] of avail.slots.entries()) {
    const res = await page.request.post(
      `${baseURL}/api/public/v1/restaurants/${owner.slug}/bookings`,
      {
        data: {
          serviceId: slot.serviceId,
          startsAt: slot.startsAt,
          partySize: 2,
          guest: {
            ...MARIO,
            email: `mario${i}@example.com`,
            phone: `+39 333 00000${String(i).padStart(2, "0")}`,
          },
        },
      },
    );
    expect(res.status(), await res.text()).toBe(201);
  }

  // --- the widget shows the day as full and offers the waitlist instead
  const guest = await page.context().newPage();
  await guest.goto(`${baseURL}/book/${owner.slug}?lang=en`);
  await expect(guest.getByRole("heading", { name: "Waitlist E2E" })).toBeVisible();
  // the calendar opens on the current month; the date is at most one month ahead
  const today = new Date().toISOString().slice(0, 10);
  const monthsAhead =
    (Number(date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
    Number(date.slice(5, 7)) -
    Number(today.slice(5, 7));
  for (let i = 0; i < monthsAhead; i += 1)
    await guest.getByRole("button", { name: "Next month" }).click();
  await guest
    .locator(".cal button.open", { hasText: new RegExp(`^${Number(date.slice(8, 10))}$`) })
    .click();
  await expect(guest.locator(".slot").first()).toBeVisible();
  await expect(guest.locator(".slot:not(:disabled)")).toHaveCount(0);
  await guest.getByRole("button", { name: "Join the waitlist" }).click();
  await guest.getByLabel("Preferred time (optional)").selectOption({ index: 1 });
  await guest.getByRole("textbox", { name: "Full name" }).fill(LUCIA.name);
  await guest.getByRole("textbox", { name: "Email" }).fill(LUCIA.email);
  await guest.getByRole("textbox", { name: "Phone" }).fill(LUCIA.phone);
  await guest.getByRole("button", { name: "Put me on the list" }).click();
  await expect(guest.getByRole("heading", { name: "You're on the waitlist" })).toBeVisible();
  const link = await guest.getByRole("link", { name: "View your request" }).getAttribute("href");
  expect(link).toContain(`/book/${owner.slug}/waitlist/`);
  const token = link?.split("/").pop() ?? "";

  // --- the dashboard lists the guest under the day's waitlist
  await page.goto(`/r/${owner.restaurantId}/today?date=${date}`);
  await expect(page.getByRole("heading", { name: "Waitlist" })).toBeVisible();
  await expect(page.getByRole("link", { name: LUCIA.name })).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();

  // --- Mario cancels: the freed table is offered to Lucia automatically
  const list = (await (await page.request.get(`${api}/bookings?date=${date}`)).json()) as {
    items: Array<{ id: string }>;
  };
  const cancel = await page.request.post(`${api}/bookings/${list.items[0]?.id}/actions`, {
    data: { action: "cancel" },
  });
  expect(cancel.status()).toBe(200);
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`${baseURL}/api/public/v1/waitlist/${token}`)).json()) as {
            status: string;
          }
        ).status,
      { timeout: 20_000 },
    )
    .toBe("offered");

  // --- Lucia confirms from her link
  await guest.goto(`${link}?lang=en`);
  await expect(guest.getByRole("heading", { name: "A table just freed up" })).toBeVisible();
  await guest.getByRole("button", { name: "Confirm the table" }).click();
  await expect(guest.getByText("Table confirmed!")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Show settled entries/ }).click();
  await expect(page.getByText("Booked", { exact: true })).toBeVisible();
  const bookings = (await (await page.request.get(`${api}/bookings?date=${date}`)).json()) as {
    items: Array<{ status: string; customer: { name: string }; source: string }>;
  };
  expect(bookings.items.find((b) => b.customer.name === LUCIA.name)).toMatchObject({
    status: "confirmed",
    source: "widget",
  });
});
