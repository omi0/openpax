import { expect, test } from "@playwright/test";
import { onboardOwner } from "./helpers";

test("owner invites a colleague who signs up from the link and lands on Today", async ({
  page,
  browser,
}) => {
  const owner = await onboardOwner(page, "Osteria Team");
  const invitee = `giulia-${Date.now()}@example.com`;

  await page.goto(`/r/${owner.restaurantId}/settings/team`);
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Role").selectOption("staff");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent")).toBeVisible();
  const link = (await page.locator("p.font-mono").first().textContent())?.trim() ?? "";
  expect(link).toMatch(/\/invitations\/[0-9a-f-]{36}$/);

  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "You have been invited" })).toBeVisible();
  await guest.getByRole("link", { name: "Create account" }).click();
  await expect(guest.getByLabel("Email")).toHaveValue(invitee);
  await guest.getByLabel("Your name").fill("Giulia Staff");
  await guest.getByLabel("Password").fill("password-1234");
  await guest.getByRole("button", { name: "Create account" }).click();
  await guest.getByRole("button", { name: "Accept invitation" }).click();
  await guest.waitForURL(/\/today/);
  await expect(guest.getByText("Osteria Team").first()).toBeVisible();
  // staff see no API keys tab
  await guest.goto(`/r/${owner.restaurantId}/settings`);
  await expect(guest.getByRole("link", { name: "Team", exact: true })).toBeVisible();
  await expect(guest.getByRole("link", { name: "API keys" })).toHaveCount(0);
  await context.close();

  await page.reload();
  await expect(page.locator("li", { hasText: "Giulia Staff" })).toBeVisible();
  await expect(page.getByText("No pending invitations.")).toBeVisible();
});
