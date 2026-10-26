-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('BRANCH', 'COMMISSARY', 'OFFICE');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('NON_VAT', 'VAT');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'APPROVE', 'REJECT', 'VOID', 'POST', 'CLOSE_PERIOD', 'REOPEN_PERIOD', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "StatementSection" AS ENUM ('REVENUE', 'CONTRA_REVENUE', 'COGS', 'LABOR', 'OPERATING_EXPENSE', 'OTHER_INCOME_EXPENSE', 'INCOME_TAX', 'CURRENT_ASSET', 'NONCURRENT_ASSET', 'CURRENT_LIABILITY', 'NONCURRENT_LIABILITY', 'EQUITY');

-- CreateEnum
CREATE TYPE "KpiTag" AS ENUM ('NONE', 'FOOD_COST', 'LABOR', 'OCCUPANCY', 'DEPRECIATION', 'INTEREST', 'INCOME_TAX');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('OPENING_BALANCE', 'SALES_REPORT', 'CASH_COUNT', 'CHANNEL_SETTLEMENT', 'MONEY_TRANSFER', 'EXPENSE', 'EXPENSE_PAYMENT', 'STOCK_RECEIPT', 'STOCK_COUNT', 'STOCK_ADJUSTMENT', 'PRODUCTION', 'TRANSFER_DISPATCH', 'TRANSFER_RECEIVE', 'INTERCO_SETTLEMENT', 'PAYROLL', 'DEPRECIATION', 'ALLOCATION', 'OWNER_EQUITY', 'BANK_LINE', 'MANUAL', 'REVERSAL');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "EquityTxnType" AS ENUM ('CAPITAL_CONTRIBUTION', 'DRAWING');

-- CreateEnum
CREATE TYPE "MoneyAccountKind" AS ENUM ('CASH_DRAWER', 'UNDEPOSITED_CASH', 'PETTY_CASH', 'BANK', 'EWALLET', 'CARD_CLEARING', 'PLATFORM_RECEIVABLE', 'OWNER_PERSONAL');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('CASH', 'CARD', 'QR', 'EWALLET', 'BANK_TRANSFER', 'DELIVERY_PLATFORM', 'OTHER');

-- CreateEnum
CREATE TYPE "MoneyTransferType" AS ENUM ('TRANSFER', 'CASH_DEPOSIT', 'PETTY_REPLENISH', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PACKAGE', 'ALA_CARTE', 'ADDON', 'BEVERAGE', 'TAKEOUT', 'OTHER');

-- CreateEnum
CREATE TYPE "SalesSource" AS ENUM ('MANUAL', 'LOYVERSE_CSV', 'LOYVERSE_API', 'MIXED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('EXPECTED', 'PARTIAL', 'SETTLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "LoyverseExportKind" AS ENUM ('RECEIPTS', 'RECEIPTS_BY_ITEM', 'SALES_SUMMARY', 'SALES_BY_ITEM', 'SALES_BY_PAYMENT_TYPE', 'API');

-- CreateEnum
CREATE TYPE "LoyverseMapKind" AS ENUM ('ITEM', 'PAYMENT_TYPE', 'DISCOUNT', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('PAID_NOW', 'ON_ACCOUNT');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('WEEKLY', 'SEMI_MONTHLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CostClass" AS ENUM ('COGS', 'OPERATING_SUPPLY', 'FIXED_ASSET');

-- CreateEnum
CREATE TYPE "CountFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING', 'PURCHASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_LOSS', 'PRODUCTION_CONSUME', 'PRODUCTION_OUTPUT', 'WASTE', 'STAFF_MEAL', 'ADJUSTMENT', 'COUNT_USAGE');

-- CreateEnum
CREATE TYPE "CountType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'FULL', 'OPENING');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('WASTE', 'STAFF_MEAL', 'ADJUSTMENT', 'OPENING');

-- CreateEnum
CREATE TYPE "RecipeKind" AS ENUM ('PRODUCTION', 'MENU_ITEM', 'PACKAGE_PER_PAX');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatementLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'CREATED', 'IGNORED', 'INVESTIGATE');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING');

-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE_PAID', 'LEAVE_UNPAID', 'REST_DAY', 'HOLIDAY_OFF');

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM ('SSS', 'PHILHEALTH', 'PAGIBIG', 'WITHHOLDING_TAX');

-- CreateEnum
CREATE TYPE "PayrollRunType" AS ENUM ('REGULAR', 'THIRTEENTH_MONTH', 'FINAL_PAY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "PayItemKind" AS ENUM ('EARNING', 'DEDUCTION', 'EMPLOYER_SHARE');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('CASH_ADVANCE', 'COMPANY_LOAN', 'SSS_LOAN', 'PAGIBIG_LOAN');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "TaxEntity" (
    "id" TEXT NOT NULL,
    "registeredName" TEXT NOT NULL,
    "tin" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL DEFAULT '000',
    "taxMode" "TaxMode" NOT NULL DEFAULT 'NON_VAT',
    "percentageTaxRateBp" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "address" TEXT,
    "openedOn" DATE,
    "closedOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "taxEntityId" TEXT,
    "drawerFloatCents" BIGINT NOT NULL DEFAULT 0,
    "loyverseStoreId" TEXT,
    "loyverseTokenEnc" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locationId" TEXT,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "locationId" TEXT,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "locationId" TEXT,
    "effect" "PermissionEffect" NOT NULL,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "idleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "identifier" TEXT NOT NULL,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "locationId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustmentRequest" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proposedChanges" JSONB NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdjustmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "locationId" TEXT,
    "minAmountCents" BIGINT NOT NULL,
    "requiredPermission" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" "StatementSection" NOT NULL,
    "kpiTag" "KpiTag" NOT NULL DEFAULT 'NONE',
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "groupId" TEXT NOT NULL,
    "parentId" TEXT,
    "isPostable" BOOLEAN NOT NULL DEFAULT true,
    "systemKey" TEXT,
    "isIntercompany" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "periodId" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL,
    "sourceId" TEXT,
    "memo" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'POSTED',
    "reversesId" TEXT,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "counterpartyLocationId" TEXT,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,
    "date" DATE NOT NULL,
    "memo" TEXT,
    "supplierId" TEXT,
    "employeeId" TEXT,
    "reconciliationId" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "acquiredOn" DATE NOT NULL,
    "costCents" BIGINT NOT NULL,
    "salvageCents" BIGINT NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "assetAccountId" TEXT NOT NULL,
    "accumDepAccountId" TEXT NOT NULL,
    "depExpenseAccountId" TEXT NOT NULL,
    "disposedOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "journalEntryId" TEXT NOT NULL,

    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerEquityTransaction" (
    "id" TEXT NOT NULL,
    "type" "EquityTxnType" NOT NULL,
    "date" DATE NOT NULL,
    "locationId" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "memo" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerEquityTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sourceLocationId" TEXT NOT NULL,
    "accountId" TEXT,

    CONSTRAINT "AllocationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationShare" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "shareBp" INTEGER NOT NULL,

    CONSTRAINT "AllocationShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MoneyAccountKind" NOT NULL,
    "locationId" TEXT,
    "glAccountId" TEXT NOT NULL,
    "isPersonal" BOOLEAN NOT NULL DEFAULT false,
    "institution" TEXT,
    "accountRef" TEXT,
    "defaultStatementFormatId" TEXT,
    "lockedThrough" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "moneyAccountId" TEXT,
    "isDeferred" BOOLEAN NOT NULL DEFAULT false,
    "feeRateBp" INTEGER NOT NULL DEFAULT 0,
    "feeFixedCents" BIGINT NOT NULL DEFAULT 0,
    "withholdingRateBp" INTEGER NOT NULL DEFAULT 0,
    "settlementDelayDays" INTEGER NOT NULL DEFAULT 0,
    "settlesToMoneyAccountId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PaymentChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentChannelLocation" (
    "channelId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "PaymentChannelLocation_pkey" PRIMARY KEY ("channelId","locationId")
);

-- CreateTable
CREATE TABLE "MoneyTransfer" (
    "id" TEXT NOT NULL,
    "type" "MoneyTransferType" NOT NULL,
    "date" DATE NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "feeCents" BIGINT NOT NULL DEFAULT 0,
    "reference" TEXT,
    "notes" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'POSTED',
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashFund" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "imprestCents" BIGINT NOT NULL,
    "custodianUserId" TEXT,

    CONSTRAINT "PettyCashFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "paxPerUnit" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "revenueAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceCents" BIGINT NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("priceListId","productId")
);

-- CreateTable
CREATE TABLE "DiscountType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultRateBp" INTEGER,
    "requiresIdentity" BOOLEAN NOT NULL DEFAULT false,
    "contraAccountId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiscountType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReport" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "shiftNo" INTEGER NOT NULL DEFAULT 1,
    "source" "SalesSource" NOT NULL DEFAULT 'MANUAL',
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "grossCents" BIGINT NOT NULL DEFAULT 0,
    "discountCents" BIGINT NOT NULL DEFAULT 0,
    "voidCents" BIGINT NOT NULL DEFAULT 0,
    "serviceChargeCents" BIGINT NOT NULL DEFAULT 0,
    "netCents" BIGINT NOT NULL DEFAULT 0,
    "paymentsCents" BIGINT NOT NULL DEFAULT 0,
    "pax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "mismatchExplanation" TEXT,
    "cashierUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLine" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "pax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitPriceCents" BIGINT NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "source" "SalesSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "SalesLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDiscount" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "discountTypeId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "customerName" TEXT,
    "idNumber" TEXT,
    "receiptNo" TEXT,
    "notes" TEXT,

    CONSTRAINT "SalesDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoid" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "receiptNo" TEXT,
    "approvedById" TEXT,

    CONSTRAINT "SalesVoid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPayment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reference" TEXT,

    CONSTRAINT "SalesPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "openingFloatCents" BIGINT NOT NULL,
    "cashSalesCents" BIGINT NOT NULL,
    "cashExpensesCents" BIGINT NOT NULL,
    "otherCashInCents" BIGINT NOT NULL DEFAULT 0,
    "otherCashOutCents" BIGINT NOT NULL DEFAULT 0,
    "expectedCents" BIGINT NOT NULL,
    "countedCents" BIGINT NOT NULL,
    "overShortCents" BIGINT NOT NULL,
    "denominations" JSONB NOT NULL,
    "reason" TEXT,
    "countedById" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSettlement" (
    "id" TEXT NOT NULL,
    "salesPaymentId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "expectedOn" DATE NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "expectedFeeCents" BIGINT NOT NULL,
    "expectedWhtCents" BIGINT NOT NULL,
    "expectedNetCents" BIGINT NOT NULL,
    "actualNetCents" BIGINT,
    "actualFeeCents" BIGINT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'EXPECTED',
    "bankMatchId" TEXT,
    "journalEntryId" TEXT,

    CONSTRAINT "ChannelSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyverseImport" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kind" "LoyverseExportKind" NOT NULL,
    "fileName" TEXT,
    "attachmentId" TEXT,
    "dateFrom" DATE,
    "dateTo" DATE,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyverseImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyverseReceipt" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "receiptAt" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "grossCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL,
    "netCents" BIGINT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "cashierName" TEXT,
    "posDevice" TEXT,
    "importId" TEXT NOT NULL,
    "reportId" TEXT,

    CONSTRAINT "LoyverseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyverseReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "variantName" TEXT,
    "qty" DECIMAL(10,2) NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "discountCents" BIGINT NOT NULL,
    "productId" TEXT,

    CONSTRAINT "LoyverseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyverseMapping" (
    "id" TEXT NOT NULL,
    "kind" "LoyverseMapKind" NOT NULL,
    "locationId" TEXT,
    "externalName" TEXT NOT NULL,
    "productId" TEXT,
    "channelId" TEXT,
    "discountTypeId" TEXT,
    "userId" TEXT,
    "paxOverride" DECIMAL(6,2),

    CONSTRAINT "LoyverseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "termsDays" INTEGER NOT NULL DEFAULT 0,
    "defaultAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "supplierId" TEXT,
    "terms" "PaymentTerms" NOT NULL DEFAULT 'PAID_NOW',
    "dueDate" DATE,
    "receiptNo" TEXT,
    "isVatInvoice" BOOLEAN NOT NULL DEFAULT false,
    "vatCents" BIGINT NOT NULL DEFAULT 0,
    "totalCents" BIGINT NOT NULL,
    "paidCents" BIGINT NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "requiredApproval" TEXT,
    "notes" TEXT,
    "salesReportId" TEXT,
    "recurringId" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "itemId" TEXT,
    "qty" DECIMAL(18,4),
    "unit" TEXT,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpensePayment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpensePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "accountId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "terms" "PaymentTerms" NOT NULL DEFAULT 'ON_ACCOUNT',
    "moneyAccountId" TEXT,
    "frequency" "Frequency" NOT NULL,
    "dayOfMonth" INTEGER,
    "nextRunOn" DATE NOT NULL,
    "endOn" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCostClass" "CostClass" NOT NULL DEFAULT 'COGS',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "costClass" "CostClass" NOT NULL DEFAULT 'COGS',
    "baseUnit" TEXT NOT NULL,
    "purchaseUnit" TEXT,
    "purchaseToBase" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "isProduced" BOOLEAN NOT NULL DEFAULT false,
    "countFrequency" "CountFrequency" NOT NULL DEFAULT 'MONTHLY',
    "trackLots" BOOLEAN NOT NULL DEFAULT false,
    "inventoryAccountId" TEXT NOT NULL,
    "consumptionAccountId" TEXT NOT NULL,
    "preferredSupplierId" TEXT,
    "lastUnitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLocationSetting" (
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "isStocked" BOOLEAN NOT NULL DEFAULT true,
    "parLevel" DECIMAL(18,4),
    "reorderPoint" DECIMAL(18,4),
    "storageArea" TEXT,
    "countSortOrder" INTEGER NOT NULL DEFAULT 0,
    "countFrequency" "CountFrequency",
    "varianceToleranceBp" INTEGER,

    CONSTRAINT "ItemLocationSetting_pkey" PRIMARY KEY ("itemId","locationId")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "avgUnitCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("itemId","locationId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "type" "MovementType" NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "valueCents" BIGINT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lotId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "producedOn" DATE,
    "expiresOn" DATE,
    "qtyRemaining" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "countDate" DATE NOT NULL,
    "type" "CountType" NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "countedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "notes" TEXT,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "systemQty" DECIMAL(18,4) NOT NULL,
    "countedQty" DECIMAL(18,4) NOT NULL,
    "usageQty" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "usageCents" BIGINT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentLine" (
    "id" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6),
    "reason" TEXT,

    CONSTRAINT "StockAdjustmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RecipeKind" NOT NULL,
    "productId" TEXT,
    "outputItemId" TEXT,
    "outputQty" DECIMAL(18,4),
    "overheadPerUnitCents" BIGINT NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "locationId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "outputItemId" TEXT NOT NULL,
    "batchDate" DATE NOT NULL,
    "outputQty" DECIMAL(18,4) NOT NULL,
    "ingredientCents" BIGINT NOT NULL,
    "overheadCents" BIGINT NOT NULL DEFAULT 0,
    "totalCostCents" BIGINT NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "lotCode" TEXT,
    "expiresOn" DATE,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "producedById" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatchInput" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "standardQty" DECIMAL(18,4) NOT NULL,
    "actualQty" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "valueCents" BIGINT NOT NULL,

    CONSTRAINT "ProductionBatchInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "markupBp" INTEGER NOT NULL DEFAULT 0,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "dispatchJournalEntryId" TEXT,
    "receiveJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "qtySent" DECIMAL(18,4) NOT NULL,
    "qtyReceived" DECIMAL(18,4),
    "unitCost" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "valueCents" BIGINT NOT NULL,
    "discrepancyReason" TEXT,

    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferPresetLine" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "defaultQty" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "TransferPresetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementFormat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,

    CONSTRAINT "StatementFormat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "openingBalanceCents" BIGINT,
    "closingBalanceCents" BIGINT,
    "attachmentId" TEXT,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "txnDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountCents" BIGINT NOT NULL,
    "balanceCents" BIGINT,
    "dedupeHash" TEXT NOT NULL,
    "status" "StatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "note" TEXT,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatch" (
    "id" TEXT NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "score" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchLine" (
    "matchId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,

    CONSTRAINT "BankMatchLine_pkey" PRIMARY KEY ("matchId","statementLineId")
);

-- CreateTable
CREATE TABLE "BankMatchItem" (
    "matchId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,

    CONSTRAINT "BankMatchItem_pkey" PRIMARY KEY ("matchId","journalLineId")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "moneyAccountId" TEXT NOT NULL,
    "statementId" TEXT,
    "asOfDate" DATE NOT NULL,
    "statementBalanceCents" BIGINT NOT NULL,
    "bookBalanceCents" BIGINT NOT NULL,
    "outstandingDepositsCents" BIGINT NOT NULL,
    "outstandingWithdrawalsCents" BIGINT NOT NULL,
    "adjustedBalanceCents" BIGINT NOT NULL,
    "differenceCents" BIGINT NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "position" TEXT NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "sssNo" TEXT,
    "philhealthNo" TEXT,
    "pagibigNo" TEXT,
    "tin" TEXT,
    "isMinimumWageEarner" BOOLEAN NOT NULL DEFAULT true,
    "payoutMethod" TEXT,
    "payoutRef" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "EmployeeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "rateType" "RateType" NOT NULL,
    "rateCents" BIGINT NOT NULL,
    "daysPerYear" INTEGER NOT NULL DEFAULT 313,
    "allowances" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "locationId" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSheet" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "encodedById" TEXT NOT NULL,
    "approvedById" TEXT,

    CONSTRAINT "AttendanceSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEntry" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DayStatus" NOT NULL,
    "timeIn" TEXT,
    "timeOut" TEXT,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "otMinutes" INTEGER NOT NULL DEFAULT 0,
    "nightDiffMinutes" INTEGER NOT NULL DEFAULT 0,
    "isRestDayWork" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionTable" (
    "id" TEXT NOT NULL,
    "kind" "ContributionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'MONTHLY',

    CONSTRAINT "ContributionTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionBracket" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "minCents" BIGINT NOT NULL,
    "maxCents" BIGINT,
    "excessOverCents" BIGINT NOT NULL DEFAULT 0,
    "eeFixedCents" BIGINT NOT NULL DEFAULT 0,
    "eeRateBp" INTEGER NOT NULL DEFAULT 0,
    "erFixedCents" BIGINT NOT NULL DEFAULT 0,
    "erRateBp" INTEGER NOT NULL DEFAULT 0,
    "ecFixedCents" BIGINT NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "ContributionBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "type" "PayrollRunType" NOT NULL DEFAULT 'REGULAR',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "preparedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "daysWorked" DECIMAL(6,2) NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "deductionsCents" BIGINT NOT NULL,
    "netCents" BIGINT NOT NULL,
    "employerCostCents" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineItem" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "kind" "PayItemKind" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" BIGINT NOT NULL,
    "locationId" TEXT NOT NULL,
    "loanId" TEXT,

    CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "LoanType" NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "perPayrollCents" BIGINT NOT NULL,
    "balanceCents" BIGINT NOT NULL,
    "startDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "locationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "grossSalesCents" BIGINT NOT NULL DEFAULT 0,
    "discountsCents" BIGINT NOT NULL DEFAULT 0,
    "netSalesCents" BIGINT NOT NULL DEFAULT 0,
    "pax" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cogsCents" BIGINT NOT NULL DEFAULT 0,
    "laborCents" BIGINT NOT NULL DEFAULT 0,
    "opexCents" BIGINT NOT NULL DEFAULT 0,
    "byChannel" JSONB NOT NULL DEFAULT '{}',
    "wingsUsedQty" DECIMAL(18,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("locationId","date")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "locationId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "mapping" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "details" JSONB,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxEntity_tin_branchCode_key" ON "TaxEntity"("tin", "branchCode");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_loyverseStoreId_key" ON "Location"("loyverseStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_locationId_key" ON "Setting"("key", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_userId_roleId_locationId_key" ON "RoleAssignment"("userId", "roleId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permissionKey_locationId_key" ON "UserPermission"("userId", "permissionKey", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_tokenHash_key" ON "Device"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginAttempt_identifier_at_idx" ON "LoginAttempt"("identifier", "at");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_at_idx" ON "LoginAttempt"("ip", "at");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_locationId_at_idx" ON "AuditLog"("locationId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_userId_at_idx" ON "AuditLog"("userId", "at");

-- CreateIndex
CREATE INDEX "AdjustmentRequest_status_locationId_idx" ON "AdjustmentRequest"("status", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storagePath_key" ON "Attachment"("storagePath");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_code_key" ON "AccountGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_systemKey_key" ON "Account"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_year_month_key" ON "AccountingPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesId_key" ON "JournalEntry"("reversesId");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "JournalEntry"("source", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_locationId_date_idx" ON "JournalLine"("accountId", "locationId", "date");

-- CreateIndex
CREATE INDEX "JournalLine_locationId_date_idx" ON "JournalLine"("locationId", "date");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciation_journalEntryId_key" ON "FixedAssetDepreciation"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAssetDepreciation_assetId_year_month_key" ON "FixedAssetDepreciation"("assetId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerEquityTransaction_journalEntryId_key" ON "OwnerEquityTransaction"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationShare_ruleId_locationId_key" ON "AllocationShare"("ruleId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_year_month_locationId_accountId_key" ON "BudgetLine"("year", "month", "locationId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyAccount_glAccountId_key" ON "MoneyAccount"("glAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyTransfer_journalEntryId_key" ON "MoneyTransfer"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashFund_moneyAccountId_key" ON "PettyCashFund"("moneyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountType_code_key" ON "DiscountType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReport_journalEntryId_key" ON "SalesReport"("journalEntryId");

-- CreateIndex
CREATE INDEX "SalesReport_businessDate_idx" ON "SalesReport"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReport_locationId_businessDate_shiftNo_key" ON "SalesReport"("locationId", "businessDate", "shiftNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPayment_reportId_channelId_key" ON "SalesPayment"("reportId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCount_reportId_key" ON "CashCount"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSettlement_salesPaymentId_key" ON "ChannelSettlement"("salesPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSettlement_journalEntryId_key" ON "ChannelSettlement"("journalEntryId");

-- CreateIndex
CREATE INDEX "ChannelSettlement_status_expectedOn_idx" ON "ChannelSettlement"("status", "expectedOn");

-- CreateIndex
CREATE INDEX "LoyverseReceipt_locationId_businessDate_idx" ON "LoyverseReceipt"("locationId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoyverseReceipt_locationId_receiptNumber_key" ON "LoyverseReceipt"("locationId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoyverseMapping_kind_locationId_externalName_key" ON "LoyverseMapping"("kind", "locationId", "externalName");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_number_key" ON "Expense"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");

-- CreateIndex
CREATE INDEX "Expense_locationId_date_idx" ON "Expense"("locationId", "date");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExpensePayment_journalEntryId_key" ON "ExpensePayment"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_name_key" ON "ItemCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_locationId_businessDate_idx" ON "StockMovement"("itemId", "locationId", "businessDate");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_journalEntryId_key" ON "StockCount"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_locationId_countDate_type_key" ON "StockCount"("locationId", "countDate", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_itemId_key" ON "StockCountLine"("countId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_journalEntryId_key" ON "StockAdjustment"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeLine_recipeId_itemId_key" ON "RecipeLine"("recipeId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_number_key" ON "ProductionBatch"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_journalEntryId_key" ON "ProductionBatch"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_number_key" ON "Transfer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_dispatchJournalEntryId_key" ON "Transfer"("dispatchJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_receiveJournalEntryId_key" ON "Transfer"("receiveJournalEntryId");

-- CreateIndex
CREATE INDEX "Transfer_toLocationId_status_idx" ON "Transfer"("toLocationId", "status");

-- CreateIndex
CREATE INDEX "Transfer_fromLocationId_dispatchedAt_idx" ON "Transfer"("fromLocationId", "dispatchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatementFormat_name_key" ON "StatementFormat"("name");

-- CreateIndex
CREATE INDEX "BankStatementLine_dedupeHash_idx" ON "BankStatementLine"("dedupeHash");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_statementId_lineNo_key" ON "BankStatementLine"("statementId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_locationId_key" ON "Holiday"("date", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSheet_locationId_periodStart_key" ON "AttendanceSheet"("locationId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceEntry_employeeId_date_key" ON "AttendanceEntry"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_journalEntryId_key" ON "PayrollRun"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_type_periodStart_periodEnd_key" ON "PayrollRun"("type", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_taxEntityId_fkey" FOREIGN KEY ("taxEntityId") REFERENCES "TaxEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRule" ADD CONSTRAINT "ApprovalRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_counterpartyLocationId_fkey" FOREIGN KEY ("counterpartyLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerEquityTransaction" ADD CONSTRAINT "OwnerEquityTransaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerEquityTransaction" ADD CONSTRAINT "OwnerEquityTransaction_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRule" ADD CONSTRAINT "AllocationRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationShare" ADD CONSTRAINT "AllocationShare_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AllocationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationShare" ADD CONSTRAINT "AllocationShare_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyAccount" ADD CONSTRAINT "MoneyAccount_defaultStatementFormatId_fkey" FOREIGN KEY ("defaultStatementFormatId") REFERENCES "StatementFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentChannel" ADD CONSTRAINT "PaymentChannel_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentChannelLocation" ADD CONSTRAINT "PaymentChannelLocation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentChannelLocation" ADD CONSTRAINT "PaymentChannelLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyTransfer" ADD CONSTRAINT "MoneyTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountType" ADD CONSTRAINT "DiscountType_contraAccountId_fkey" FOREIGN KEY ("contraAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReport" ADD CONSTRAINT "SalesReport_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLine" ADD CONSTRAINT "SalesLine_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLine" ADD CONSTRAINT "SalesLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDiscount" ADD CONSTRAINT "SalesDiscount_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDiscount" ADD CONSTRAINT "SalesDiscount_discountTypeId_fkey" FOREIGN KEY ("discountTypeId") REFERENCES "DiscountType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoid" ADD CONSTRAINT "SalesVoid_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPayment" ADD CONSTRAINT "SalesPayment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSettlement" ADD CONSTRAINT "ChannelSettlement_salesPaymentId_fkey" FOREIGN KEY ("salesPaymentId") REFERENCES "SalesPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSettlement" ADD CONSTRAINT "ChannelSettlement_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSettlement" ADD CONSTRAINT "ChannelSettlement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSettlement" ADD CONSTRAINT "ChannelSettlement_bankMatchId_fkey" FOREIGN KEY ("bankMatchId") REFERENCES "BankMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseImport" ADD CONSTRAINT "LoyverseImport_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseReceipt" ADD CONSTRAINT "LoyverseReceipt_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseReceipt" ADD CONSTRAINT "LoyverseReceipt_importId_fkey" FOREIGN KEY ("importId") REFERENCES "LoyverseImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseReceipt" ADD CONSTRAINT "LoyverseReceipt_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SalesReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseReceiptLine" ADD CONSTRAINT "LoyverseReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "LoyverseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseReceiptLine" ADD CONSTRAINT "LoyverseReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseMapping" ADD CONSTRAINT "LoyverseMapping_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseMapping" ADD CONSTRAINT "LoyverseMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyverseMapping" ADD CONSTRAINT "LoyverseMapping_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_salesReportId_fkey" FOREIGN KEY ("salesReportId") REFERENCES "SalesReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpensePayment" ADD CONSTRAINT "ExpensePayment_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_consumptionAccountId_fkey" FOREIGN KEY ("consumptionAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationSetting" ADD CONSTRAINT "ItemLocationSetting_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationSetting" ADD CONSTRAINT "ItemLocationSetting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentLine" ADD CONSTRAINT "StockAdjustmentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_outputItemId_fkey" FOREIGN KEY ("outputItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInput" ADD CONSTRAINT "ProductionBatchInput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatchInput" ADD CONSTRAINT "ProductionBatchInput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPreset" ADD CONSTRAINT "TransferPreset_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPreset" ADD CONSTRAINT "TransferPreset_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPresetLine" ADD CONSTRAINT "TransferPresetLine_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "TransferPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPresetLine" ADD CONSTRAINT "TransferPresetLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "StatementFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "BankMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchItem" ADD CONSTRAINT "BankMatchItem_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "BankMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchItem" ADD CONSTRAINT "BankMatchItem_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_moneyAccountId_fkey" FOREIGN KEY ("moneyAccountId") REFERENCES "MoneyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAssignment" ADD CONSTRAINT "EmployeeAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSheet" ADD CONSTRAINT "AttendanceSheet_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AttendanceSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceEntry" ADD CONSTRAINT "AttendanceEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionBracket" ADD CONSTRAINT "ContributionBracket_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "ContributionTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "PayrollLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "EmployeeLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
