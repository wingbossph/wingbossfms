import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { expenseCategories } from "@/domains/expenses/queries";
import { formatPeso } from "@/lib/money";
import { SuppliersEditor } from "./suppliers-editor";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requirePagePermission("suppliers:manage");
  const [suppliers, categories, spend] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    expenseCategories(),
    db.expense.groupBy({ by: ["supplierId"], where: { status: "POSTED" }, _sum: { totalCents: true, paidCents: true } }),
  ]);
  const bySupplier = new Map(spend.map((s) => [s.supplierId, s._sum]));
  return (
    <>
      <PageHeader title="Suppliers" description="Who you buy from, their payment terms, and the usual category for their bills." />
      <SuppliersEditor
        categories={categories}
        suppliers={suppliers.map((s) => {
          const sum = bySupplier.get(s.id);
          return {
            id: s.id,
            name: s.name,
            tin: s.tin ?? "",
            contactName: s.contactName ?? "",
            phone: s.phone ?? "",
            email: s.email ?? "",
            termsDays: s.termsDays,
            defaultAccountId: s.defaultAccountId ?? "",
            isActive: s.isActive,
            spend: formatPeso(sum?.totalCents ?? 0n),
          };
        })}
      />
    </>
  );
}
