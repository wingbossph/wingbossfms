-- Fund: cash brought into a day's drawer for expenses, from earlier days' cash on hand.
CREATE TABLE "SalesFund" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesFund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesFund_locationId_businessDate_key" ON "SalesFund"("locationId", "businessDate");
ALTER TABLE "SalesFund" ADD CONSTRAINT "SalesFund_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FundSource" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "amountCents" BIGINT NOT NULL,
    CONSTRAINT "FundSource_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FundSource" ADD CONSTRAINT "FundSource_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "SalesFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
