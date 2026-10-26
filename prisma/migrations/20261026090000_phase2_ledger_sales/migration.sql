-- DropForeignKey
ALTER TABLE "DailySummary" DROP CONSTRAINT "DailySummary_locationId_fkey";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paidFromMoneyAccountId" TEXT;

-- AlterTable
ALTER TABLE "LoyverseReceipt" ADD COLUMN     "payments" JSONB;

-- AlterTable
ALTER TABLE "MoneyTransfer" ADD COLUMN     "locationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidFromMoneyAccountId" TEXT,
ADD COLUMN     "paymentJournalEntryId" TEXT;

-- AlterTable
ALTER TABLE "SalesReport" ADD COLUMN     "refundCents" BIGINT NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "DailySummary";

-- CreateTable
CREATE TABLE "IntercoSettlement" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "payerLocationId" TEXT NOT NULL,
    "payeeLocationId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "moneyAccountId" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntercoSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntercoSettlement_journalEntryId_key" ON "IntercoSettlement"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_paymentJournalEntryId_key" ON "PayrollRun"("paymentJournalEntryId");


-- =============================================================================
-- Ledger integrity (hand-written; not expressible in the Prisma schema)
-- =============================================================================

-- One side per line, positive amounts.
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amounts_check"
  CHECK ("debitCents" >= 0 AND "creditCents" >= 0
         AND ("debitCents" = 0 OR "creditCents" = 0)
         AND ("debitCents" + "creditCents") > 0);

-- Every journal entry must balance. Checked at COMMIT so lines can be inserted one by one.
CREATE FUNCTION wb_journal_entry_balanced() RETURNS trigger AS $$
DECLARE
  eid TEXT;
  diff NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN eid := OLD."entryId"; ELSE eid := NEW."entryId"; END IF;
  SELECT COALESCE(SUM("debitCents" - "creditCents"), 0) INTO diff
    FROM "JournalLine" WHERE "entryId" = eid;
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced (difference % centavos)', eid, diff;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "JournalLine_balanced"
  AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION wb_journal_entry_balanced();

-- Posted lines are immutable (only reconciliation fields may change), and
-- nothing may be posted, changed or removed in a CLOSED period.
CREATE FUNCTION wb_journal_line_guard() RETURNS trigger AS $$
DECLARE
  d DATE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."accountId" IS DISTINCT FROM OLD."accountId"
       OR NEW."locationId" IS DISTINCT FROM OLD."locationId"
       OR NEW."debitCents" IS DISTINCT FROM OLD."debitCents"
       OR NEW."creditCents" IS DISTINCT FROM OLD."creditCents"
       OR NEW."date" IS DISTINCT FROM OLD."date"
       OR NEW."entryId" IS DISTINCT FROM OLD."entryId" THEN
      RAISE EXCEPTION 'Posted journal lines cannot be changed; post a reversing entry instead';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN d := OLD."date"; ELSE d := NEW."date"; END IF;
  IF EXISTS (SELECT 1 FROM "AccountingPeriod"
             WHERE "status" = 'CLOSED' AND d BETWEEN "startsOn" AND "endsOn") THEN
    RAISE EXCEPTION 'The accounting period containing % is closed', d;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalLine_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION wb_journal_line_guard();

-- At most one POSTED entry per source document event (idempotent posting).
CREATE UNIQUE INDEX "JournalEntry_one_posted_per_source"
  ON "JournalEntry" ("source", "sourceId")
  WHERE "status" = 'POSTED' AND "sourceId" IS NOT NULL AND "source" NOT IN ('MANUAL', 'REVERSAL', 'BANK_LINE', 'DEPRECIATION');
