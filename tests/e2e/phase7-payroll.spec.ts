import { expect, test, type Page } from "@playwright/test";

// Phase 7: add an employee, encode and approve the DTR, compute and approve
// payroll, and download the payslip.

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("employee → DTR → payroll run → payslip", async ({ page }) => {
  await ownerLogin(page);
  const last = `Dela Cruz ${Date.now() % 100000}`;
  await page.goto("/payroll/employees?new=1");
  await page.fill("#emp-firstName", "Juan");
  await page.fill("#emp-lastName", last);
  await page.fill("#emp-position", "Server");
  await page.fill("#emp-startDate", "2026-01-05");
  await page.selectOption("#emp-home", { label: "Wingboss Matina" });
  await page.fill("#emp-rate", "600");
  await page.getByRole("button", { name: "Add employee" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Juan ${last}` })).toBeVisible();

  // DTR for the previous cut-off at Matina.
  await page.goto("/payroll/attendance");
  await page.getByRole("button", { name: "Previous cut-off" }).click();
  await expect(page.getByRole("button", { name: "Previous cut-off" })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: `${last}, Juan` });
  await row.getByRole("button", { name: "Fill blanks with P" }).click();
  await row.getByRole("textbox").nth(2).fill("P LT15 OT2");
  await row.getByRole("textbox").nth(3).fill("R");
  await page.getByRole("button", { name: "Save DTR" }).click();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve DTR" }).click();
  await expect(page.getByRole("button", { name: "Reopen for edits" })).toBeVisible();

  await page.goto("/payroll");
  await page.getByRole("button", { name: "Compute payroll" }).click();
  await expect(page).toHaveURL(/\/payroll\/runs\//);
  const slip = page.getByRole("row").filter({ hasText: `${last}, Juan` });
  await expect(slip).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve & post" }).click();
  await expect(page.getByText("Approved · unpaid")).toBeVisible();

  const href = await slip.getByRole("link").first().getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");

  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByText("Approved · paid")).toBeVisible();

  const reg = await page.request.get(`/api/export/report/payroll-register?format=xlsx&run=${page.url().split("/").pop()}`);
  expect(reg.status()).toBe(200);
});
