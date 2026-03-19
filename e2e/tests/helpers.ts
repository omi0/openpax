import { expect, type Page } from "@playwright/test";

export interface Owner {
  email: string;
  restaurantId: string;
  slug: string;
}

/** Sign up a fresh owner, create the restaurant with the starter dinner service and close the setup guide. */
export async function onboardOwner(page: Page, name: string): Promise<Owner> {
  const email = `owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Anna Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password-1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Set up your restaurant" })).toBeVisible();
  await page.getByLabel("Restaurant name").fill(name);
  await page.getByLabel("How many guests can you seat at once?").fill("40");
  await page.getByLabel("Email for notifications").fill("staff@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  // the setup guide takes over with the hours step; the starter dinner service is prefilled
  await expect(page.getByRole("heading", { name: "When can guests book?" })).toBeVisible();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Rooms and seats" })).toBeVisible();
  const me = await (await page.request.get("/api/v1/me")).json();
  const restaurantId = me.restaurants[0].id as string;
  // the specs start from a finished guide, so Today shows no setup reminder
  const finished = await page.request.patch(`/api/v1/restaurants/${restaurantId}/setup`, {
    data: { completed: true },
  });
  expect(finished.status(), await finished.text()).toBe(200);
  return { email, restaurantId, slug: me.restaurants[0].slug };
}

/** First future date with an open service, as YYYY-MM-DD. */
export async function nextOpenDate(page: Page, slug: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 2; i += 1) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + i);
    const month = d.toISOString().slice(0, 7);
    const res = await page.request.get(
      `/api/public/v1/restaurants/${slug}/availability/month?month=${month}`,
    );
    const { openDates } = (await res.json()) as { openDates: string[] };
    const hit = openDates.find((x) => x > today);
    if (hit) return hit;
  }
  throw new Error("no open date found");
}

export interface Guest {
  name: string;
  email: string;
  phone: string;
}

/** Book the first available slot on `date` for each guest through the public API. */
export async function bookGuests(page: Page, slug: string, date: string, guests: Guest[]) {
  const avail = await (
    await page.request.get(
      `/api/public/v1/restaurants/${slug}/availability?date=${date}&partySize=2`,
    )
  ).json();
  const slot = avail.slots.find((s: { available: boolean }) => s.available);
  const codes: string[] = [];
  for (const guest of guests) {
    const res = await page.request.post(`/api/public/v1/restaurants/${slug}/bookings`, {
      data: { serviceId: slot.serviceId, startsAt: slot.startsAt, partySize: 2, guest },
    });
    expect(res.status(), await res.text()).toBe(201);
    codes.push((await res.json()).confirmationCode);
  }
  return { slot, codes };
}

export const MARIO: Guest = {
  name: "Mario Rossi",
  email: "mario@example.com",
  phone: "+39 333 1234567",
};
export const LUCIA: Guest = {
  name: "Lucia Bianchi",
  email: "lucia@example.com",
  phone: "+39 340 7654321",
};
