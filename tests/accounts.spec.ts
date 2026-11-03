import { test, expect } from "@playwright/test";
// These tests run with the explicit mock-provider build described in docs/ACCOUNTS.md.
// They exercise real Supabase client requests against deterministic HTTP doubles.
test.describe("configured account UI with mocked Supabase", () => {
  test.skip(
    !process.env.RECALL_MOCK_AUTH,
    "Requires the explicit mock-auth build; no live provider credentials are used.",
  );
  test("registers with email, signs in, updates profile and signs out", async ({
    page,
  }) => {
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "learner@example.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { display_name: "Learner" },
    };
    let signups = 0,
      signins = 0,
      profileUpdates = 0;
    await page.route("https://mock-recall.supabase.co/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/auth/v1/signup") {
        signups++;
        await route.fulfill({ json: { user, session: null } });
      } else if (url.pathname === "/auth/v1/token") {
        signins++;
        await route.fulfill({
          json: {
            access_token: "mock-access-token",
            refresh_token: "mock-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user,
          },
        });
      } else if (url.pathname === "/auth/v1/user") {
        if (route.request().method() === "PUT") profileUpdates++;
        await route.fulfill({ json: user });
      } else if (url.pathname === "/auth/v1/logout") {
        await route.fulfill({ status: 204 });
      } else await route.fulfill({ json: [] });
    });
    await page.goto("./");
    await expect(page.locator(".topbar")).toBeVisible();
    const menu = page.getByRole("button", { name: "Toggle navigation" });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("button", { name: "Account Profile", exact: true })
      .click();
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.getByLabel("Display name", { exact: true }).fill("Learner");
    await page.getByLabel("Email address", { exact: true }).fill(user.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Strong-test-password-123");
    await page
      .locator("form")
      .getByRole("button", { name: "Register", exact: true })
      .click();
    await expect.poll(() => signups).toBe(1);
    await expect(page.getByRole("status")).toContainText("verify");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByLabel("Password", { exact: true })
      .fill("Strong-test-password-123");
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect.poll(() => signins).toBe(1);
    await expect(
      page.getByRole("button", { name: "Open account workspace", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Update display name", { exact: true })
      .fill("Updated learner");
    await page
      .getByRole("button", { name: "Update profile", exact: true })
      .click();
    await expect.poll(() => profileUpdates).toBe(1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Make room for a little learning.",
        exact: true,
      }),
    ).toBeVisible();
  });
  test("requests password recovery and starts Google OAuth through the provider", async ({
    page,
  }) => {
    let recovery = false,
      oauth = false;
    await page.route(
      "https://mock-recall.supabase.co/auth/v1/recover*",
      async (route) => {
        recovery = true;
        await route.fulfill({ json: {} });
      },
    );
    await page.route(
      "https://mock-recall.supabase.co/auth/v1/authorize*",
      async (route) => {
        oauth =
          new URL(route.request().url()).searchParams.get("provider") ===
          "google";
        await route.fulfill({
          contentType: "text/html",
          body: "<h1>Mock Google authorization redirect</h1>",
        });
      },
    );
    await page.goto("./");
    await expect(page.locator(".topbar")).toBeVisible();
    const menu = page.getByRole("button", { name: "Toggle navigation" });
    if (await menu.isVisible()) await menu.click();
    await page
      .getByRole("button", { name: "Account Profile", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await page
      .getByLabel("Email address", { exact: true })
      .fill("learner@example.com");
    await page
      .locator("form")
      .getByRole("button", { name: "Reset password", exact: true })
      .click();
    await expect.poll(() => recovery).toBe(true);
    await expect(page.getByRole("status")).toContainText("reset link");
    await page
      .getByRole("button", { name: "Continue with Google", exact: true })
      .click();
    await expect.poll(() => oauth).toBe(true);
    await expect(
      page.getByRole("heading", {
        name: "Mock Google authorization redirect",
        exact: true,
      }),
    ).toBeVisible();
  });
});

test("mocked PKCE callback opens an isolated account and imports guest data explicitly", async ({
  page,
}) => {
  test.skip(
    !process.env.RECALL_MOCK_AUTH,
    "Requires the explicit mock-auth build.",
  );
  const user = {
    id: "22222222-2222-4222-8222-222222222222",
    aud: "authenticated",
    role: "authenticated",
    email: "google-user@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: "Google learner" },
  };
  let exchanged = false;
  let appRoot = "";
  await page.route("https://mock-recall.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/authorize") {
      await route.fulfill({
        status: 302,
        headers: { location: appRoot + "?code=mock-authorization-code" },
      });
    } else if (url.pathname === "/auth/v1/token") {
      const body = route.request().postDataJSON();
      exchanged =
        url.searchParams.get("grant_type") === "pkce" &&
        body.auth_code === "mock-authorization-code" &&
        typeof body.code_verifier === "string" &&
        body.code_verifier.length > 20;
      await route.fulfill({
        json: {
          access_token: "mock-oauth-access-token",
          refresh_token: "mock-oauth-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        },
      });
    } else if (url.pathname === "/auth/v1/user")
      await route.fulfill({ json: user });
    else await route.fulfill({ json: [] });
  });
  const navigate = async (name: string) => {
    await expect(page.locator(".topbar")).toBeVisible();
    const menu = page.getByRole("button", { name: "Toggle navigation" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  await page.goto("./");
  appRoot = new URL("./", page.url()).href;
  await page.getByRole("button", { name: "Create a set", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Guest source");
  await page.getByLabel("Term 1", { exact: true }).fill("Original");
  await page.getByLabel("Definition 1", { exact: true }).fill("Preserved");
  await page.getByRole("button", { name: "Save set", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Guest source", exact: true }),
  ).toBeVisible();
  await navigate("Account Profile");
  await page
    .getByRole("button", { name: "Continue with Google", exact: true })
    .click();
  await expect.poll(() => exchanged).toBe(true);
  await expect(
    page.getByRole("button", { name: "Open account workspace", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open account workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A fresh page for your next idea.",
      exact: true,
    }),
  ).toBeVisible();
  await navigate("Account Profile");
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Import guest material", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Guest library and history imported",
  );
  await navigate("My Study Sets");
  await expect(
    page.getByRole("heading", { name: "Guest source", exact: true }),
  ).toBeVisible();
  await navigate("Account Profile");
  await page
    .getByRole("button", { name: "Return to guest workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest source", exact: true }),
  ).toBeVisible();
});
