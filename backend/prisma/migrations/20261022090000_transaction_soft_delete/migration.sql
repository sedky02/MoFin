-- Transactions become editable records with a soft delete; voiding goes away.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Existing void pairs become soft-deleted pairs. Each voided original and its
-- reversal summed to zero, so taking both out of every balance changes nothing.
-- The original is deleted when it was voided; the reversal when it was created
-- (the same moment).
UPDATE "Transaction" SET "deletedAt" = "voidedAt" WHERE "voidedAt" IS NOT NULL;
UPDATE "Transaction" SET "deletedAt" = "createdAt" WHERE "reversesTransactionId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_reversesTransactionId_fkey";

-- DropIndex
DROP INDEX "Transaction_reversesTransactionId_key";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "reversesTransactionId",
DROP COLUMN "voidedAt";

-- CreateIndex
CREATE INDEX "Transaction_userId_deletedAt_idx" ON "Transaction"("userId", "deletedAt");
