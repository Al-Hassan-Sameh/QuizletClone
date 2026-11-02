import { test, expect, type Locator, type Page } from "@playwright/test";

const title = "Long quantum explanations";
const paragraph = String.raw`Start with a system state \(\rho\) and an ancilla \(|0\rangle\), apply a joint unitary \(U\), then project the ancilla onto orthonormal outcomes \(|m\rangle\). The induced operator is \(M_m=(I\otimes\langle m|)U(I\otimes|0\rangle)\), so the probability is \(\mathrm{Tr}(\rho E_m)\), where \(E_m=M_m^\dagger M_m\). Unitarity ensures positivity and completeness. The effects specify probabilities, while the instrument also determines the post-measurement state.`;
const definition = [
  "OPENING: the complete explanation begins here.",
  ...Array.from({ length: 12 }, (_, index) => `${index + 1}. ${paragraph}`),
  "FINAL: the complete explanation ends here.",
].join("\n\n");

async function openLongSet(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByLabel("Term 1", { exact: true })
    .fill("How does an ancilla induce a quantum measurement?");
  await page.getByLabel("Definition 1", { exact: true }).fill(definition);
  await page
    .getByLabel("Notes 1", { exact: true })
    .fill("Notes remain reachable after the final paragraph.");
  await page.getByLabel("Term 2", { exact: true }).fill("A follow-up question");
  await page
    .getByLabel("Definition 2", { exact: true })
    .fill("A short follow-up answer.");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await page
    .getByRole("button", { name: `Study ${title}`, exact: true })
    .click();
}

async function flipToDefinition(page: Page) {
  await page
    .getByRole("button", { name: "Flip flashcard", exact: true })
    .click();
  const face = page.getByRole("region", {
    name: "Flashcard definition",
    exact: true,
  });
  await expect(face).toBeVisible();
  await expect(face).toHaveAttribute("tabindex", "0");
  return face;
}

async function expectOpeningInsideScrollport(face: Locator) {
  await expect
    .poll(() => face.evaluate((element) => element.scrollTop))
    .toBe(0);
  const bounds = await face.evaluate((element) => {
    const faceBounds = element.getBoundingClientRect();
    const answerBounds = element
      .querySelector("strong")!
      .getBoundingClientRect();
    return {
      top: faceBounds.top,
      bottom: faceBounds.bottom,
      answerTop: answerBounds.top,
    };
  });
  expect(bounds.answerTop).toBeGreaterThanOrEqual(bounds.top);
  expect(bounds.answerTop).toBeLessThan(bounds.bottom);
}

async function expectEndingReachable(face: Locator) {
  await face.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const bounds = await face.evaluate((element) => {
    const faceBounds = element.getBoundingClientRect();
    const footerBounds = element
      .querySelector(":scope > span:last-child")!
      .getBoundingClientRect();
    return {
      top: faceBounds.top,
      bottom: faceBounds.bottom,
      footerTop: footerBounds.top,
      footerBottom: footerBounds.bottom,
    };
  });
  expect(bounds.footerTop).toBeGreaterThanOrEqual(bounds.top - 1);
  expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.bottom + 1);
}

test("long math answers show their beginning and allow keyboard scrolling to the end", async ({
  page,
}) => {
  await openLongSet(page);
  const face = await flipToDefinition(page);
  await expect(face.locator(".katex").first()).toBeVisible();
  await expectOpeningInsideScrollport(face);
  expect(
    await face.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await face.focus();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => face.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expectEndingReachable(face);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("flipping and navigating reset long answer scrolling to the beginning", async ({
  page,
}) => {
  await openLongSet(page);
  let face = await flipToDefinition(page);
  await expectEndingReachable(face);
  await page
    .getByRole("button", { name: "Flip flashcard", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Flashcard term", exact: true }),
  ).toHaveAttribute("tabindex", "0");
  face = await flipToDefinition(page);
  await expectOpeningInsideScrollport(face);
  await expectEndingReachable(face);
  await face.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("region", { name: "Flashcard term", exact: true }),
  ).toContainText("A follow-up question");
  await expect(
    page.getByRole("region", { name: "Flashcard term", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("region", { name: "Flashcard term", exact: true }),
  ).toBeFocused();
  face = await flipToDefinition(page);
  await expectOpeningInsideScrollport(face);
});

test("full screen gives long cards more room and has a working exit control", async ({
  page,
}, testInfo) => {
  await openLongSet(page);
  const normalHeight = await page
    .locator(".flashcard")
    .evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(page.locator(".study-area")).toHaveClass(/expanded/);
  if (testInfo.project.name === "chromium") {
    expect(
      await page.evaluate(() =>
        document.fullscreenElement?.classList.contains("study-area"),
      ),
    ).toBe(true);
  }
  const fullHeight = await page
    .locator(".flashcard")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(fullHeight).toBeGreaterThan(normalHeight);
  const face = await flipToDefinition(page);
  await expectOpeningInsideScrollport(face);
  await expectEndingReachable(face);
  await expect(
    page.getByRole("button", { name: "Next card", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "I know this", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await expect(page.locator(".study-area")).not.toHaveClass(/expanded/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test("full-window fallback keeps the card usable and Escape restores normal layout", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      get: () => false,
    });
  });
  await openLongSet(page);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(page.locator(".study-area")).toHaveClass(/focus-mode/);
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  const face = await flipToDefinition(page);
  await expectOpeningInsideScrollport(face);
  await expectEndingReachable(face);
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "I know this", exact: true }).focus();
  await page.keyboard.press("Tab");
  if (await page.locator(".study-tabs").isVisible()) {
    await expect(
      page.getByRole("button", { name: "Flashcards", exact: true }),
    ).toBeFocused();
  } else {
    await expect(
      page.getByLabel("Filter cards", { exact: true }),
    ).toBeFocused();
  }
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "I know this", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".study-area")).not.toHaveClass(
    /expanded|focus-mode/,
  );
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});
