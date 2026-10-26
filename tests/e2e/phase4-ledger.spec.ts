import { expect, test, type Page } from "@playwright/test";

// Phase 4: financial statements render, export to Excel/PDF/CSV, and a
// manual journal entry must balance before it can be posted.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("P&L by location with consolidated column, and exports", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/reports/pnl");
  await expect(page.getByRole("heading", { name: "Profit & loss" })).toBeVisible();
  await expect(page.locator("thead").first()).toContainText("Consolidated");
  await expect(page.getByText("Net profit", { exact: true })).toBeVisible();
  await expect(page.getByText("Food cost %")).toBeVisible();

  for (const [fmt, type] of [
    ["xlsx", "spreadsheetml"],
    ["pdf", "application/pdf"],
    ["csv", "text/csv"],
  ] as const) {
    const res = await page.request.get(`/api/export/report/pnl?format=${fmt}`);
    expect(res.status(), fmt).toBe(200);
    expect(res.headers()["content-type"]).toContain(type);
    expect((await res.body()).length).toBeGreaterThan(200);
  }
});

test("balance sheet balances and trial balance totals match", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/reports/balance-sheet");
  await expect(page.getByText(/Assets = liabilities \+ equity in every column ✓/)).toBeVisible();
  await page.goto("/reports/trial-balance");
  await expect(page.getByText("Debits equal credits ✓")).toBeVisible();
  await page.goto("/reports/cash-flow");
  await expect(page.getByText("Ties to the change in cash ✓")).toBeVisible();
});

test("manual journal entry can't be posted until it balances", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/ledger/new");
  await page.fill("#jmemo", "Accrue electricity");
  await page.getByLabel("Line 1 account").selectOption({ label: "6210 Electricity" });
  await page.getByLabel("Line 1 debit").fill("1500");
  await page.getByLabel("Line 2 account").selectOption({ label: "2010 Accounts payable" });
  await page.getByLabel("Line 2 credit").fill("1400");
  await expect(page.getByRole("button", { name: "Post entry" })).toBeDisabled();
  await page.getByLabel("Line 2 credit").fill("1500");
  await page.getByRole("button", { name: "Post entry" }).click();
  await expect(page).toHaveURL(/\/ledger\/entries\//);
  await expect(page.getByText("Accrue electricity")).toBeVisible();
});
