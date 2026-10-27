import { expect, test, type Page } from "@playwright/test";

// Phase 1: login, one-form branch creation, audit before/after, device
// registration, PIN login, and branch-scoped cashier access.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
const run = Date.now().toString(36).slice(-4).toUpperCase();

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

async function pressPin(page: Page, pin: string) {
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Enter" }).click();
}

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers/);
});

test("owner adds a new branch in one form and it appears everywhere", async ({ page }) => {
  await ownerLogin(page);
  const name = `Wingboss Test ${run}`;
  await page.goto("/admin/locations/new");
  await page.fill("#name", name);
  await page.fill("#code", `T${run}`.slice(0, 6));
  await page.fill("#address", "Davao City");
  await page.getByRole("button", { name: "Add location" }).click();
  await expect(page).toHaveURL("/admin/locations");
  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.locator("header select")).toContainText(name);

  await page.getByRole("link", { name }).click();
  await expect(page.getByText(`Cash drawer – ${name}`)).toBeVisible();
});

test("audit log shows who changed a user and the before/after values", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/admin/users");
  await page.getByRole("link", { name: /^Mika/ }).click();
  const newName = `Mika ${run}`;
  await page.fill("#name", newName);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("User saved.")).toBeVisible();

  await page.goto("/admin/audit?category=User&action=UPDATE");
  const first = page.locator("tbody tr").first();
  await expect(first).toContainText("Owner");
  await expect(first).toContainText(`→ ${newName}`);
});

test("Lanang cashier logs in with a PIN and only sees Lanang", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/admin/devices");
  await page.fill("#dname", `Lanang tablet ${run}`);
  await page.selectOption("#dloc", { label: "Wingboss Lanang" });
  await page.getByRole("button", { name: /register this device/i }).click();
  await expect(page.getByText(/This device is registered/)).toBeVisible();

  await page.locator("header button").last().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/pin");
  await expect(page.getByText("Wingboss Lanang")).toBeVisible();
  // Matina staff aren't offered on a Lanang device.
  await expect(page.getByRole("button", { name: "Carlo Matina" })).toHaveCount(0);

  await page.getByRole("button", { name: "Lito Lanang" }).click();
  await pressPin(page, "9999");
  await expect(page.getByText("Incorrect login details.")).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Delete digit" }).click();
  await pressPin(page, "4001");
  await expect(page).toHaveURL("/");

  await expect(page.locator("header")).toContainText("Wingboss Lanang");
  await expect(page.locator("header select")).toHaveCount(0);
  const nav = page.locator("aside nav");
  await expect(nav).not.toContainText("Dashboard");
  await expect(nav).not.toContainText("Reports");
  await expect(nav).not.toContainText("Payroll");

  for (const path of ["/admin/users", "/dashboard", "/reports", "/payroll", "/admin/audit"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/forbidden");
  }
  const exportRes = await page.request.get("/api/export/audit");
  expect(exportRes.status()).toBe(403);
});
