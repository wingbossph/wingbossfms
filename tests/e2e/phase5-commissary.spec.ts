import { expect, test, type Page } from "@playwright/test";

// Phase 5: the commissary dispatches sauce, the branch confirms what arrived
// (with a shortage and its reason), and the statement shows the branch owing.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("dispatch from commissary, receive short at the branch", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/commissary");
  await page.getByLabel("From", { exact: true }).selectOption({ label: "Wingboss Commissary" });
  await page.getByLabel("To", { exact: true }).selectOption({ label: "Wingboss Matina" });
  const item = page.locator("span.font-semibold", { hasText: /sauce$/ }).first();
  const name = (await item.textContent())!.trim();
  await page.getByLabel(`More ${name}`).click();
  await page.getByLabel(`More ${name}`).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Dispatch to Wingboss Matina" }).click();
  await expect(page.getByText("0 item(s)")).toBeVisible();

  await page.goto("/commissary/transfers");
  const row = page.getByRole("row").filter({ hasText: `${name} 2 L` }).filter({ hasText: "In transit" }).first();
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Confirm what arrived" })).toBeVisible();
  await page.getByLabel(`${name} received`).fill("1.5");
  await page.getByLabel(`Reason for ${name} difference`).fill("Tub cracked in transit");
  await page.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("received (short)", { exact: false }).or(page.getByText("received with discrepancy"))).toBeVisible();
  await expect(page.getByText("Tub cracked in transit")).toBeVisible();

  await page.goto("/commissary/statement");
  await expect(page.getByRole("heading", { level: 1, name: "Commissary statement" })).toBeVisible();
  await expect(page.getByText("From Wingboss Commissary")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record a settlement" })).toBeVisible();
});

test("inventory pages render for the owner", async ({ page }) => {
  await ownerLogin(page);
  for (const [path, heading] of [
    ["/inventory", "Inventory"],
    ["/inventory/count", "Stock count"],
    ["/inventory/variance", "Variance"],
    ["/commissary/production", "Production"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first(), path).toContainText(heading);
  }
});
