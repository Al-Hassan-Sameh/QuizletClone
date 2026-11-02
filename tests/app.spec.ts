import { test, expect, type Page } from "@playwright/test";
async function navigate(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Toggle navigation" }).isVisible())
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Biology essentials");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A small set of big ideas");
  await page.getByLabel("Term 1", { exact: true }).fill("Cell");
  await page.getByLabel("Definition 1", { exact: true }).fill("Unit of life");
  await page.getByLabel("Term 2", { exact: true }).fill("DNA");
  await page
    .getByLabel("Definition 2", { exact: true })
    .fill("Genetic material");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Biology essentials", exact: true }),
  ).toBeVisible();
}
test("set management, persistence and flashcard controls", async ({ page }) => {
  await create(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Biology essentials", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Biology essentials" })
    .click();
  await page.getByRole("button", { name: "Edit set", exact: true }).click();
  await page.getByLabel("Term 1", { exact: true }).fill("Living cell");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await page
    .getByRole("button", { name: "Study Biology essentials", exact: true })
    .click();
  await expect(page.locator(".card-face").first()).toContainText("Living cell");
  await page.getByRole("button", { name: "Flip flashcard" }).click();
  await expect(page.locator(".flashcard")).toHaveClass(/flipped/);
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator(".card-face").first()).toContainText("DNA");
  await page
    .getByRole("button", { name: "Previous card", exact: true })
    .click();
  await page.getByRole("button", { name: "I know this", exact: true }).click();
  await page
    .getByRole("button", { name: "Still learning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByText("You reviewed 2 cards. Your progress is saved."),
  ).toBeVisible();
  await navigate(page, "Statistics");
  await expect(
    page.getByRole("cell", { name: "1 / 2", exact: true }),
  ).toBeVisible();
  await navigate(page, "My Study Sets");
  await page
    .getByRole("button", { name: "Actions for Biology essentials" })
    .click();
  await page.getByRole("button", { name: "Delete set", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A fresh page for your next idea." }),
  ).toBeVisible();
});
test("learn and test sessions grade and persist", async ({ page }) => {
  await create(page);
  await page
    .getByRole("button", { name: "Study Biology essentials", exact: true })
    .click();
  await page.getByRole("button", { name: "Learn", exact: true }).click();
  await page.getByLabel("Multiple choice", { exact: true }).uncheck();
  await page.getByLabel("True or false", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start learn session" }).click();
  for (let i = 0; i < 2; i++) {
    const term = await page.locator(".question-panel h2").innerText();
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill(term === "Cell" ? "unit OF life" : "Genetic material");
    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    await expect(
      page.getByText("That’s right!", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: i === 1 ? "See results" : "Next question",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByText("2 of 2 correct.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Start test session" }).click();
  for (const panel of await page.locator(".question-panel").all()) {
    const term = await panel.locator("h2").innerText();
    await panel
      .getByRole("textbox")
      .fill(term === "Cell" ? "wrong" : "Genetic material");
  }
  await page.getByRole("button", { name: "Submit test", exact: true }).click();
  await expect(
    page.getByText("1 of 2 correct.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry 1 missed" }),
  ).toBeVisible();
  await page.reload();
  await navigate(page, "Statistics");
  await expect(
    page.getByRole("cell", { name: "Learn", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Test", exact: true }),
  ).toBeVisible();
});
test("backup export and restore round trip", async ({ page }) => {
  await create(page);
  await navigate(page, "Settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export complete backup" }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  await page.locator("input[type=file]").first().setInputFiles(path!);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Backup restored");
  await navigate(page, "My Study Sets");
  await expect(
    page.getByRole("heading", { name: "Biology essentials", exact: true }),
  ).toBeVisible();
});
test("production app reloads offline with IndexedDB data", async ({
  page,
  context,
}) => {
  await create(page);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
    expectRegistration(registration);
    function expectRegistration(r: ServiceWorkerRegistration) {
      if (!r.active) throw new Error("No active service worker");
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for a little learning." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Biology essentials", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Offline · saved locally")).toBeAttached();
  await page
    .getByRole("button", { name: "Study Biology essentials", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Flip flashcard" }),
  ).toBeVisible();
  await context.setOffline(false);
});
test("mobile layout and theme remain usable", async ({ page }) => {
  await create(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("difficult Learn cards repeat automatically before results", async ({
  page,
}) => {
  await create(page);
  await page
    .getByRole("button", { name: "Study Biology essentials", exact: true })
    .click();
  await page.getByRole("button", { name: "Learn", exact: true }).click();
  await page.getByLabel("Multiple choice", { exact: true }).uncheck();
  await page.getByLabel("True or false", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start learn session" }).click();
  for (let i = 0; i < 3; i++) {
    const term = await page.locator(".question-panel h2").innerText();
    await page
      .getByRole("textbox", { name: "Your answer" })
      .fill(
        i === 0
          ? "incorrect"
          : term === "Cell"
            ? "Unit of life"
            : "Genetic material",
      );
    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    if (i === 0)
      await expect(
        page.getByText("QUESTION 1 OF 3", { exact: true }),
      ).toBeVisible();
    await page
      .getByRole("button", {
        name: i === 2 ? "See results" : "Next question",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByText("2 of 3 correct.", { exact: false }),
  ).toBeVisible();
  await navigate(page, "Statistics");
  await expect(
    page.getByRole("heading", { name: "Card review history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Known", exact: true }),
  ).toHaveCount(2);
});
test("due review queue keeps remaining cards stable after rating", async ({
  page,
}) => {
  await create(page);
  await page
    .getByRole("button", { name: "Study Biology essentials", exact: true })
    .click();
  await page.getByLabel("Filter cards", { exact: true }).selectOption("due");
  await page.getByRole("button", { name: "I know this", exact: true }).click();
  await expect(page.locator(".card-face").first()).toContainText("DNA");
  await page.getByRole("button", { name: "I know this", exact: true }).click();
  await expect(page.getByText("2 reviewed this session")).toBeVisible();
  await page
    .getByRole("button", { name: "Finish session", exact: true })
    .click();
  await expect(
    page.getByText("You reviewed 2 cards. Your progress is saved."),
  ).toBeVisible();
});

test("key screens meet automated WCAG AA rules in both themes", async ({
  page,
}) => {
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await create(page);
  for (const theme of ["light", "dark"]) {
    if (theme === "dark")
      await page.getByRole("button", { name: "Toggle theme" }).click();
    for (const section of [
      "Dashboard",
      "Create Set",
      "Statistics",
      "Settings",
    ]) {
      await navigate(page, section);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(
        result.violations,
        `${theme} ${section}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
    }
    await navigate(page, "My Study Sets");
    await page
      .getByRole("button", { name: "Study Biology essentials", exact: true })
      .click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations, `${theme} flashcards`).toEqual([]);
  }
});
