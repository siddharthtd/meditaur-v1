import { expect, test } from "@playwright/test";

/**
 * The reading scale — the owner's round 14.
 *
 * `Small` is new at the bottom and the whole scale moved up one: `Medium` is the
 * 18px the app is designed against, `Large` 20 and `XL` 22. Buttons are
 * deliberately outside it — `Button` pins its own geometry in px — so a control
 * keeps its size while the text around it grows.
 */
test("offers four text sizes and grows only the text", async ({ page }) => {
  await page.goto("/settings");
  for (const size of ["Small", "Medium", "Large", "XL"]) {
    await expect(page.getByRole("button", { name: size, exact: true })).toBeVisible();
  }

  const rootSize = () =>
    page.locator("html").evaluate((node) => getComputedStyle(node).fontSize);

  // Medium is the default, and its 18px is what the app was designed against.
  await expect.poll(rootSize).toBe("18px");

  await page.getByRole("button", { name: "Small", exact: true }).click();
  await expect.poll(rootSize).toBe("16px");
  await page.getByRole("button", { name: "XL", exact: true }).click();
  await expect.poll(rootSize).toBe("22px");

  // It is a stored preference, not a paint for this tab: a reload has to find it
  // still chosen, which is also what the next half relies on.
  await page.reload();
  await expect(page.getByRole("button", { name: "XL", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a Button keeps its size whatever the text size is", async ({ page }) => {
  // The other half of the owner's ask — "reflect the size in all the texts, not
  // the text on the button". The root attribute the Settings tiles write is moved
  // here directly (`applyTextSize`'s one line, and the first test above proves the
  // tiles reach it), so this measures the button's own geometry instead of six
  // navigations to a dev server that is compiling routes for other workers.
  await page.goto("/library");
  const control = page.getByRole("button", { name: "Add", exact: true });
  const before = (await control.boundingBox())!;
  const beforeFont = await control.evaluate((node) => getComputedStyle(node).fontSize);
  const rootSize = () =>
    page.locator("html").evaluate((node) => getComputedStyle(node).fontSize);
  // The compact button's own design height, in px.
  expect(before.height, "the compact button's design height").toBe(40);
  await expect.poll(rootSize).toBe("18px");

  for (const [size, expected] of [
    ["sm", "16px"],
    ["lg", "20px"],
    ["xl", "22px"],
  ] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.textSize = value;
    }, size);
    // The root really moved, so the next measurement is not the same page twice.
    await expect.poll(rootSize).toBe(expected);
    const after = (await control.boundingBox())!;
    const afterFont = await control.evaluate((node) => getComputedStyle(node).fontSize);
    expect(after.height, `height at ${size}`).toBe(before.height);
    expect(afterFont, `label size at ${size}`).toBe(beforeFont);
  }
});
