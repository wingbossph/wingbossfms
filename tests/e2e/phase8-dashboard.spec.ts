import { expect, test, type Page } from "@playwright/test";

// Phase 8: the Owner dashboard, the new reports with exports, budget and settings.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("dashboard shows KPIs, money in by channel and alerts, and filters by location", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  for (const label of ["Net sales", "Pax", "Average spend per pax", "Total expenses", "Food cost", "Labor cost", "Cash on hand + banks"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Money in by channel/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Money in by channel" })).toContainText("Personal GCash");
  await page.getByLabel("Location", { exact: true }).selectOption({ label: "Wingboss Matina" });
  await expect(page).toHaveURL(/location=/);
  await page.getByRole("button", { name: "This week" }).click();
  await expect(page).toHaveURL(/preset=week/);
});

test("sales, expense and planning reports render and export", async ({ page }) => {
  await ownerLogin(page);
  for (const name of ["daily-sales", "sales-by-package", "sales-by-channel", "sales-by-cashier", "sales-by-time", "discounts-log", "expenses-by-category", "expenses-by-supplier", "ap-aging", "cash-position", "budget-vs-actual", "break-even"]) {
    await page.goto(`/reports/${name}`);
    await expect(page.locator("table").first(), name).toBeVisible();
    const res = await page.request.get(`/api/export/report/${name}?format=pdf`);
    expect(res.status(), name).toBe(200);
  }
});

test("owner sets a budget and changes a business setting", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/reports/budget");
  await page.getByLabel("Only accounts with a budget").uncheck();
  await page.getByLabel(/Electricity Jan/).fill("12000");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByText("Budget saved.")).toBeVisible();

  await page.goto("/admin/settings");
  const row = page.locator("form").filter({ has: page.getByLabel(/Also send to/) });
  await row.getByLabel(/Also send to/).fill("accountant@example.com");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Setting saved.")).toBeVisible();
});
