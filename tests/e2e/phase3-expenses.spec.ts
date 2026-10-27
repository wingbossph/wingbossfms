import { expect, test, type Page } from "@playwright/test";

// Phase 3: a cashier records a petty-cash expense with a receipt photo; the
// owner approves it; the audit log shows who did what.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test.describe.configure({ mode: "serial" });
let expenseUrl = "";

test("Lanang cashier submits a petty-cash expense with a receipt photo", async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PASSWORD);
  await page.goto("/admin/devices");
  await page.fill("#dname", "Lanang tablet (e2e expenses)");
  await page.selectOption("#dloc", { label: "Wingboss Lanang" });
  await page.getByRole("button", { name: /register this device/i }).click();
  await expect(page.getByText(/This device is registered/)).toBeVisible();
  await page.locator("header button").last().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/pin");
  await page.getByRole("button", { name: "Lito Lanang" }).click();
  for (const d of "4001") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/expenses/new");
  await page.selectOption("#efrom", { label: "Petty cash" });
  await page.fill("#esup", "Gaisano Mall");
  await page.fill("#eor", "OR-88812");
  await page.getByLabel("Category").selectOption({ label: "Kitchen tools and smallwares" });
  await page.getByLabel("Amount", { exact: true }).fill("6,250.00");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/receipt.png");
  await expect(page.getByRole("img", { name: "receipt.png" })).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page).toHaveURL(/\/expenses\/\w+/);
  await expect(page.getByText("Awaiting approval")).toBeVisible();
  expenseUrl = page.url();
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});

test("owner approves it from the approvals queue", async ({ page }) => {
  await login(page, OWNER_EMAIL, OWNER_PASSWORD);
  await page.goto("/expenses/approvals");
  await page.locator("tbody a").first().click();
  await page.getByRole("button", { name: "Approve & post" }).click();
  await expect(page.getByText("Approved and posted.")).toBeVisible();
  await expect(page.getByText("Posted", { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/api/files/"]')).toHaveCount(1);

  await page.goto(`/admin/audit?entityId=${expenseUrl.split("/").pop()}`);
  await expect(page.locator("tbody")).toContainText("APPROVE");
  await expect(page.locator("tbody")).toContainText("Lito Lanang");
});
