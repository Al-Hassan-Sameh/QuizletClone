import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await expect(page.locator(".topbar")).toBeVisible();
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function createQuestion(page: Page) {
  await nav(page, "Question banks");
  await page
    .getByRole("button", { name: "Create question", exact: true })
    .click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("The wealthy district is an ____ area.");
  for (const [i, choice] of [
    "affluent",
    "ancient",
    "accessible",
    "abundant",
  ].entries())
    await page.getByLabel(`Choice ${i + 1}`, { exact: true }).fill(choice);
  await page
    .getByLabel("Explanation", { exact: true })
    .fill("Affluent means wealthy.");
  await page.getByLabel("Hint", { exact: true }).fill("Starts with A");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Question saved" }),
  ).toBeVisible();
}
test("authors, edits and duplicates MCQs, grades numeric shortcuts and persists mistake review offline", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await createQuestion(page);
  await page
    .getByRole("button", { name: "Edit question", exact: true })
    .click();
  await page.getByLabel("Category", { exact: true }).fill("Adjectives");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicate question", exact: true })
    .click();
  await expect(page.locator(".bank-list article")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .first()
    .click();
  await nav(page, "Practice");
  await page
    .getByLabel("Question source", { exact: true })
    .selectOption("banks");
  await page.getByLabel("Question count", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  const choices = page.locator(".mcq-options button");
  await expect(choices).toHaveCount(4);
  const labels = await choices.allTextContents();
  const wrong = labels.findIndex((s) => s.includes("ancient"));
  await page.keyboard.press(String(wrong + 1));
  await expect(page.locator(".mcq-feedback")).toContainText(
    "Correct answer: affluent",
  );
  await expect(page.locator(".mcq-options .correct")).toContainText("affluent");
  await expect(page.locator(".mcq-options .incorrect")).toContainText(
    "ancient",
  );
  await expect(page.locator(".mcq-feedback")).toContainText(
    "Affluent means wealthy.",
  );
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page.reload();
  await context.setOffline(true);
  await nav(page, "Practice");
  await expect(
    page.getByRole("button", { name: "Review attempt", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review attempt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry incorrect answers", exact: true })
    .click();
  await expect(page.locator(".mcq-stage")).toBeVisible();
  const correct = (
    await page.locator(".mcq-options button").allTextContents()
  ).findIndex((s) => s.includes("affluent"));
  await page.keyboard.press(String(correct + 1));
  await expect(page.locator(".mcq-feedback")).toContainText("Correct!");
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(page.locator(".result-score")).toContainText("100");
});
test("saves an exam draft, resumes after reload, flags questions and submits at the deadline", async ({
  page,
}) => {
  await page.goto("./");
  await createQuestion(page);
  await nav(page, "Exams");
  await page
    .getByLabel("Question source", { exact: true })
    .selectOption("banks");
  await page.getByLabel("Time limit in minutes", { exact: false }).fill("1");
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await page
    .getByRole("button", { name: "Flag for review", exact: true })
    .click();
  await page.locator(".mcq-options button").first().click();
  await expect(page.locator(".mcq-feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "Save & exit", exact: true }).click();
  await page.reload();
  await nav(page, "Exams");
  await page
    .getByRole("button", { name: "Resume session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unflag question", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".mcq-options button[aria-pressed=true]"),
  ).toHaveCount(1);
  await page.clock.install();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "Session complete", exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Exams");
  await expect(
    page.getByRole("button", { name: "Review attempt", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Resume session", exact: true }),
  ).toHaveCount(0);
});
test("planner, notes, bookmarks and complete backups survive restore", async ({
  page,
}) => {
  await page.goto("./");
  await createQuestion(page);
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await nav(page, "Study Planner");
  await page
    .getByLabel("Task title", { exact: true })
    .fill("Prepare vocabulary exam");
  await page.getByLabel("Task type", { exact: true }).selectOption("exam");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Prepare vocabulary exam", { exact: true }).check();
  await expect(
    page.getByText("1 of 1 tasks completed.", { exact: true }),
  ).toBeVisible();
  await nav(page, "Bookmarks");
  await expect(
    page.getByText("The wealthy district is an ____ area.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Note title", { exact: true })
    .fill("Vocabulary connections");
  await page
    .getByLabel("Note content", { exact: true })
    .fill("Affluent means wealthy.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.reload();
  await nav(page, "Bookmarks");
  await expect(
    page.getByRole("heading", { name: "Vocabulary connections", exact: true }),
  ).toBeVisible();
  await nav(page, "Settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete backup", exact: true })
    .click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  await page
    .getByLabel("Restore complete backup", { exact: false })
    .setInputFiles(path!);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Backup restored", { exact: true }),
  ).toBeVisible();
  await nav(page, "Question banks");
  await expect(page.locator(".bank-list article")).toHaveCount(1);
  await nav(page, "Study Planner");
  await expect(
    page.getByLabel("Prepare vocabulary exam", { exact: true }),
  ).toBeChecked();
});
test("validates duplicate answer choices without losing authored question data", async ({
  page,
}) => {
  await page.goto("./");
  await createQuestion(page);
  await page
    .getByRole("button", { name: "Edit question", exact: true })
    .click();
  await page.getByLabel("Choice 2", { exact: true }).fill(" AFFLUENT ");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unique choices");
  await expect(page.getByLabel("Question", { exact: true })).toHaveValue(
    "The wealthy district is an ____ area.",
  );
  await page.getByLabel("Choice 2", { exact: true }).fill("ancient");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(page.locator(".bank-list article")).toHaveCount(1);
});

test("reverse flashcards, bookmarks and matching work with persisted study sets", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Vocabulary pairs");
  await page.getByLabel("Term 1", { exact: true }).fill("Affluent");
  await page.getByLabel("Definition 1", { exact: true }).fill("Wealthy");
  await page.getByLabel("Term 2", { exact: true }).fill("Ancient");
  await page.getByLabel("Definition 2", { exact: true }).fill("Old");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await page
    .getByRole("button", { name: "Study Vocabulary pairs", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reverse cards", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Flashcard term", exact: true }),
  ).toContainText("Wealthy");
  await page
    .getByRole("button", { name: "Bookmark card", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Card bookmarked");
  await nav(page, "Bookmarks");
  await expect(page.getByText("Affluent", { exact: true })).toBeVisible();
  await nav(page, "Matching");
  await page
    .getByRole("button", { name: "Start matching", exact: true })
    .click();
  await page.getByRole("button", { name: "Affluent", exact: true }).click();
  await page.getByRole("button", { name: "Wealthy", exact: true }).click();
  await page.getByRole("button", { name: "Ancient", exact: true }).click();
  await page.getByRole("button", { name: "Old", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "All connected.", exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Statistics");
  await expect(
    page.getByRole("cell", { name: "Matching", exact: true }),
  ).toBeVisible();
});

test("new question and practice screens meet WCAG AA in both themes", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto("./");
  await createQuestion(page);
  for (const dark of [false, true]) {
    if (dark)
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
    await nav(page, "Question banks");
    await page
      .getByRole("button", { name: "Edit question", exact: true })
      .click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await nav(page, "Practice");
    await page
      .getByLabel("Question source", { exact: true })
      .selectOption("banks");
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (!dark)
      await page.screenshot({
        path: `/tmp/recall-practice-${info.project.name}.png`,
        fullPage: true,
      });
    await page.locator(".mcq-options button").first().click();
    await page
      .getByRole("button", { name: "Finish practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New session", exact: true })
      .click();
  }
});
