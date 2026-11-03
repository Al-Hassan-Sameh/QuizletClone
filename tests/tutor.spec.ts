import { test, expect, type Page } from "@playwright/test";

async function study(page: Page) {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.goto("./");
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Tutor vocabulary");
  await page.getByLabel("Term 1", { exact: true }).fill("Affluent district");
  await page.getByLabel("Definition 1", { exact: true }).fill("Wealthy area");
  await page.getByLabel("Term 2", { exact: true }).fill("Ancient temple");
  await page.getByLabel("Definition 2", { exact: true }).fill("Very old building");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await page.getByRole("button", { name: "Study Tutor vocabulary", exact: true }).click();
}
async function connect(page: Page) {
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
  await page.getByRole("button", { name: "Embedded AI — separate API billing", exact: true }).click();
  await page.getByText("Privacy & connection", { exact: true }).click();
  await page.getByLabel("Personal tutor access token").fill("test-only-personal-access-token-123");
  await page.getByRole("button", { name: "Connect securely" }).click();
  await expect(page.getByLabel("Ask about this card")).toBeVisible();
}
test("shares active context, preserves per-card history, discards delayed replies, and stays usable offline", async ({ page, context }) => {
  await study(page);
  const sent: { term: string; answer?: string; options: string[] }[] = [];
  let requests = 0;
  let delayedFinished = false;
  await page.route("**/api/tutor/session", route => route.fulfill({ json: { user: "student" } }));
  await page.route("**/api/tutor/cards", route => {
    sent.push(route.request().postDataJSON().context);
    return route.fulfill({ json: { cardRef: "card-ref" } });
  });
  await page.route("**/api/tutor/chat", async route => {
    requests++;
    if (requests === 2) await new Promise(resolve => setTimeout(resolve, 800));
    await route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ delta: requests === 1 ? "Saved first-card guidance." : "DELAYED SECOND CARD RESPONSE" }) + "\n" + JSON.stringify({ done: true }) + "\n" }).catch(() => {});
    if (requests === 2) delayedFinished = true;
  });
  await connect(page);
  await page.getByRole("button", { name: "Give me a hint", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Saved first-card guidance.");
  expect(sent[0].term).toBe("Affluent district"); expect(sent[0].answer).toBeUndefined();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator(".tutor-panel header")).toContainText("Ancient temple");
  await expect(page.getByRole("log")).not.toContainText("Saved first-card guidance.");
  await page.getByRole("button", { name: "Give me a hint", exact: true }).click();
  await expect.poll(() => sent.length).toBe(2);
  await page.getByRole("button", { name: "Previous card", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Saved first-card guidance.");
  await expect.poll(() => delayedFinished).toBe(true);
  await expect(page.getByRole("log")).not.toContainText("DELAYED SECOND CARD RESPONSE");
  await page.getByRole("button", { name: "Close tutor", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Study Tutor vocabulary", exact: true }).click();
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
  await page.getByRole("button", { name: "Embedded AI — separate API billing", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Saved first-card guidance.");
  await context.setOffline(true);
  await expect(page.getByText("You're offline.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Give me a hint", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close tutor", exact: true }).click();
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator(".card-face").first()).toContainText("Ancient temple");
});
test("protects active MCQs and disables the tutor until test submission", async ({ page }) => {
  await study(page);
  await page.getByRole("button", { name: "Learn", exact: true }).click();
  await page.getByLabel("Written answer", { exact: true }).uncheck();
  await page.getByLabel("True or false", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Start learn session" }).click();
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
  await page.getByRole("button", { name: "Embedded AI — separate API billing", exact: true }).click();
  await expect(page.getByText("Hints only until", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explain the wrong answers", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close tutor", exact: true }).click();
  await page.locator(".answer-options button").first().click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
  await page.getByRole("button", { name: "Embedded AI — separate API billing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Explain the wrong answers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Start test session" }).click();
  await expect(page.getByText("AI Tutor is disabled during tests.", { exact: false })).toBeVisible();
  await expect(page.locator(".tutor-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit test", exact: true }).click();
  await page.getByRole("button", { name: "Discuss this question with AI", exact: true }).first().click();
  await expect(page.locator(".tutor-panel")).toBeVisible();
});

test("mobile tutor uses a dismissible full-screen dialog without hiding study controls afterward", async ({ page }) => {
  await study(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Ask AI Tutor/ }).click();
  await page.getByRole("button", { name: "Embedded AI — separate API billing", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI study tutor" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByLabel("Ask about this card")).toBeFocused();
  await page.getByLabel("Ask about this card").fill("A draft question");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Next card", exact: true }).click();
  await expect(page.locator(".card-face").first()).toContainText("Ancient temple");
});
