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

test("offers eight colour schemes, and repaints the app when one is chosen", async ({ page }) => {
  // The owner's round 24 (`P2 · 46`): eight pre-offered schemes rather than a colour
  // picker, so the app stops being one dark room for every reader. What this proves is
  // both halves of the promise — the eight are offered, and choosing one paints the
  // document — plus the one that only a reload can prove: the choice is *stored*, and
  // the very first paint of the next load is already the chosen scheme rather than a
  // flash of the default (`theme.ts`'s mirror, the boot script in the layout).
  await page.goto("/settings");
  const schemes = page.getByRole("group", { name: "Colour scheme" });
  for (const name of [
    "Warm Earth",
    "Midnight Indigo",
    "Forest",
    "Slate & Copper",
    "Plum Noir",
    "Paper",
    "Sea Glass",
    "Sakura",
  ]) {
    await expect(schemes.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  const root = page.locator("html");
  const pageBackground = () =>
    page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  // The app's own scheme, which is what a reader who has never chosen one gets.
  await expect(root).toHaveAttribute("data-theme", "warm");
  await expect.poll(pageBackground).toBe("rgb(23, 18, 13)");

  await schemes.getByRole("button", { name: /^Midnight Indigo/ }).click();
  await expect(root).toHaveAttribute("data-theme", "midnight");
  await expect.poll(pageBackground).toBe("rgb(14, 16, 32)");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "midnight");
  await expect.poll(pageBackground).toBe("rgb(14, 16, 32)");
  await expect(
    schemes.getByRole("button", { name: /^Midnight Indigo/ }),
  ).toHaveAttribute("aria-pressed", "true");
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
