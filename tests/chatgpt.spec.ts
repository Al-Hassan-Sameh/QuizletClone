import { test, expect, type Page } from "@playwright/test";

async function openStudy(page: Page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("./");
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("ChatGPT study");
  await page.getByLabel("Term 1", { exact: true }).fill("Affluent");
  await page.getByLabel("Definition 1", { exact: true }).fill("Wealthy area");
  await page.getByLabel("Term 2", { exact: true }).fill("Ancient");
  await page.getByLabel("Definition 2", { exact: true }).fill("Very old");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await page.getByRole("button", { name: "Study ChatGPT study", exact: true }).click();
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
}
test("defaults to a no-backend handoff with protected context and a content-free ChatGPT link", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/tutor")) apiCalls.push(request.url()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedPrompt: string }).copiedPrompt = text; } } });
  });
  await openStudy(page);
  await expect(page.getByRole("heading", { name: "Use ChatGPT with your existing plan" })).toBeVisible();
  const preview = page.getByLabel("Study prompt preview");
  await expect(preview).not.toHaveValue(/Wealthy area/);
  await page.getByLabel("Your question for ChatGPT").fill("Help me with this term.");
  await page.getByRole("button", { name: "1. Copy study prompt" }).click();
  await expect(page.getByRole("status")).toContainText("Copied.");
  expect(await page.evaluate(() => (window as unknown as { copiedPrompt: string }).copiedPrompt)).toContain("Help me with this term.");
  const link = page.getByRole("link", { name: /Open ChatGPT/ });
  await expect(link).toHaveAttribute("href", "https://chatgpt.com/");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await page.getByRole("button", { name: "Flip flashcard", exact: true }).click();
  await expect(preview).toHaveValue(/Wealthy area/);
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(preview).toHaveValue(/Ancient/);
  await expect(preview).not.toHaveValue(/Wealthy area/);
  expect(apiCalls).toEqual([]);
});
test("provides a selectable manual copy fallback when clipboard permission fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Permission denied"); } } });
  });
  await openStudy(page);
  await page.getByRole("button", { name: "1. Copy study prompt" }).click();
  await expect(page.getByRole("status")).toContainText("copy the preview");
  const preview = page.getByLabel("Study prompt preview");
  await expect(preview).toBeFocused();
  expect(await preview.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart)).toBeGreaterThan(0);
});
