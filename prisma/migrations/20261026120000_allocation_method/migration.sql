-- CreateEnum
CREATE TYPE "AllocationMethod" AS ENUM ('FIXED_SHARES', 'TRANSFER_VALUE');

-- AlterTable
ALTER TABLE "AllocationRule" ADD COLUMN     "method" "AllocationMethod" NOT NULL DEFAULT 'FIXED_SHARES';

