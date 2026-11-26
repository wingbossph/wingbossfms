-- Grab gross sales per branch-day and Grab payouts, tracked outside the sales totals.
CREATE TABLE "GrabDailySale" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "grossCents" BIGINT NOT NULL,
    "notes" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrabDailySale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GrabDailySale_locationId_businessDate_key" ON "GrabDailySale"("locationId", "businessDate");
ALTER TABLE "GrabDailySale" ADD CONSTRAINT "GrabDailySale_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GrabRemittance" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "remittedOn" DATE NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GrabRemittance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GrabRemittance_locationId_remittedOn_idx" ON "GrabRemittance"("locationId", "remittedOn");
ALTER TABLE "GrabRemittance" ADD CONSTRAINT "GrabRemittance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
