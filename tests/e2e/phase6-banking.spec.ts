import { expect, test, type Page } from "@playwright/test";

// Phase 6: import a BPI statement, book a bank charge straight from the
// statement line, and see it on the reconciliation.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("import a BPI statement and book a bank charge from it", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/banking");
  await page.getByRole("link", { name: "BPI Bank" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "BPI Bank" })).toBeVisible();
  await page.getByRole("link", { name: "Import statement" }).last().click();

  // Unique amounts so re-running the suite never hits the duplicate check.
  const cents = 1000 + Math.floor(Math.random() * 8999);
  const charge = (cents / 100).toFixed(2);
  const d = new Date(Date.now() + 8 * 3600_000 - 86_400_000);
  const date = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const csv = ["Transaction Date,Description,Reference Number,Debit,Credit,Running Balance", `${date},SERVICE CHARGE ${cents},,${charge},,`, `${date},INTEREST CREDIT ${cents},,,1.${String(cents).slice(-2)},`].join("\n");
  await page.setInputFiles("#ifile", { name: "bpi.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("2 transactions")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 lines" }).click();
  await expect(page).toHaveURL(/\/banking\/[^/]+$/);

  const row = page.getByRole("listitem").filter({ hasText: `SERVICE CHARGE ${cents}` });
  await row.getByRole("button", { name: "Book it" }).click();
  await expect(row.getByLabel("Account to book against")).toHaveValue(/.+/);
  await row.getByRole("button", { name: "Book & match" }).click();
  await expect(page.getByText(`SERVICE CHARGE ${cents}`)).toHaveCount(0);

  await page.getByRole("link", { name: "Matched" }).click();
  await expect(page.getByText(`SERVICE CHARGE ${cents}`).first()).toBeVisible();
  await expect(page.getByText("Booked from statement").first()).toBeVisible();

  await page.getByRole("link", { name: "Reconcile" }).click();
  await expect(page.getByRole("heading", { name: "Bank reconciliation" })).toBeVisible();
  await expect(page.getByText(`INTEREST CREDIT ${cents}`)).toBeVisible();
});

test("payouts page and banking reports render", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/banking/payouts");
  await expect(page.getByRole("heading", { level: 1, name: "Card & Grab payouts" })).toBeVisible();
  const res = await page.request.get("/api/export/report/channel-settlements?format=xlsx");
  expect(res.status()).toBe(200);
});
