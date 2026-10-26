import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting, type SettingKey } from "@/domains/admin/settings";
import { SettingsForm, type SettingField } from "./settings-form";

export const metadata = { title: "Business settings" };

const FIELDS: (Omit<SettingField, "value"> & { key: SettingKey })[] = [
  { key: "expenses.ownerApprovalThresholdCents", section: "Approvals & alerts", label: "Expenses above this need the Owner (₱)", kind: "pesoCents" },
  { key: "alerts.cashShortThresholdCents", section: "Approvals & alerts", label: "Flag cash over/short from (₱)", kind: "pesoCents" },
  { key: "alerts.personalGcashShareBp", section: "Approvals & alerts", label: "Alert when personal GCash exceeds (% of money in)", kind: "percentBp" },
  { key: "inventory.varianceToleranceBp", section: "Inventory & transfers", label: "Usage variance tolerance (%)", kind: "percentBp" },
  { key: "transfer.shortageChargedTo", section: "Inventory & transfers", label: "Transfer shortages are a loss for", kind: "select", options: [{ value: "SENDER", label: "The sender (commissary)" }, { value: "RECEIVER", label: "The receiving branch" }] },
  { key: "transfer.markupEnabled", section: "Inventory & transfers", label: "Charge a markup on transfers", kind: "bool" },
  { key: "transfer.markupBp", section: "Inventory & transfers", label: "Transfer markup (%)", kind: "percentBp" },
  { key: "allocation.enabled", section: "Inventory & transfers", label: "Allocate commissary and head office costs to branches", kind: "bool" },
  { key: "reports.dailySalesEmail", section: "Email reports", label: "Email a daily sales summary each morning", kind: "bool" },
  { key: "reports.monthlyPnlEmail", section: "Email reports", label: "Email last month's P&L on the 1st", kind: "bool" },
  { key: "reports.emailRecipients", section: "Email reports", label: "Also send to (comma-separated emails; the Owner always gets them)", kind: "text" },
  { key: "payroll.shiftStart", section: "Payroll", label: "Regular shift starts", kind: "time" },
  { key: "payroll.shiftEnd", section: "Payroll", label: "Regular shift ends", kind: "time" },
  { key: "payroll.graceMinutes", section: "Payroll", label: "Grace period before late (minutes)", kind: "int" },
  { key: "payroll.otMinimumMinutes", section: "Payroll", label: "Minimum overtime counted (minutes)", kind: "int" },
  { key: "payroll.firstPayDay", section: "Payroll", label: "Pay day for the 1–15 cut-off (day of month)", kind: "int" },
  { key: "payroll.secondPayDay", section: "Payroll", label: "Pay day for the 16–end cut-off (day of next month)", kind: "int" },
  { key: "bank.matchWindowDays", section: "Banking", label: "Auto-match: days apart allowed", kind: "int" },
  { key: "bank.settlementToleranceBp", section: "Banking", label: "Card/Grab payout tolerance (% of gross)", kind: "percentBp" },
];

export default async function SettingsPage() {
  await requirePagePermission("settings:manage");
  const fields = await Promise.all(FIELDS.map(async (f) => ({ ...f, value: (await getSetting(db, f.key)) as string | number | boolean })));
  return (
    <>
      <PageHeader title="Business settings" description="Rules that apply to every location. Branch-specific options (Loyverse store, shifts, service charge) are under Payments & branch settings." />
      <SettingsForm fields={fields} />
      <section className="mt-10 max-w-3xl rounded-lg border p-4">
        <h2 className="text-2xl">Backup</h2>
        <p className="mb-3 text-sm text-muted-foreground">Supabase keeps daily database backups. You can also download everything yourself: one CSV per table in a ZIP file.</p>
        <a href="/api/export/everything" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Export everything
        </a>
      </section>
    </>
  );
}
