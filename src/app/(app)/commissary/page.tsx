import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Commissary" };

export default async function Page() {
  await requirePagePermission("production:create", "transfers:create", "transfers:receive");
  return (
    <ComingSoon title="Commissary" phase={5}>
      Production batches, one-minute mobile dispatch, receiving, and the commissary statement.
    </ComingSoon>
  );
}
