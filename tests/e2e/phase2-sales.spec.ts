import { expect, test, type Page } from "@playwright/test";

// Phase 2: owner sets prices; Lanang cashier enters today's sales with a
// payment split, submits, closes the shift; owner imports a Loyverse file.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test.describe.configure({ mode: "serial" });

test("owner sets real prices", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/admin/menu");
  await page.getByLabel("Unlimited Wings price", { exact: true }).fill("499.00");
  await page.getByLabel("Bottomless iced tea price").fill("99.00");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved.")).toBeVisible();
});

test("Lanang cashier enters sales, submits, and closes the shift", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await ownerLogin(page);
  await page.goto("/admin/devices");
  await page.fill("#dname", "Lanang counter (e2e sales)");
  await page.selectOption("#dloc", { label: "Wingboss Lanang" });
  await page.getByRole("button", { name: /register this device/i }).click();
  await expect(page.getByText(/This device is registered/)).toBeVisible();
  await page.locator("header button").last().click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/pin");
  await page.getByRole("button", { name: "Joy Lanang" }).click();
  for (const d of "4002") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/sales");
  await page.getByRole("button", { name: "Enter today's sales" }).click();
  await expect(page).toHaveURL(/\/sales\/\w+/);

  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "One more Unlimited Wings", exact: true }).click();
  await page.getByLabel("Bottomless iced tea quantity", { exact: true }).fill("2");
  // 3 × 499 + 2 × 99 = 1,695.00
  await page.getByLabel("Cash amount", { exact: true }).fill("1000");
  const gcash = page.locator("div", { has: page.getByLabel("GCash 1 amount") }).last();
  await gcash.getByRole("button", { name: "+ rest" }).click();
  await expect(page.getByLabel("GCash 1 amount")).toHaveValue("695.00");
  await expect(page.getByText("Payments match ✓")).toBeVisible();

  await page.getByRole("button", { name: "Submit sales" }).click();
  await expect(page.getByText("Sales submitted.")).toBeVisible();
  await expect(page.getByText("Close shift · cash count")).toBeVisible();

  // Float ₱2,000 + cash sales ₱1,000 = ₱3,000.
  await page.getByLabel("Number of ₱1000 bills").fill("3");
  await expect(page.getByText("Balanced ✓")).toBeVisible();
  await page.getByRole("button", { name: "Close shift" }).click();
  await expect(page.getByText("Shift closed", { exact: true })).toBeVisible();

  // Cashiers can't open owner settings.
  await page.goto("/admin/menu");
  await expect(page).toHaveURL("/forbidden");
});

test("owner imports a Loyverse export after matching names", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/sales/import");
  await page.selectOption("#il", { label: "Wingboss Matina" });
  await page.setInputFiles("#if", "tests/fixtures/loyverse-receipts-by-item.csv");
  await expect(page.getByText("Match Loyverse names")).toBeVisible();
  await page.getByLabel("Menu item for UW Barkada – Set of 4").selectOption({ label: "Unlimited Wings (1 pax)" });
  await page.getByLabel("Pax per unit override for UW Barkada – Set of 4").fill("4");
  await page.getByRole("button", { name: "Save matches" }).click();
  await expect(page.getByText("Mappings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Imported 4 new receipts/)).toBeVisible();
  await page.getByRole("link", { name: /Open sales report/ }).first().click();
  await expect(page.getByText("From Loyverse")).toBeVisible();
});
