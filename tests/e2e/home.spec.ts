import { expect, test } from "@playwright/test";

test("home and planner render without select elements", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meditaur" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible();
  await page.getByRole("link", { name: "Open planner" }).click();
  await expect(page.getByRole("textbox", { name: "Plan name" })).toHaveValue("Circuit session");
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: /Focus: Third-Eye Chakra/ }).first().click();
  await expect(page.getByRole("heading", { name: "Focus point" })).toBeVisible();
  await page.getByRole("button", { name: /Heart Chakra/ }).click();
  await expect(page.getByRole("button", { name: /Focus: Heart Chakra/ }).first()).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
});
