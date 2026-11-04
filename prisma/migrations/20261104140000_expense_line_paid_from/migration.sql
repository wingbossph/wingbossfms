-- "Paid from" per expense line; existing paid-now expenses keep their single source.
ALTER TABLE "ExpenseLine" ADD COLUMN "paidFromMoneyAccountId" TEXT;
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_paidFromMoneyAccountId_fkey" FOREIGN KEY ("paidFromMoneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "ExpenseLine" l SET "paidFromMoneyAccountId" = e."paidFromMoneyAccountId"
FROM "Expense" e WHERE l."expenseId" = e."id" AND e."terms" = 'PAID_NOW' AND e."paidFromMoneyAccountId" IS NOT NULL;
