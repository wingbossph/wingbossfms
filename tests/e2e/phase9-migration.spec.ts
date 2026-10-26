import { expect, test, type Page } from "@playwright/test";

// Phase 9: the import wizard (map, dry run, import) and "export everything".

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? "owner@wingboss.ph";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";

async function ownerLogin(page: Page) {
  await page.goto("/login");
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
}

test("import employees from a sheet: problems first, then a clean dry run and import", async ({ page }) => {
  await ownerLogin(page);
  await page.goto("/admin/import");
  await page.getByRole("button", { name: /^Employees/ }).click();
  const tag = Date.now() % 100000;
  const bad = `First name,Last name,Position,Branch,Rate type,Rate,Date hired\nAna,Sheet${tag},Server,Nowhere,daily,590,03/01/2024\n`;
  await page.setInputFiles("#imp-file", { name: "staff.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await expect(page.getByText(/No location "Nowhere"/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Import 1 row/ })).toBeDisabled();

  const good = bad.replace("Nowhere", "MAT");
  await page.setInputFiles("#imp-file", { name: "staff.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await expect(page.getByText("no problems")).toBeVisible();
  await expect(page.getByRole("cell", { name: `Sheet${tag}` })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Import 1 row/ }).click();
  await expect(page.getByText("imported", { exact: true })).toBeVisible();
  await page.goto("/payroll/employees");
  await expect(page.getByRole("link", { name: `Sheet${tag}, Ana` })).toBeVisible();

  const tpl = await page.request.get("/api/import/template/SALES_HISTORY");
  expect(tpl.status()).toBe(200);
  expect(await tpl.text()).toContain("Gross sales");
});

test("owner downloads everything as a ZIP", async ({ page }) => {
  await ownerLogin(page);
  const res = await page.request.get("/api/export/everything");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/zip");
  const body = await res.body();
  expect(body.subarray(0, 2).toString()).toBe("PK");
});
