import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KINDS, autoMap, readRows, type ImportKind } from "@/domains/migration/kinds";
import { runImport } from "@/domains/migration/service";
import { db, fixtures, trialBalanceDifference } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const actor = () => ({ id: f.owner.id, can: () => true });

beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

function rowsFor(kind: ImportKind, table: string[][]) {
  const def = KINDS.find((k) => k.kind === kind)!;
  return readRows(def, table, autoMap(def, table[0]), { dateOrder: "MDY" });
}

describe("import wizard", () => {
  it("maps columns by name, reports bad rows, and a dry run writes nothing", async () => {
    const table = [
      ["Item name", "SKU", "Category", "UOM", "Count", "Locations"],
      ["Ranch dip (import)", "IMP-RANCH", "Sauce", "L", "weekly", "MAT, LAN"],
      ["Mystery", "IMP-X", "Sauce", "pc", "hourly", ""],
      ["Nowhere", "IMP-Y", "Sauce", "pc", "daily", "XYZ"],
    ];
    const { rows, errors } = rowsFor("ITEMS", table);
    expect(errors).toEqual([]);
    const res = await runImport(db, "ITEMS", rows, actor(), { dryRun: true });
    expect(res.errors.map((e) => e.row).sort()).toEqual([3, 4]);
    expect(await db.item.count({ where: { sku: "IMP-RANCH" } })).toBe(0);

    const ok = rows.filter((r) => r.rowNo === 2);
    expect((await runImport(db, "ITEMS", ok, actor(), { dryRun: true })).errors).toEqual([]);
    expect(await db.item.count({ where: { sku: "IMP-RANCH" } })).toBe(0);
    const done = await runImport(db, "ITEMS", ok, actor(), { dryRun: false });
    expect(done.created).toBe(1);
    const item = await db.item.findUniqueOrThrow({ where: { sku: "IMP-RANCH" }, include: { locationSettings: true } });
    expect(item.locationSettings.map((s) => s.locationId).sort()).toEqual([f.matina.id, f.lanang.id].sort());
  });

  it("flags missing required columns and unreadable values", () => {
    const def = KINDS.find((k) => k.kind === "OPENING_STOCK")!;
    expect(readRows(def, [["Item", "Qty"]], { item: "Item", qty: "Qty", date: "", location: "", unitCost: "" }).errors[0].message).toMatch(/Date/);
    const { errors } = rowsFor("OPENING_STOCK", [["Date", "Location", "Item", "Quantity", "Cost"], ["13/45/2026", "MAT", "PRO-WING", "ten", "185"]]);
    expect(errors.map((e) => e.message).join(" ")).toMatch(/not a date.*not a quantity|not a quantity.*not a date/);
  });

  it("imports opening stock, opening balances, accounts, employees, sales and expenses", async () => {
    const steps: [ImportKind, string[][]][] = [
      ["OPENING_STOCK", [["Date", "Location", "Item", "Quantity", "Cost"], ["01/02/2025", "Matina", "IMP-RANCH", "4", "₱120.50"]]],
      ["ACCOUNTS", [["Account code", "Account name", "Group"], ["6299", "Generator fuel (import)", "UTILITIES"]]],
      ["OPENING_BALANCES", [["As of", "Location", "Account", "Balance"], ["01/02/2025", "HO", "BPI Bank", "50,000.00"], ["01/02/2025", "MAT", "GCash 1", "1,250.00"]]],
      ["EMPLOYEES", [["Employee code", "First name", "Last name", "Position", "Branch", "Rate type", "Rate", "Date hired", "MWE"], ["IMP-001", "Liza", "Import", "Cook", "LAN", "daily", "610", "03/01/2024", "yes"]]],
      ["SALES_HISTORY", [["Date", "Branch", "Pax", "Gross sales", "Discounts", "Payment", "Paid"], ["01/03/2025", "MAT", "40", "20,000", "400", "Cash", "15,000"], ["01/03/2025", "MAT", "", "", "", "GCash 1", "4,600"]]],
      ["EXPENSES_HISTORY", [["Date", "Branch", "Category", "Amount", "Description", "Supplier"], ["01/03/2025", "MAT", "6299", "1,500", "Diesel", "Petron (import)"]]],
    ];
    for (const [kind, table] of steps) {
      const { rows, errors } = rowsFor(kind, table);
      expect(errors, kind).toEqual([]);
      const res = await runImport(db, kind, rows, actor(), { dryRun: false });
      expect(res.errors, kind).toEqual([]);
    }
    const report = await db.salesReport.findFirstOrThrow({ where: { locationId: f.matina.id, businessDate: new Date("2025-01-03T00:00:00Z") } });
    expect(report.status).toBe("POSTED");
    expect(report.netCents).toBe(1_960_000n);
    expect(report.paymentsCents).toBe(1_960_000n);
    expect(Number(report.pax)).toBe(40);
    expect(await db.employee.count({ where: { code: "IMP-001" } })).toBe(1);
    expect(await db.expense.count({ where: { notes: "Imported from the old expense sheet", status: "POSTED" } })).toBe(1);
    // Importing the same day again is refused.
    const again = await runImport(db, "SALES_HISTORY", rowsFor("SALES_HISTORY", [["Date", "Branch", "Gross sales"], ["01/03/2025", "MAT", "100"]]).rows, actor(), { dryRun: true });
    expect(again.errors[0].message).toMatch(/already has sales/);
    expect(await trialBalanceDifference()).toBe(0n);
  });
});
