-- "BPI Bank" (payouts, deposits) and the "BPI Checking" expense source are the
-- same bank account. Keep the original with its history, renamed to BPI Checking,
-- and retire the duplicate, but only while the duplicate has no activity.
DO $$
DECLARE
  old_id text;
  old_gl text;
  dup_id text;
  dup_gl text;
BEGIN
  SELECT "id", "glAccountId" INTO old_id, old_gl FROM "MoneyAccount" WHERE "name" = 'BPI Bank' AND "locationId" IS NULL LIMIT 1;
  SELECT "id", "glAccountId" INTO dup_id, dup_gl FROM "MoneyAccount" WHERE "name" = 'BPI Checking' AND "locationId" IS NULL LIMIT 1;
  IF old_id IS NULL OR dup_id IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM "JournalLine" WHERE "accountId" = dup_gl)
     OR EXISTS (SELECT 1 FROM "Expense" WHERE "paidFromMoneyAccountId" = dup_id) THEN
    RAISE NOTICE 'BPI Checking already has activity: not merged';
    RETURN;
  END IF;
  UPDATE "MoneyAccount" SET "name" = 'BPI Checking (duplicate, retired)', "isActive" = false WHERE "id" = dup_id;
  UPDATE "Account" SET "name" = 'BPI Checking (duplicate, retired)', "isActive" = false WHERE "id" = dup_gl;
  UPDATE "MoneyAccount" SET "name" = 'BPI Checking' WHERE "id" = old_id;
  UPDATE "Account" SET "name" = 'BPI Checking' WHERE "id" = old_gl;
END $$;
