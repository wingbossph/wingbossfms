import { SectionTabs } from "@/components/shell/section-tabs";
import { requirePagePermission } from "@/server/auth/session";

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePermission("employees:view", "payroll:attendance", "payroll:run", "reports:payroll:view");
  const can = (p: string) => user.access.canAnywhere(p);
  const tabs = [
    ...(can("payroll:run") || can("reports:payroll:view") ? [{ href: "/payroll", label: "Payroll runs" }] : []),
    ...(can("payroll:attendance") || can("payroll:run") ? [{ href: "/payroll/attendance", label: "DTR" }] : []),
    ...(can("employees:view") ? [{ href: "/payroll/employees", label: "Employees" }] : []),
    ...(can("payroll:run") ? [{ href: "/payroll/loans", label: "Loans & advances" }] : []),
    ...(can("payroll:approve") || can("reports:payroll:view") ? [{ href: "/payroll/remittances", label: "Remittances" }] : []),
    ...(can("payroll:run") ? [{ href: "/payroll/setup", label: "Holidays & tables" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <SectionTabs tabs={tabs} />}
      {children}
    </>
  );
}
