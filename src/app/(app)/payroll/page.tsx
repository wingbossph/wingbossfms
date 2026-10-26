import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Payroll" };

export default async function Page() {
  await requirePagePermission("employees:view", "payroll:attendance", "payroll:run");
  return (
    <ComingSoon title="Payroll" phase={7}>
      Employees, DTR attendance grid, semi-monthly payroll, contributions and payslips.
    </ComingSoon>
  );
}
